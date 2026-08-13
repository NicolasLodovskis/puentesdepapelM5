import 'server-only';

import type Database from 'better-sqlite3';

import { plegarTexto } from '@/lib/dominio/plegar-texto';

import { obtenerDb } from './conexion';
import type { EstadoLibro, Libro } from './tipos';

/**
 * Cota del término de búsqueda.
 *
 * Es la misma cota que el esquema le pone a `titulo` y a `editorial`
 * (`lib/db/migraciones/001-inicial.ts`), y por eso truncar no cambia ningún resultado:
 * ningún título almacenado puede ser más largo, así que un término de 500 caracteres no
 * tendría coincidencias de todos modos. Se trunca igual para no armar patrones de longitud
 * arbitraria con texto que llega de la barra de direcciones.
 */
const LARGO_MAXIMO_TERMINO = 300;

/**
 * Los tres caracteres que hay que neutralizar antes de meter el término en un `LIKE`:
 * los dos comodines de SQL y la propia barra invertida, que es el carácter de escape.
 *
 * La barra invertida va **en la clase de caracteres**, no en un `replace` aparte antes:
 * escapar primero `%` y `_` y después la barra volvería a escapar las barras que acabamos
 * de agregar, y `100%` terminaría buscándose como `100\\%`. Con una sola pasada eso no puede
 * pasar. Sin cuantificadores anidados: el costo es lineal (riesgo R12).
 */
const COMODINES = /[\\%_]/gu;

/** La rama del término vacío: sin `LIKE` que filtre, porque AC-07 pide todo el catálogo. */
const SQL_CATALOGO_ACTIVO = `
  SELECT id, titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
         stock, precio, estado, creado_en
    FROM libros
   WHERE estado = 'activo'
   ORDER BY titulo_orden
`;

/**
 * La misma consulta, filtrada por el término.
 *
 * La lista de columnas está repetida palabra por palabra en vez de compartida por
 * concatenación, y es a propósito: una sentencia armada con `+` o con `${}` es exactamente
 * el patrón que la mitigación 2 prohíbe, y una vez que existe la costumbre nadie distingue
 * el pedazo constante del pedazo con entrada del usuario. Las dos sentencias son literales
 * fijos, auditables de un vistazo.
 *
 * El patrón se ata **dos veces**, una por columna. La spec lo escribe como un único `?1`
 * usado en las dos comparaciones, pero better-sqlite3 trata `?1` como parámetro *nombrado*
 * y rechaza atarlo por posición (`Too many parameter values were provided`): dos `?` con el
 * mismo valor son la traducción fiel de esa intención sin salir de los parámetros
 * posicionales.
 *
 * `ESCAPE '\'` no es opcional: sin él la barra invertida del término escapado sería un
 * carácter común y `100\%` no matchearía nada (mitigación 3). En el fuente se escribe con
 * **dos** barras porque el literal de plantilla las colapsa en una; con una sola, la
 * sentencia llegaría a SQLite con `ESCAPE ''` y el motor la rechazaría.
 */
const SQL_BUSCAR_ACTIVOS = `
  SELECT id, titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
         stock, precio, estado, creado_en
    FROM libros
   WHERE estado = 'activo'
     AND (titulo_orden LIKE ? ESCAPE '\\'
          OR editorial_normalizada LIKE ? ESCAPE '\\')
   ORDER BY titulo_orden
`;

/**
 * La lectura de un libro por su clave primaria (FR-01).
 *
 * Vive acá y no en `libros.ts`: éste es el módulo de lectura. El `SQL_LEER_LIBRO` de aquel es un
 * helper privado de post-`INSERT` que relee la fila recién escrita dentro de su propia
 * transacción, **sin filtro de estado**; reusarlo para la vista de detalle mostraría los libros
 * archivados el día que exista la baja lógica.
 *
 * El `estado = 'activo'` no es decoración: es la única de las tres reglas de la guardia de este
 * archivo que ningún test de negocio cubre hoy (riesgo R6). Un libro archivado tiene que ser
 * indistinguible de uno inexistente, y por eso la sentencia filtra en vez de que lo haga el
 * llamador.
 *
 * **No lleva `ORDER BY`**, y es la excepción que la guardia de este módulo reconoce por su
 * filtro de clave primaria: ordenar una sentencia que devuelve una fila es escribir un `ORDER BY`
 * de adorno.
 */
const SQL_LIBRO_POR_ID = `
  SELECT id, titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
         stock, precio, estado, creado_en
    FROM libros
   WHERE estado = 'activo'
     AND id = ?
`;

/** Una fila de `libros` como la devuelve SQLite: columnas en snake_case. */
interface FilaLibro {
  id: number;
  titulo: string;
  titulo_normalizado: string;
  titulo_orden: string;
  editorial: string;
  editorial_normalizada: string;
  stock: number;
  precio: number;
  estado: EstadoLibro;
  creado_en: string;
}

/**
 * Mapea fila → objeto de dominio. Va explícito porque las columnas son snake_case y
 * `Libro` es camelCase: better-sqlite3 devuelve las claves tal como están en la tabla y no
 * convierte nada.
 */
function aLibro(fila: FilaLibro): Libro {
  return {
    id: fila.id,
    titulo: fila.titulo,
    tituloNormalizado: fila.titulo_normalizado,
    tituloOrden: fila.titulo_orden,
    editorial: fila.editorial,
    editorialNormalizada: fila.editorial_normalizada,
    stock: fila.stock,
    precio: fila.precio,
    estado: fila.estado,
    creadoEn: fila.creado_en,
  };
}

/**
 * Neutraliza los comodines del término para que se busquen como literales.
 *
 * Sin esto, `100%` se convierte en el patrón `%100%%`, que matchea cualquier título con
 * `100` adentro y devuelve medio catálogo; y `a_b` matchea `la barca`.
 */
function escaparComodines(texto: string): string {
  return texto.replace(COMODINES, (comodin) => `\\${comodin}`);
}

/**
 * Recorta el término y lo acota antes de plegarlo. `null` y `undefined` no son un error:
 * la página puede no traer el parámetro de búsqueda, y eso es el catálogo completo.
 */
function acotar(termino: string | null | undefined): string {
  const texto = typeof termino === 'string' ? termino : '';
  return plegarTexto(texto.trim().slice(0, LARGO_MAXIMO_TERMINO));
}

/**
 * Devuelve el catálogo **activo**, filtrado por el término si hay uno (FR-04).
 *
 * Las dos sentencias filtran `estado = 'activo'`. Hoy es un no-op porque nada archiva, pero
 * PRD-001 RF-10 pide el catálogo activo: si no filtrara desde el primer día, el día que
 * llegue la baja lógica los archivados aparecerían en el listado y ningún test de este
 * sub-ticket se pondría rojo.
 *
 * El término se pliega con `plegarTexto()` —y **no** con `normalizarTitulo()`: mover el
 * artículo al frente de un fragmento suelto no significa nada— y se compara contra las dos
 * columnas plegadas, que es lo que hace la búsqueda insensible a mayúsculas y a acentos
 * (AC-06). Un término vacío, de sólo espacios, `null` o `undefined` devuelve el catálogo
 * completo (AC-07).
 *
 * El orden sale de `titulo_orden`, **nunca** de `titulo_normalizado`. Son columnas distintas
 * a propósito: la identidad mueve el artículo al frente, así que ordenar por ella pondría
 * `"Cuentos, Los"` entre las **L**. Con `titulo_orden` cada libro aparece donde empieza su
 * título.
 *
 * Un fallo de la consulta se propaga sin capturar: es un fallo de infraestructura, y
 * devolver una lista vacía lo haría pasar por "no hay libros" (lo maneja `app/error.tsx`).
 *
 * **Contrato para el Bloque 5.** En App Router un parámetro de query repetido (`?q=a&q=b`)
 * llega como `string[]`, que esta firma rechaza en compilación. Ese error es la advertencia,
 * no el problema: si el llamador lo silencia con un `as string`, el array degrada a `''` y la
 * página devuelve el catálogo completo ignorando la búsqueda, sin fallar. El Bloque 5 tiene
 * que colapsar el array explícitamente —quedarse con el primer valor, o con el último— y
 * nunca con un cast.
 *
 * `db` se recibe por parámetro con `obtenerDb()` por defecto, igual que en `libros.ts`: en
 * producción nadie lo pasa y sale la conexión única; los tests le dan una base `:memory:`
 * migrada desde cero, sin tener que interceptar el módulo de conexión.
 */
export function buscarLibros(
  termino: string | null | undefined,
  db: Database.Database = obtenerDb(),
): Libro[] {
  const acotado = acotar(termino);

  if (acotado === '') {
    return (db.prepare(SQL_CATALOGO_ACTIVO).all() as FilaLibro[]).map(aLibro);
  }

  const patron = `%${escaparComodines(acotado)}%`;

  return (db.prepare(SQL_BUSCAR_ACTIVOS).all(patron, patron) as FilaLibro[]).map(aLibro);
}

/**
 * Devuelve el libro **activo** con ese id, o `undefined` (FR-01).
 *
 * El `undefined` cubre los dos casos —no existe, o está archivado— y la ruta responde lo mismo a
 * los dos: la vista de detalle no distingue "no está" de "no se muestra". Que un archivado dé lo
 * mismo que un inexistente es una decisión escrita, y PRD-001 RF-25 (consulta de archivados) va a
 * chocar contra ella: ese día la lectura de archivados entra por otra función con su propio
 * filtro, no aflojando ésta.
 *
 * Recibe un `number` ya validado: el segmento de la URL lo valida la ruta **antes** de llegar
 * acá (M1). El parámetro viaja ligado por `?`, nunca interpolado.
 *
 * Un fallo de la consulta se propaga sin capturar, igual que en la búsqueda: es un fallo de
 * infraestructura y devolver `undefined` lo haría pasar por "ese libro no existe".
 */
export function leerLibroPorId(id: number, db: Database.Database = obtenerDb()): Libro | undefined {
  const fila = db.prepare(SQL_LIBRO_POR_ID).get(id) as FilaLibro | undefined;

  return fila === undefined ? undefined : aLibro(fila);
}
