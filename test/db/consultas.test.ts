import fs from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buscarLibros, leerLibroPorId } from '@/lib/db/consultas';
import type { EstadoLibro, Libro } from '@/lib/db/tipos';
import { normalizarTitulo } from '@/lib/dominio/normalizar-titulo';
import { plegarTexto } from '@/lib/dominio/plegar-texto';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';
import { filtraPorClavePrimaria, sinComentarios } from '@/test/ayudas/convenciones-sql';

/**
 * Fecha fija para todas las semillas: `creado_en` no participa de la búsqueda ni del orden,
 * así que un valor determinista hace comparables los objetos devueltos.
 */
const FECHA = '2026-08-10T00:00:00.000Z';

const STOCK_SEMILLA = 1;
const PRECIO_SEMILLA = 100;

/**
 * Las semillas se insertan con una sentencia propia y no con `crearLibro()` del Bloque 3.
 *
 * Dos razones. Una: hace falta un libro `archivado` en el catálogo, y `crearLibro()` no puede
 * producirlo por diseño —todo libro nace activo (AC-08)—. Dos: este bloque es de sólo lectura
 * y sus tests no deben ponerse rojos por un bug del camino de escritura, que ya tiene los
 * suyos en `test/db/libros.test.ts`.
 *
 * Las columnas derivadas se calculan con las funciones de dominio reales, no a mano: si el
 * test escribiera `titulo_orden` a ojo, estaría verificando la búsqueda contra un catálogo
 * que la aplicación nunca produciría.
 */
const SQL_SEMBRAR = `
  INSERT INTO libros
    (titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
     stock, precio, estado, creado_en)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

interface Semilla {
  titulo: string;
  editorial: string;
  estado?: EstadoLibro;
}

function sembrar(db: Database.Database, semilla: Semilla): number {
  const insercion = db
    .prepare(SQL_SEMBRAR)
    .run(
      semilla.titulo,
      normalizarTitulo(semilla.titulo),
      plegarTexto(semilla.titulo),
      semilla.editorial,
      plegarTexto(semilla.editorial),
      STOCK_SEMILLA,
      PRECIO_SEMILLA,
      semilla.estado ?? 'activo',
      FECHA,
    );

  return Number(insercion.lastInsertRowid);
}

/**
 * El catálogo de prueba, **en desorden alfabético deliberado**: si `buscarLibros()` se
 * olvidara del `ORDER BY`, SQLite devolvería las filas en orden de `rowid`, que es este, y
 * cualquier aserción de orden se pondría roja.
 *
 * Cada fixture está por una razón concreta:
 *
 * - `Cuentos, Los` — su `titulo_normalizado` es `los cuentos` y su `titulo_orden` es
 *   `cuentos, los`: es el único fixture que **distingue** ordenar por una columna de ordenar
 *   por la otra. Ordenando por la identidad se iría a la L, entre `El Principito` y
 *   `Rayuela`.
 * - `Ávila mística` — mayúsculas y acentos (AC-06).
 * - `Descuentos del 100% y otras ficciones` y `Los 1000 nombres` — el par que desenmascara un
 *   `%` sin escapar: sin `ESCAPE`, buscar `100%` matchea los dos.
 * - `a_b: manual de guiones` y `La barca` — el par equivalente para el `_`: sin escapar,
 *   `a_b` matchea `la barca` (`a`, cualquier carácter, `b`).
 * - `Rutas de C:\ y otras ficciones` y `Rutas de C: y otros mapas` — el par de la barra
 *   invertida, que es el carácter de escape y por lo tanto hay que escapar **también**. Son
 *   los dos únicos fixtures que se ponen rojos si la clase de caracteres del escapado se
 *   reduce a `[%_]`: con la barra cruda, SQLite se la come y el término `C:\ y` deja de
 *   encontrar el libro que la tiene y encuentra el que **no** la tiene.
 * - `Zama` — archivado. Su editorial es `Sur`, compartida con libros activos, para que una
 *   búsqueda por editorial tenga que filtrarlo.
 */
const CATALOGO: Semilla[] = [
  { titulo: 'Rayuela', editorial: 'Sudamericana' },
  { titulo: 'El Principito', editorial: 'Emecé' },
  { titulo: 'Zama', editorial: 'Sur', estado: 'archivado' },
  { titulo: 'Aleph', editorial: 'Sur' },
  { titulo: 'Descuentos del 100% y otras ficciones', editorial: 'Anagrama' },
  { titulo: 'Cuentos, Los', editorial: 'Emecé' },
  { titulo: 'a_b: manual de guiones', editorial: 'Anagrama' },
  { titulo: 'La barca', editorial: 'Sur' },
  { titulo: 'Ávila mística', editorial: 'Trotta' },
  { titulo: 'Rutas de C:\\ y otras ficciones', editorial: 'Trotta' },
  { titulo: 'Rutas de C: y otros mapas', editorial: 'Trotta' },
  { titulo: 'Los 1000 nombres', editorial: 'Sur' },
];

/**
 * Los once libros activos, ordenados por `titulo_orden` (colación binaria de SQLite).
 *
 * `a_b: manual de guiones` va primero porque `_` (0x5F) es menor que cualquier letra;
 * `Cuentos, Los` va en la **C** y no en la L, que es lo que prueba que el orden sale de
 * `titulo_orden` y no de `titulo_normalizado`. `Zama` no está: está archivado.
 */
const ORDEN_COMPLETO = [
  'a_b: manual de guiones',
  'Aleph',
  'Ávila mística',
  'Cuentos, Los',
  'Descuentos del 100% y otras ficciones',
  'El Principito',
  'La barca',
  'Los 1000 nombres',
  'Rayuela',
  // El espacio (0x20) es menor que la barra invertida (0x5C), así que el que **no** la tiene
  // va primero.
  'Rutas de C: y otros mapas',
  'Rutas de C:\\ y otras ficciones',
];

/**
 * Las diez columnas de `libros`, en el orden de la tabla.
 *
 * Es la misma lista que aparece en el `SELECT` de las dos sentencias y en la interfaz
 * `FilaLibro` de `lib/db/consultas.ts`, así que hoy vive en cuatro lugares (el cuarto es
 * `lib/db/libros.ts`, del Bloque 3). El `as FilaLibro[]` del repositorio apaga al
 * compilador: si mañana `libros` gana una columna y se la agrega en un archivo pero no en
 * el otro, el `SELECT` no la trae, el cast miente y el campo sale `undefined` sin error de
 * compilación y sin ningún test de negocio en rojo. Este guardia es el que obliga a
 * revisar las cuatro copias.
 */
const COLUMNAS_DE_LIBROS = [
  'id',
  'titulo',
  'titulo_normalizado',
  'titulo_orden',
  'editorial',
  'editorial_normalizada',
  'stock',
  'precio',
  'estado',
  'creado_en',
];

function titulos(libros: Libro[]): string[] {
  return libros.map((libro) => libro.titulo);
}

/**
 * Rompe la consulta al catálogo en **esta** instancia, devolviendo un objeto con sólo el
 * método que `buscarLibros()` va a llamar (`all`), igual que los stubs de
 * `test/db/libros.test.ts`: heredar del `Statement` real no sirve, porque sus métodos son
 * nativos y esperan su propio `this`.
 */
function romperLaConsulta(db: Database.Database): void {
  const preparar = db.prepare.bind(db) as (sql: string) => unknown;

  db.prepare = ((sql: string) =>
    sql.includes('FROM libros')
      ? {
          all: () => {
            throw new Error('disk I/O error');
          },
        }
      : preparar(sql)) as unknown as Database.Database['prepare'];
}

describe('buscarLibros()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = baseDePrueba();
    for (const semilla of CATALOGO) {
      sembrar(db, semilla);
    }
  });

  afterEach(() => {
    db.close();
  });

  it('encuentra los libros por un fragmento del título (AC-06)', () => {
    // Fragmento del medio, no un prefijo: es lo que exige el comodín inicial del patrón.
    const resultado = buscarLibros('uentos, L', db);

    // Se compara el objeto completo: el mapeo fila → `Libro` es explícito (las columnas son
    // snake_case y `Libro` camelCase) y las cinco columnas TEXT de este fixture difieren
    // entre sí, así que cualquier cruce se ve.
    expect(resultado).toEqual([
      {
        id: expect.any(Number),
        titulo: 'Cuentos, Los',
        tituloNormalizado: 'los cuentos',
        tituloOrden: 'cuentos, los',
        editorial: 'Emecé',
        editorialNormalizada: 'emece',
        stock: STOCK_SEMILLA,
        precio: PRECIO_SEMILLA,
        estado: 'activo',
        creadoEn: FECHA,
      },
    ]);
  });

  it('encuentra los libros por un fragmento de la editorial (AC-06)', () => {
    const resultado = buscarLibros('nagram', db);

    expect(titulos(resultado)).toEqual([
      'a_b: manual de guiones',
      'Descuentos del 100% y otras ficciones',
    ]);
  });

  it('ignora mayúsculas y acentos: "avila" encuentra "Ávila" (AC-06)', () => {
    expect(titulos(buscarLibros('avila', db))).toEqual(['Ávila mística']);

    // Y al revés: el término acentuado y en mayúsculas encuentra lo mismo, porque las dos
    // puntas pasan por el mismo plegado.
    expect(titulos(buscarLibros('MÍSTICA', db))).toEqual(['Ávila mística']);

    // La editorial se busca contra su columna plegada, así que vale igual.
    expect(titulos(buscarLibros('EMECÉ', db))).toEqual(['Cuentos, Los', 'El Principito']);
  });

  it('ordena los resultados por titulo_orden, no por titulo_normalizado (AC-06)', () => {
    // El término `e` matchea todo el catálogo activo menos `Ávila mística` y `La barca`.
    const resultado = buscarLibros('e', db);

    expect(titulos(resultado)).toEqual([
      'a_b: manual de guiones',
      'Aleph',
      'Cuentos, Los',
      'Descuentos del 100% y otras ficciones',
      'El Principito',
      'Los 1000 nombres',
      'Rayuela',
      'Rutas de C: y otros mapas',
      'Rutas de C:\\ y otras ficciones',
    ]);

    // Las dos aserciones que nombra la spec, explícitas para que se lea qué se está
    // protegiendo: `Aleph` entre las A y `El Principito` entre las E — no entre las P, que
    // es donde lo pondría ordenar por el título sin artículo.
    const orden = titulos(resultado);
    expect(orden.indexOf('Aleph')).toBeLessThan(orden.indexOf('Cuentos, Los'));
    expect(orden.indexOf('El Principito')).toBeGreaterThan(
      orden.indexOf('Descuentos del 100% y otras ficciones'),
    );

    // Y el discriminador de las dos columnas: `Cuentos, Los` tiene `titulo_normalizado`
    // `los cuentos`, así que ordenar por la identidad lo mandaría **después** de
    // `El Principito`.
    expect(orden.indexOf('Cuentos, Los')).toBeLessThan(orden.indexOf('El Principito'));
  });

  it('con término vacío devuelve el catálogo activo completo, con el mismo orden (AC-07)', () => {
    expect(titulos(buscarLibros('', db))).toEqual(ORDEN_COMPLETO);
  });

  it('trata el término null, undefined y "   " como término vacío (AC-07)', () => {
    const completo = buscarLibros('', db);

    expect(buscarLibros(null, db)).toEqual(completo);
    expect(buscarLibros(undefined, db)).toEqual(completo);
    expect(buscarLibros('   ', db)).toEqual(completo);
    expect(titulos(completo)).toEqual(ORDEN_COMPLETO);
  });

  it('no devuelve nunca un libro archivado', () => {
    // Por su título, por su editorial —compartida con tres libros activos— y en el catálogo
    // completo: los tres caminos de la función.
    expect(buscarLibros('zama', db)).toEqual([]);
    expect(titulos(buscarLibros('Sur', db))).toEqual(['Aleph', 'La barca', 'Los 1000 nombres']);
    expect(titulos(buscarLibros('', db))).not.toContain('Zama');
  });

  it('trata el % del término como literal y no como comodín', () => {
    const resultado = buscarLibros('100%', db);

    // `Los 1000 nombres` es el fixture que delata el `%` sin escapar: contiene `100` seguido
    // de otro carácter, así que un patrón `%100%%` lo traería puesto.
    expect(titulos(resultado)).toEqual(['Descuentos del 100% y otras ficciones']);
  });

  it('trata el guión bajo del término como literal y no como comodín', () => {
    const resultado = buscarLibros('a_b', db);

    // Sin escapar, `_` matchea cualquier carácter y `la barca` entraría (`a`, ` `, `b`).
    expect(titulos(resultado)).toEqual(['a_b: manual de guiones']);
  });

  it('trata la barra invertida del término como literal y no como escape', () => {
    // La barra invertida es el carácter que declara `ESCAPE '\'`, así que hay que escaparla
    // a ella también: si no, deja de ser un dato y se vuelve sintaxis del patrón. Es la rama
    // que ningún otro test toca —`100%` se escapa igual con la clase reducida a `[%_]`—, así
    // que estas dos aserciones son las únicas que se ponen rojas si alguien la saca.

    // Con la barra escapada, el patrón pide un `\` literal y encuentra el libro. Sin
    // escaparla, el patrón termina en `%c:\%`, donde `\%` es un `%` literal: el título
    // tendría que **terminar** en `c:%` y no matchea nada.
    expect(titulos(buscarLibros('C:\\', db))).toEqual(['Rutas de C:\\ y otras ficciones']);

    // Y el caso que delata que la barra cruda no es inocua sino que matchea **otra cosa**:
    // con la barra escapada, `C:\ y` pide `c:\ y` literal y trae el libro que la tiene. Sin
    // escaparla, SQLite se come la barra —queda `%c:\ y%`, y `\ ` es un espacio literal—,
    // así que el patrón pide `c: y` y devuelve el libro que **no** tiene la barra.
    expect(titulos(buscarLibros('C:\\ y', db))).toEqual(['Rutas de C:\\ y otras ficciones']);
  });

  it('con un término de 500 caracteres no falla y devuelve lista vacía', () => {
    expect(buscarLibros('x'.repeat(500), db)).toEqual([]);

    // La lista vacía tiene que venir de que ningún libro coincide, no de que la función
    // devuelva siempre vacío: el mismo catálogo responde a un término normal enseguida
    // después. Sin esta segunda mitad, el test lo aprobaría un `return []`.
    expect(titulos(buscarLibros('rayuela', db))).toEqual(['Rayuela']);
  });

  it('trunca el término en 300 caracteres exactos antes de plegarlo', () => {
    // Dos títulos de 300 caracteres que comparten los primeros 280. Entre los dos, la cota
    // queda fijada por arriba y por abajo:
    //
    // - `trescientas` + basura sólo matchea `trescientas` si el término se trunca; sin
    //   truncar, el patrón es más largo que cualquier título posible y no matchea nada.
    // - `doscientasOchentaMasVeinte` sólo matchea su propio libro si la cota es 300. Con una
    //   cota menor —280, por ejemplo— el patrón se queda en las `y` comunes y arrastra
    //   también a `trescientas`.
    //
    // Ningún título puede pasar de 300 caracteres (`CHECK` del esquema), que es por lo que
    // truncar ahí no puede cambiar ningún resultado legítimo.
    const trescientas = 'y'.repeat(300);
    const doscientasOchentaMasVeinte = `${'y'.repeat(280)}${'z'.repeat(20)}`;
    sembrar(db, { titulo: trescientas, editorial: 'Sur' });
    sembrar(db, { titulo: doscientasOchentaMasVeinte, editorial: 'Sur' });

    expect(titulos(buscarLibros(`${trescientas}zzz`, db))).toEqual([trescientas]);
    expect(titulos(buscarLibros(doscientasOchentaMasVeinte, db))).toEqual([
      doscientasOchentaMasVeinte,
    ]);
  });

  it('mantiene las diez columnas de libros que la fila mapeada reconstruye', () => {
    // Guardia de la lista de columnas duplicada (ver `COLUMNAS_DE_LIBROS`). Sigue el mismo
    // recurso que el guardia del `UNIQUE` único de `test/db/libros.test.ts`: se lee el
    // esquema real, no el código, para que una migración futura tenga que pasar por acá.
    const columnas = (db.pragma('table_info(libros)') as Array<{ name: string }>).map(
      (columna) => columna.name,
    );

    expect(columnas).toEqual(COLUMNAS_DE_LIBROS);
  });

  it('propaga un fallo de la consulta en vez de devolver una lista vacía', () => {
    romperLaConsulta(db);

    expect(() => buscarLibros('rayuela', db)).toThrow(/disk I\/O error/);
    // Los dos caminos preparan su propia sentencia: el del catálogo completo también.
    expect(() => buscarLibros('', db)).toThrow(/disk I\/O error/);
  });
});

describe('leerLibroPorId()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = baseDePrueba();
  });

  afterEach(() => {
    db.close();
  });

  it('devuelve el libro activo con sus diez columnas mapeadas (AC-01, FR-01)', () => {
    const id = sembrar(db, { titulo: 'Cuentos, Los', editorial: 'Emecé' });

    // El objeto completo, como en la búsqueda: el mapeo fila → `Libro` es explícito y las
    // columnas TEXT de este fixture difieren entre sí, así que cualquier cruce se ve.
    expect(leerLibroPorId(id, db)).toEqual({
      id,
      titulo: 'Cuentos, Los',
      tituloNormalizado: 'los cuentos',
      tituloOrden: 'cuentos, los',
      editorial: 'Emecé',
      editorialNormalizada: 'emece',
      stock: STOCK_SEMILLA,
      precio: PRECIO_SEMILLA,
      estado: 'activo',
      creadoEn: FECHA,
    });
  });

  it('devuelve undefined para un id que no existe', () => {
    const id = sembrar(db, { titulo: 'Rayuela', editorial: 'Sudamericana' });

    expect(leerLibroPorId(id + 1, db)).toBeUndefined();

    // Y el `undefined` no viene de que la función devuelva siempre lo mismo: el id sembrado sí
    // trae su libro. Sin esta línea, un `return undefined` pelado pasaría el test.
    expect(leerLibroPorId(id, db)?.titulo).toBe('Rayuela');
  });

  it('devuelve undefined para un libro archivado, igual que para uno inexistente (M5, R6)', () => {
    const archivado = sembrar(db, { titulo: 'Zama', editorial: 'Sur', estado: 'archivado' });

    expect(leerLibroPorId(archivado, db)).toBeUndefined();

    // La mitad que hace falsable el filtro: el libro **está** en la tabla, así que lo que
    // produce el `undefined` es el `estado = 'activo'` y no una fila ausente. Hoy nada archiva,
    // por eso ningún test de negocio de FEAT-001a se pondría rojo si el filtro faltara.
    expect(db.prepare('SELECT estado FROM libros WHERE id = ?').get(archivado)).toEqual({
      estado: 'archivado',
    });
  });
});

describe('convenciones de lib/db/consultas.ts', () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), 'lib/db/consultas.ts'), 'utf8');

  /** Las sentencias declaradas como constantes de módulo, tal cual están en el archivo. */
  const sentencias = Array.from(fuente.matchAll(/const SQL_[A-Z_]+ = `([\s\S]*?)`/gu), (m) => m[1]);

  it('marca server-only antes que ningún otro import', () => {
    expect(fuente.match(/^import .*$/mu)?.[0]).toBe("import 'server-only';");
  });

  it('sólo prepara sentencias declaradas como constante, nunca una armada al vuelo', () => {
    // Ésta es la aserción estructural de la mitigación 2, y va **antes** que la de las
    // líneas porque es la que no tiene puerta lateral: todo `db.prepare(` recibe un
    // identificador `SQL_*` pelado. Un `db.prepare(`${base} WHERE …`)` o un
    // `db.prepare(base + filtro)` la rompen, incluso si el pedazo con entrada del usuario
    // vive en una línea sin ninguna palabra clave SQL, que es donde el filtro por líneas de
    // abajo no ve nada.
    expect(fuente).toMatch(/db\.prepare\(/u);
    expect(fuente).not.toMatch(/db\.prepare\(\s*(?!SQL_[A-Z_]+\s*\))/u);

    // Y ninguna sentencia interpola en su propio cuerpo.
    for (const sentencia of sentencias) {
      expect(sentencia).not.toMatch(/\$\{/u);
    }
  });

  it('no interpola ni concatena nada dentro de una sentencia SQL', () => {
    // Ninguna línea de SQL lleva `${}` ni un `+`: el término viaja siempre por los parámetros
    // del prepared statement (mitigación 2). Los comentarios quedan afuera del filtro para
    // que la prosa no dispare falsos positivos.
    //
    // El filtro es por línea, así que por sí solo no ve una concatenación escrita en una
    // línea sin palabras clave: lo que cierra ese hueco es el guardia estructural de arriba.
    const lineasSql = fuente
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => !linea.startsWith('//') && !linea.startsWith('*'))
      .filter((linea) =>
        /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|FROM|WHERE|VALUES|LIKE|ORDER BY)\b/u.test(linea),
      );

    expect(lineasSql.length).toBeGreaterThan(0);
    for (const linea of lineasSql) {
      expect(linea).not.toMatch(/\$\{/u);
      expect(linea).not.toMatch(/\+/u);
    }
  });

  it('extrae todas las sentencias del archivo, no sólo las escritas con backtick', () => {
    // Meta-guardia del extractor, y el que sostiene el criterio de cierre del bloque: los dos
    // guardias que siguen recorren `sentencias`, así que una sentencia declarada con comillas
    // simples o con `String.raw` quedaría fuera del array y sus reglas —`estado = 'activo'`,
    // `ORDER BY titulo_orden`, `ESCAPE`— no se comprobarían **en silencio**, satisfechas por
    // las otras.
    expect(sentencias).toHaveLength((fuente.match(/const SQL_[A-Z_]+/gu) ?? []).length);
    expect(sentencias.length).toBeGreaterThan(0);
  });

  /*
   * El reconocedor del filtro por clave primaria y los dos despejes que lo sostienen viven en
   * `test/ayudas/convenciones-sql.ts`: la guardia de `lib/db/ventas.ts` necesita el **mismo**
   * reconocedor para exigir lo contrario que acá —que toda sentencia que opera sobre una fila
   * concreta de `libros` filtre por igualdad exacta—, y dos copias del mismo lookbehind divergen sin
   * que nada se ponga rojo. Las meta-guardias que fijan su comportamiento siguen siendo las de este
   * archivo, más abajo, sin una aserción cambiada.
   */
  const porClavePrimaria = sentencias.filter((sentencia) => filtraPorClavePrimaria(sentencia));
  const ordenadas = sentencias.filter((sentencia) => !filtraPorClavePrimaria(sentencia));

  it('filtra estado activo en todas sus sentencias, sin excepción', () => {
    // La regla que **no** se acota (M5): hoy es un no-op porque nada archiva, así que ningún
    // test de negocio se pondría rojo si faltara en una sentencia nueva; este sí. Y la
    // prohibición de ordenar por la identidad tampoco se acota: `titulo_normalizado` mueve el
    // artículo al frente, así que ordenar por ella pondría `"Cuentos, Los"` entre las L.
    //
    // Las dos se comprueban sobre la sentencia **despejada de comentarios** y no sobre la cruda:
    // con la sentencia cruda, un `-- estado = 'activo'` comentado satisfacía la regla con la
    // sentencia sin ningún filtro de estado, que es exactamente el agujero que la regla vigila.
    // Es el mismo tratamiento que ya recibía la excepción del `ORDER BY`, tres líneas más arriba,
    // y estas dos reglas —las que no se acotan— habían quedado con el estándar más flojo.
    expect(sentencias.length).toBeGreaterThan(0);
    for (const sentencia of sentencias) {
      expect(sinComentarios(sentencia)).toMatch(/estado = 'activo'/u);
      expect(sinComentarios(sentencia)).not.toMatch(/ORDER BY\s+titulo_normalizado/u);
    }
  });

  it('ordena por titulo_orden toda sentencia que no filtre por clave primaria', () => {
    // La única de las tres reglas que se acota, y sólo por lo que estorba: pedirle un `ORDER BY`
    // a un `WHERE id = ?` no ordena nada —devuelve una fila— y obligaría a escribirlo de adorno.
    //
    // También sobre la sentencia despejada, por lo mismo que la regla de arriba: la exigencia no
    // la puede satisfacer un `-- ORDER BY titulo_orden` escrito en un comentario.
    for (const sentencia of ordenadas) {
      expect(sinComentarios(sentencia)).toMatch(/ORDER BY\s+titulo_orden/u);
    }
  });

  it('no deja vacío el conjunto de sentencias que sí deben ordenar', () => {
    // Meta-guardia del particionado (M5): un patrón demasiado ancho —`/id/`, o el lookbehind
    // borrado— exceptuaría a **todas** las sentencias y la guardia de arriba pasaría en silencio
    // sin haber mirado ninguna. Se exige además que la excepción exista de verdad: si nadie
    // filtrara por clave primaria, acotar la regla no tendría motivo y habría que revertirlo.
    expect(ordenadas.length).toBeGreaterThan(0);
    expect(porClavePrimaria.length).toBeGreaterThan(0);
  });

  /*
   * Las **meta-guardias** del reconocedor y de los despejes ya no viven acá: se movieron a
   * `test/convenciones/sql.test.ts`, sin una aserción cambiada. El motivo es de ubicación y no de
   * contenido: `test/ayudas/convenciones-sql.ts` es infraestructura de las guardias de este módulo,
   * de `lib/db/ventas.ts` y, en el Block 5, de `lib/db/edicion.ts`, así que sus aserciones no pueden
   * quedar dentro de un describe que habla de **otro** módulo —reescribirlo o borrarlo, que es
   * razonable, dejaba al reconocedor sin una sola aserción y a la guardia de `ventas.ts` apoyada en
   * un lookbehind que nadie prueba—. Las reglas de **este** archivo se siguen afirmando acá.
   */

  it('declara ESCAPE en toda sentencia con LIKE', () => {
    // Un `LIKE` sin `ESCAPE` deja de escapar aunque el término venga escapado: la barra
    // invertida pasaría a ser un carácter común y `100\%` no matchearía nada (mitigación 3).
    //
    // En el fuente van **dos** barras invertidas —de ahí las cuatro de esta expresión, que
    // matchean dos literales— porque el literal de plantilla las colapsa en una sola. Con
    // una sola barra en el fuente, la sentencia llegaría a SQLite con `ESCAPE ''` y el motor
    // la rechazaría; es el error que este test deja escrito para el que venga.
    const conLike = sentencias.filter((sentencia) => sentencia.includes('LIKE'));

    expect(conLike.length).toBeGreaterThan(0);
    for (const sentencia of conLike) {
      const likes = sentencia.match(/LIKE\s+\?\s+ESCAPE\s+'\\\\'/gu) ?? [];
      expect(likes).toHaveLength((sentencia.match(/LIKE/gu) ?? []).length);
    }
  });
});
