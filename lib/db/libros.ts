import 'server-only';

import type Database from 'better-sqlite3';

import { normalizarTitulo } from '@/lib/dominio/normalizar-titulo';
import { parsearPrecio } from '@/lib/dominio/parsear-precio';
import { plegarTexto } from '@/lib/dominio/plegar-texto';

import { obtenerDb } from './conexion';
import type { CampoLibro, ErrorCampo, LibroEnConflicto, ResultadoCrearLibro } from './errores';
import type { EstadoLibro, Libro, OrigenPrecio, OrigenStock } from './tipos';

/**
 * Entrada de un alta, tal como llega del `FormData` del Bloque 5.
 *
 * Los cuatro campos son `unknown` a propósito: el `FormData` de un Server Action no es
 * confiable —la usuaria puede alterar el HTML, y `FormData.get()` puede devolver `null` o
 * un `File`—, así que la barrera es la validación en tiempo de ejecución de acá abajo
 * (mitigación 7) y no una firma que el compilador borra. Tipar `stock: number` habría
 * dejado pasar cualquier cosa en runtime con la falsa sensación de estar validado.
 */
export interface EntradaLibro {
  titulo: unknown;
  editorial: unknown;
  stock: unknown;
  precio: unknown;
}

/**
 * Cota de los dos campos de texto. Duplica el `CHECK` del esquema
 * (`lib/db/migraciones/001-inicial.ts`) porque la spec lo pide así: acá está la validación
 * que informa el motivo, y el `CHECK` es la última barrera si algún día alguien escribe
 * por otro camino.
 *
 * Se cuenta con `String.length` (unidades UTF-16) mientras `length()` de SQLite cuenta
 * caracteres: para un par surrogado esta cota es la **más** estricta de las dos, así que
 * nunca deja pasar algo que el `CHECK` fuera a rechazar después.
 */
const LARGO_MAXIMO_TEXTO = 300;

const STOCK_MINIMO = 0;
const STOCK_MAXIMO = 1_000_000;

/** Entero con signo opcional. Sin cuantificadores anidados (riesgo R12). */
const ENTERO = /^-?\d+$/u;

/** Todo libro nace activo: la baja es lógica y posterior (AC-08). */
const ESTADO_INICIAL: EstadoLibro = 'activo';

/**
 * Origen de las dos entradas de historial del alta.
 *
 * El tipo es la **intersección** de los dos conjuntos de orígenes a propósito: `libros.ts`
 * escribe en las dos tablas y las dos listas son distintas (una venta nunca cambia un
 * precio), así que sólo un literal admitido por ambas puede sentarse acá.
 */
const ORIGEN_ALTA: OrigenPrecio & OrigenStock = 'alta manual';

/**
 * Antes del alta no hay precio ni stock: las dos primeras entradas de historial arrancan
 * de 0. Por eso `historial_precio.precio_anterior` es `>= 0` y no `> 0` (AC-01).
 */
const SIN_ANTECEDENTE = 0;

/**
 * Mensaje del único fallo que `crearLibro()` fabrica.
 *
 * Es genérico y no menciona tablas, columnas ni códigos de SQLite: el error del motor
 * nunca sale hacia arriba (mitigación 8, riesgo R10).
 */
const ERROR_UNIQUE_SIN_CONFLICTO =
  'No se pudo dar de alta el libro: la base rechazó la identidad del título, ' +
  'pero el libro en conflicto no aparece en el catálogo.';

const SQL_BUSCAR_CONFLICTO = `
  SELECT id, titulo, editorial
    FROM libros
   WHERE titulo_normalizado = ?
`;

const SQL_INSERTAR_LIBRO = `
  INSERT INTO libros
    (titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
     stock, precio, estado, creado_en)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SQL_LEER_LIBRO = `
  SELECT id, titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
         stock, precio, estado, creado_en
    FROM libros
   WHERE id = ?
`;

const SQL_INSERTAR_PRECIO = `
  INSERT INTO historial_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
  VALUES (?, ?, ?, ?, ?)
`;

const SQL_INSERTAR_STOCK = `
  INSERT INTO historial_stock (libro_id, fecha, cantidad_anterior, cantidad_resultante, origen)
  VALUES (?, ?, ?, ?, ?)
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

/** Un campo validado: o su valor ya interpretado, o el motivo del rechazo. */
type CampoValidado<T> = { ok: true; valor: T } | { ok: false; error: ErrorCampo };

/**
 * Valida un campo de texto **sobre el valor recortado**: `NOT NULL` no rechaza la cadena
 * vacía y `"   "` es un título vacío.
 *
 * Un valor que no es `string` —el `null` de un campo ausente del `FormData`, o un `File`—
 * se reporta como `vacio`, que es el único motivo que la spec admite para estos campos.
 * No se lo convierte con `String()`: eso sería inventar el dato que falta (Principio II).
 */
function validarTexto(valor: unknown, campo: CampoLibro): CampoValidado<string> {
  const recortado = typeof valor === 'string' ? valor.trim() : '';

  if (recortado === '') {
    return { ok: false, error: { campo, detalle: 'vacio' } };
  }

  if (recortado.length > LARGO_MAXIMO_TEXTO) {
    return { ok: false, error: { campo, detalle: 'demasiado_largo' } };
  }

  return { ok: true, valor: recortado };
}

/** Interpreta un entero, sin redondear ni truncar nada. `undefined` si no lo es. */
function interpretarEntero(valor: unknown): number | undefined {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) ? valor : undefined;
  }

  if (typeof valor !== 'string') {
    return undefined;
  }

  const recortado = valor.trim();
  return ENTERO.test(recortado) ? Number(recortado) : undefined;
}

/**
 * Valida `stock`: entero entre 0 y 1.000.000.
 *
 * El campo ausente y el texto no numérico caen los dos en `no_entero`, el único motivo que
 * la spec ofrece para ese caso, y es literalmente cierto: ni `""` ni `null` son enteros.
 * Un negativo, en cambio, **sí** es entero y sale como `fuera_de_rango`.
 */
function validarStock(valor: unknown): CampoValidado<number> {
  const entero = interpretarEntero(valor);

  if (entero === undefined) {
    return { ok: false, error: { campo: 'stock', detalle: 'no_entero' } };
  }

  if (entero < STOCK_MINIMO || entero > STOCK_MAXIMO) {
    return { ok: false, error: { campo: 'stock', detalle: 'fuera_de_rango' } };
  }

  return { ok: true, valor: entero };
}

/**
 * Valida `precio` delegando en `parsearPrecio()` y **trasladando su motivo tal cual**:
 * `decimal`, `separador_miles`, `ausente`, `no_numerico` o `fuera_de_rango`. Reagruparlos
 * acá le sacaría a la usuaria la única pista de por qué le rechazaron el precio.
 */
function validarPrecio(valor: unknown): CampoValidado<number> {
  const interpretable =
    valor === null || valor === undefined || typeof valor === 'string' || typeof valor === 'number';

  if (!interpretable) {
    // Un `File` de un `FormData` manipulado no es numérico. No se lo pasa por `String()`:
    // convertirlo sería inventar un precio.
    return { ok: false, error: { campo: 'precio', detalle: 'no_numerico' } };
  }

  const precio = parsearPrecio(valor);

  return precio.ok
    ? { ok: true, valor: precio.valor }
    : { ok: false, error: { campo: 'precio', detalle: precio.motivo } };
}

/** Junta los rechazos en el orden de los campos del formulario: uno por campo, nunca dos. */
function recolectarErrores(...campos: Array<CampoValidado<unknown>>): ErrorCampo[] {
  return campos.flatMap((campo) => (campo.ok ? [] : [campo.error]));
}

/**
 * Busca el libro que ya ocupa una identidad. Devuelve `titulo` y `editorial` tal como
 * están almacenados, porque AC-03 exige **nombrar** el libro en conflicto y un
 * `SQLITE_CONSTRAINT_UNIQUE` sólo da el nombre del índice.
 */
function buscarConflicto(
  db: Database.Database,
  tituloNormalizado: string,
): LibroEnConflicto | undefined {
  return db.prepare(SQL_BUSCAR_CONFLICTO).get(tituloNormalizado) as LibroEnConflicto | undefined;
}

/** Relee la fila recién insertada para devolver exactamente lo que quedó almacenado. */
function leerLibro(db: Database.Database, id: number): Libro {
  const fila = db.prepare(SQL_LEER_LIBRO).get(id) as FilaLibro | undefined;

  if (fila === undefined) {
    // Inalcanzable: la lectura ocurre en la misma transacción que el INSERT.
    throw new Error('El libro recién insertado no se puede releer.');
  }

  return aLibro(fila);
}

/**
 * ¿Es la violación de **alguna** restricción `UNIQUE`?
 *
 * Se llama así, y no `esUniqueDeIdentidad`, porque es exactamente lo que comprueba: el
 * `code` no dice *qué* restricción se violó. Que el `catch` de abajo lo trate como un choque
 * de identidad del título es correcto sólo mientras `libros` tenga una sola restricción
 * `UNIQUE`, y eso no es una propiedad de esta función sino del esquema: lo vigila el
 * test-guardia "mantiene una sola restricción UNIQUE en libros" de `test/db/libros.test.ts`.
 * El día que aparezca otra —por ejemplo un `UNIQUE (libro_id, fecha)` en un historial, que
 * es plausible porque los pasos 5 y 6 comparten el mismo `ahora` al milisegundo—, ese test
 * se pone rojo y hay que discriminar acá antes de seguir.
 *
 * Se mira `code`, que es el contrato estable de `SqliteError`, y no el texto del mensaje.
 * Se hace por duck typing en vez de con `instanceof`: importar el driver como **valor**
 * sólo para comparar la clase le agregaría al repositorio una dependencia de runtime que
 * no necesita para nada más.
 */
function esViolacionDeUnique(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Da de alta un libro. Es el **único** camino de escritura de la tabla `libros`.
 *
 * Devuelve una unión discriminada y **no lanza por una condición de negocio**: el campo
 * inválido y el título duplicado son valores de retorno. Sólo se propaga un fallo de
 * infraestructura —la conexión, o un `INSERT` de historial que falla—, que el Bloque 5
 * traduce a un mensaje genérico.
 *
 * Los seis pasos —validar, derivar la identidad, buscar el conflicto y los tres `INSERT`—
 * ocurren dentro de **una sola** transacción. Los pasos 4, 5 y 6 son inseparables
 * (Principio III): no hay escritura de stock ni de precio sin su entrada de historial, y un
 * fallo en cualquiera de los tres revierte los otros dos. Se usa la variante `immediate`
 * porque un `BEGIN` diferido no toma el lock de escritura hasta el primer `INSERT`, y la
 * gracia de tener el `SELECT` de conflicto acá adentro es que no quede ventana entre
 * comprobar y escribir.
 *
 * `db` se recibe por parámetro con `obtenerDb()` por defecto: en producción nadie lo pasa
 * y sale la conexión única; los tests le dan una base `:memory:` migrada desde cero, sin
 * tener que interceptar el módulo de conexión.
 *
 * > **Invariante para features posteriores.** `titulo_normalizado`, `titulo_orden` y
 * > `editorial_normalizada` son columnas **derivadas y almacenadas**. Todo camino que
 * > escriba `titulo` o `editorial` **debe** recalcularlas en la misma sentencia. FEAT-001b
 * > implementa la edición de título y editorial (PRD-001 RF-23/RF-24): si actualiza
 * > `titulo` sin recalcular `titulo_normalizado`, la identidad del catálogo se
 * > desincroniza en silencio, la unicidad deja de valer y los dos flujos de Excel matchean
 * > contra el libro equivocado. Ese recálculo vive en este archivo y en ningún otro lado.
 */
export function crearLibro(
  entrada: EntradaLibro,
  db: Database.Database = obtenerDb(),
): ResultadoCrearLibro {
  const alta = db.transaction((): ResultadoCrearLibro => {
    // 1. Validar. Si algo falla, no se toca la base.
    const titulo = validarTexto(entrada.titulo, 'titulo');
    const editorial = validarTexto(entrada.editorial, 'editorial');
    const stock = validarStock(entrada.stock);
    const precio = validarPrecio(entrada.precio);

    if (!titulo.ok || !editorial.ok || !stock.ok || !precio.ok) {
      return {
        ok: false,
        motivo: 'campos_invalidos',
        errores: recolectarErrores(titulo, editorial, stock, precio),
      };
    }

    // 2. Derivar las tres columnas calculadas (ver el invariante de arriba).
    const tituloNormalizado = normalizarTitulo(titulo.valor);
    const tituloOrden = plegarTexto(titulo.valor);
    const editorialNormalizada = plegarTexto(editorial.valor);

    if (tituloNormalizado === '') {
      // Un título sin letras ni dígitos —`"¿¡?!"`— no es vacío, pero su identidad sí, y el
      // esquema exige `length(titulo_normalizado) >= 1`. Se rechaza acá con el motivo del
      // campo en vez de dejar que salte el CHECK: ese error no se puede propagar
      // (mitigación 8) y tampoco es un fallo de infraestructura.
      return {
        ok: false,
        motivo: 'campos_invalidos',
        errores: [{ campo: 'titulo', detalle: 'vacio' }],
      };
    }

    // 3. Conflicto de identidad, en esta misma transacción.
    const conflicto = buscarConflicto(db, tituloNormalizado);
    if (conflicto !== undefined) {
      return { ok: false, motivo: 'titulo_duplicado', conflicto };
    }

    // El libro y sus dos entradas de historial comparten el instante exacto del alta.
    const ahora = new Date().toISOString();

    try {
      // 4. El libro.
      const insercion = db
        .prepare(SQL_INSERTAR_LIBRO)
        .run(
          titulo.valor,
          tituloNormalizado,
          tituloOrden,
          editorial.valor,
          editorialNormalizada,
          stock.valor,
          precio.valor,
          ESTADO_INICIAL,
          ahora,
        );
      const id = Number(insercion.lastInsertRowid);

      // 5 y 6. Los dos historiales, inseparables del INSERT de arriba (Principio III).
      db.prepare(SQL_INSERTAR_PRECIO).run(id, ahora, SIN_ANTECEDENTE, precio.valor, ORIGEN_ALTA);
      db.prepare(SQL_INSERTAR_STOCK).run(id, ahora, SIN_ANTECEDENTE, stock.valor, ORIGEN_ALTA);

      return { ok: true, libro: leerLibro(db, id) };
    } catch (error) {
      if (!esViolacionDeUnique(error)) {
        throw error;
      }

      // Carrera imposible en un proceso único, pero el UNIQUE es la barrera real y el
      // SELECT de arriba sólo existe para poder nombrar el conflicto. Se reconsulta y se
      // devuelve el mismo resultado de negocio: el error de SQLite no sale de acá.
      const tardio = buscarConflicto(db, tituloNormalizado);
      if (tardio === undefined) {
        throw new Error(ERROR_UNIQUE_SIN_CONFLICTO);
      }

      return { ok: false, motivo: 'titulo_duplicado', conflicto: tardio };
    }
  });

  return alta.immediate();
}
