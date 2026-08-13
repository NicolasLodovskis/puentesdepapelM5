import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cerrarDb, obtenerDb } from '@/lib/db/conexion';
import type { Migracion } from '@/lib/db/migraciones';
import { migrar } from '@/lib/db/migrar';
import { baseDePrueba, rutaTemporal } from '@/test/ayudas/base-de-prueba';

const ENV_ORIGINAL = process.env.PUENTES_DB_PATH;

function restaurarEntorno(): void {
  if (ENV_ORIGINAL === undefined) {
    delete process.env.PUENTES_DB_PATH;
  } else {
    process.env.PUENTES_DB_PATH = ENV_ORIGINAL;
  }
}

type FilaLibro = {
  titulo: string;
  titulo_normalizado: string;
  titulo_orden: string;
  editorial: string;
  editorial_normalizada: string;
  stock: unknown;
  precio: unknown;
  estado: string;
  creado_en: string;
};

/**
 * Cada libro insertado estrena identidad. Con un `titulo_normalizado` fijo, el segundo
 * INSERT de un mismo test moría por la restricción UNIQUE **antes** de que el motor
 * llegara a mirar el tipo, y las aserciones de tipo pasaban por el motivo equivocado.
 */
let secuencia = 0;

function insertarLibro(db: Database.Database, cambios: Partial<FilaLibro> = {}): number {
  secuencia += 1;
  const fila: FilaLibro = {
    titulo: `El Aleph ${secuencia}`,
    titulo_normalizado: `el aleph ${secuencia}`,
    titulo_orden: `el aleph ${secuencia}`,
    editorial: 'Sur',
    editorial_normalizada: 'sur',
    stock: 3,
    precio: 1200,
    estado: 'activo',
    creado_en: '2026-08-09T00:00:00.000Z',
    ...cambios,
  };

  const resultado = db
    .prepare(
      `INSERT INTO libros
         (titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
          stock, precio, estado, creado_en)
       VALUES
         (@titulo, @titulo_normalizado, @titulo_orden, @editorial, @editorial_normalizada,
          @stock, @precio, @estado, @creado_en)`,
    )
    .run(fila);

  return Number(resultado.lastInsertRowid);
}

function insertarPrecio(
  db: Database.Database,
  libroId: number,
  cambios: { precio_anterior?: unknown; precio_nuevo?: unknown; origen?: string } = {},
): void {
  db.prepare(
    `INSERT INTO historial_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    libroId,
    '2026-08-09T00:00:00.000Z',
    cambios.precio_anterior ?? 0,
    cambios.precio_nuevo ?? 1200,
    cambios.origen ?? 'alta manual',
  );
}

function insertarStock(
  db: Database.Database,
  libroId: number,
  cambios: { cantidad_anterior?: unknown; cantidad_resultante?: unknown; origen?: string } = {},
): void {
  db.prepare(
    `INSERT INTO historial_stock (libro_id, fecha, cantidad_anterior, cantidad_resultante, origen)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    libroId,
    '2026-08-09T00:00:00.000Z',
    cambios.cantidad_anterior ?? 0,
    cambios.cantidad_resultante ?? 3,
    cambios.origen ?? 'alta manual',
  );
}

function insertarVenta(
  db: Database.Database,
  libroId: number,
  cambios: { fecha?: unknown; precio_venta?: unknown } = {},
): void {
  db.prepare(`INSERT INTO ventas (libro_id, fecha, precio_venta) VALUES (?, ?, ?)`).run(
    libroId,
    cambios.fecha ?? '2026-08-09T00:00:00.000Z',
    cambios.precio_venta ?? 1200,
  );
}

function tablas(db: Database.Database): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all()
    .map((fila) => (fila as { name: string }).name);
}

function version(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/**
 * Número de la última migración de la lista, escrito a mano.
 *
 * No se deriva de `MIGRACIONES`: derivarlo haría que estas aserciones comparen la lista contra
 * sí misma y pasen siempre. Se actualiza al agregar una migración, igual que su conteo.
 */
const ULTIMA_VERSION = 3;

describe('migrar()', () => {
  it('sobre una base vacía deja user_version en la última migración y crea las tablas (AC-08)', () => {
    const db = new Database(':memory:');

    expect(version(db)).toBe(0);

    migrar(db);

    expect(version(db)).toBe(ULTIMA_VERSION);
    expect(tablas(db)).toEqual(
      expect.arrayContaining(['libros', 'historial_precio', 'historial_stock']),
    );

    db.close();
  });

  it('ejecutado dos veces seguidas no vuelve a aplicar la migración y no falla', () => {
    const db = new Database(':memory:');

    migrar(db);
    insertarLibro(db);

    expect(() => migrar(db)).not.toThrow();

    expect(version(db)).toBe(ULTIMA_VERSION);
    expect(db.prepare('SELECT COUNT(*) AS n FROM libros').get()).toEqual({ n: 1 });

    db.close();
  });

  it('revierte por completo si una migración falla a mitad de camino', async () => {
    vi.resetModules();
    // Se sustituye **sólo** `MIGRACIONES`: `migrar()` también importa de este módulo
    // `llevaUnaSolaMitad()`, y un mock que devolviera nada más que la lista lo dejaría
    // `undefined`. El test seguiría verde —espera un throw, y un `TypeError` lo es— pero por el
    // motivo equivocado: nunca llegaría a ejecutarse el SQL inválido que viene a probar.
    vi.doMock('@/lib/db/migraciones', async (importarOriginal) => {
      const original = await importarOriginal<typeof import('@/lib/db/migraciones')>();

      return {
        ...original,
        MIGRACIONES: [
          {
            numero: 1,
            sql: 'CREATE TABLE a_medias (id INTEGER PRIMARY KEY); ESTO NO ES SQL VALIDO;',
          },
        ],
      };
    });

    const db = new Database(':memory:');
    try {
      const { migrar: migrarConFallo } = await import('@/lib/db/migrar');

      // El motivo del throw se afirma acá y no en el `toThrow()` de abajo, que es preexistente
      // y no se toca: lo que tiene que fallar es el SQL, no el contrato del módulo.
      expect(() => migrarConFallo(db)).toThrow(/ESTO NO ES SQL VALIDO|syntax error/iu);
      expect(() => migrarConFallo(db)).toThrow();

      expect(version(db)).toBe(0);
      expect(tablas(db)).not.toContain('a_medias');
    } finally {
      db.close();
      vi.doUnmock('@/lib/db/migraciones');
      vi.resetModules();
    }
  });

  it('conserva el error original cuando SQLite ya revirtió la transacción por su cuenta', () => {
    // Ante disco lleno, error de E/S o SQLITE_BUSY, SQLite auto-revierte: la transacción
    // ya no está activa y el ROLLBACK del catch lanza, tapando el error real.
    const dbFalsa = {
      inTransaction: false,
      pragma: () => 0,
      exec: (sql: string) => {
        if (sql.startsWith('BEGIN')) return;
        if (sql === 'ROLLBACK') {
          throw new Error('cannot rollback - no transaction is active');
        }
        throw new Error('disk I/O error');
      },
    } as unknown as Database.Database;

    expect(() => migrar(dbFalsa)).toThrow(/disk I\/O error/);
  });
});

/**
 * El SQL de una migración de esquema.
 *
 * `Migracion` es una unión discriminada —o trae `sql`, o trae `aplicar`—, así que pedirle
 * `sql` a una migración cualquiera no compila. La comprobación va acá y no en cada test: lo
 * que los tests de abajo afirman es sobre el SQL de la 001, y que la 001 siga siendo de
 * esquema es parte de lo que se afirma.
 *
 * Se discrimina por el valor y no con `'sql' in migracion`, por lo mismo que en `migrar.ts`:
 * cada miembro declara la mitad del otro como `?: never`, así que el `in` no estrecha a `string`.
 */
function sqlDe(migracion: Migracion): string {
  if (migracion.sql === undefined) {
    throw new Error('La migración esperada es de esquema y no de lógica.');
  }

  return migracion.sql;
}

describe('lista de migraciones', () => {
  it('no lee el SQL del sistema de archivos: no depende del cwd ni del empaquetado', async () => {
    vi.resetModules();
    const prohibido = () => {
      throw new Error('la lista de migraciones no debe leer del disco');
    };
    vi.doMock('node:fs', () => ({
      default: { readFileSync: prohibido },
      readFileSync: prohibido,
    }));

    try {
      const { MIGRACIONES } = await import('@/lib/db/migraciones');

      expect(MIGRACIONES).toHaveLength(3);
      expect(MIGRACIONES[0].numero).toBe(1);
      expect(sqlDe(MIGRACIONES[0])).toContain('CREATE TABLE libros');
      expect(sqlDe(MIGRACIONES[1])).toContain('CREATE TABLE ventas');
      // La 003 es de lógica: recalcula la identidad y no trae SQL de esquema.
      expect(MIGRACIONES[2]).toHaveProperty('aplicar');
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });

  it('numera las migraciones con enteros positivos, únicos y crecientes', async () => {
    // El `numero` es lo que decide qué se aplica y qué no (`migrar()` filtra por
    // `numero > user_version`), así que un repetido **hace desaparecer una migración en
    // silencio**: partiendo de una base v1, una lista `[1, 1, 3]` no aplica ninguna de las dos
    // primeras y deja `user_version` en 3, o sea la base declarando una versión que no tiene. Es
    // el mismo fallo callado que cierra `llevaUnaSolaMitad()`, pero en la forma de la **lista** y
    // no en la de una migración, y el largo de la lista no lo delata.
    const { MIGRACIONES } = await import('@/lib/db/migraciones');
    const numeros = MIGRACIONES.map((migracion) => migracion.numero);

    expect(numeros.length).toBeGreaterThan(0);
    expect(new Set(numeros).size, `hay números repetidos en ${JSON.stringify(numeros)}`).toBe(
      numeros.length,
    );
    // Y declarados en orden: el runner ordena por su cuenta, pero una lista desordenada es
    // siempre un error de numeración disfrazado de estilo.
    expect(numeros).toEqual([...numeros].sort((uno, otro) => uno - otro));

    for (const numero of numeros) {
      expect(Number.isInteger(numero), `${String(numero)} no es un entero`).toBe(true);
      expect(numero).toBeGreaterThan(0);
    }
  });

  it('conserva intactos los acentos de los orígenes admitidos', async () => {
    const { MIGRACIONES } = await import('@/lib/db/migraciones');
    const sql = sqlDe(MIGRACIONES[0]);

    for (const origen of [
      'edición manual',
      'reactivación',
      'actualización masiva por Excel',
      'alta por Excel',
      'alta manual',
      'venta',
    ]) {
      expect(sql).toContain(`'${origen}'`);
    }

    expect(sql).not.toContain('`');
  });
});

/**
 * Las dos formas degeneradas de una migración, escritas como literales tipados.
 *
 * `@ts-expect-error` es la mitad de compilación de la garantía: si alguna de las dos dejara de
 * ser un error de tipos, `tsc` falla **acá**, porque un `@ts-expect-error` sin error debajo es
 * a su vez un error. Es lo que sostiene la afirmación de `Migracion` de que las dos mitades
 * juntas no tipan; el modo de falla que cierra es silencioso —el runner aplicaría el SQL y no
 * llamaría nunca a `aplicar`—, así que sin esto nada lo detectaría.
 *
 * La otra mitad, la de ejecución, es `llevaUnaSolaMitad()`: el tipo no ve lo que llega por un
 * `as`, desde JavaScript o desde un mock.
 */
// @ts-expect-error una migración con las dos mitades no es una migración válida
const CON_LAS_DOS_MITADES: Migracion = {
  numero: 9,
  sql: 'CREATE TABLE con_las_dos_mitades (id INTEGER PRIMARY KEY)',
  aplicar: () => undefined,
};

// @ts-expect-error una migración sin ninguna de las dos mitades tampoco lo es
const SIN_NINGUNA_MITAD: Migracion = { numero: 9 };

describe('forma de una migración', () => {
  it('llevaUnaSolaMitad() separa las dos formas válidas de las dos degeneradas', async () => {
    const { llevaUnaSolaMitad } = await import('@/lib/db/migraciones');

    expect(llevaUnaSolaMitad({ numero: 9, sql: 'SELECT 1' })).toBe(true);
    expect(llevaUnaSolaMitad({ numero: 9, aplicar: () => undefined })).toBe(true);
    expect(llevaUnaSolaMitad(CON_LAS_DOS_MITADES)).toBe(false);
    expect(llevaUnaSolaMitad(SIN_NINGUNA_MITAD)).toBe(false);
  });

  it('las migraciones de la lista llevan exactamente una mitad', async () => {
    const { MIGRACIONES, llevaUnaSolaMitad } = await import('@/lib/db/migraciones');

    expect(MIGRACIONES.length).toBeGreaterThan(0);
    for (const migracion of MIGRACIONES) {
      expect(llevaUnaSolaMitad(migracion), `migración ${migracion.numero}`).toBe(true);
    }
  });

  it.each([
    ['con las dos mitades', CON_LAS_DOS_MITADES],
    ['sin ninguna mitad', SIN_NINGUNA_MITAD],
  ])('migrar() rechaza una migración %s y no avanza user_version', async (_nombre, degenerada) => {
    // Lo que se está cerrando es el fallo callado: con las dos mitades el runner aplicaría el
    // SQL, no llamaría a `aplicar` y dejaría `user_version` avanzado igual, así que la base
    // declararía una versión que no tiene.
    vi.resetModules();
    vi.doMock('@/lib/db/migraciones', async (importarOriginal) => {
      const original = await importarOriginal<typeof import('@/lib/db/migraciones')>();

      return { ...original, MIGRACIONES: [{ ...degenerada, numero: 1 }] };
    });

    const db = new Database(':memory:');
    try {
      const { migrar: migrarConDegenerada } = await import('@/lib/db/migrar');

      expect(() => migrarConDegenerada(db)).toThrow(/mitad/iu);

      expect(version(db)).toBe(0);
      expect(tablas(db)).not.toContain('con_las_dos_mitades');
    } finally {
      db.close();
      vi.doUnmock('@/lib/db/migraciones');
      vi.resetModules();
    }
  });
});

describe('obtenerDb()', () => {
  // Regla #0, punto 2: un test sólo borra lo que él mismo creó. Borrar `.tmp-tests/`
  // entero le arrancaría la base a cualquier otro archivo de tests que estuviera
  // corriendo en paralelo — un fallo intermitente, y en un bloque que no es éste.
  const creadosPorEsteTest: string[] = [];

  function temporalPropio(nombre: string): string {
    const directorio = rutaTemporal(nombre);
    creadosPorEsteTest.push(directorio);
    return directorio;
  }

  afterEach(() => {
    cerrarDb();
    restaurarEntorno();
    while (creadosPorEsteTest.length > 0) {
      fs.rmSync(creadosPorEsteTest.pop() as string, { recursive: true, force: true });
    }
  });

  it('crea el directorio de la base cuando no existe', () => {
    const directorio = temporalPropio('crea-directorio');
    process.env.PUENTES_DB_PATH = path.join(directorio, 'puentes.db');
    expect(fs.existsSync(directorio)).toBe(false);

    obtenerDb();

    expect(fs.existsSync(directorio)).toBe(true);
  });

  it('propaga sin capturar un fallo al abrir la base', async () => {
    cerrarDb();
    vi.resetModules();
    vi.doMock('better-sqlite3', () => ({
      default: class {
        constructor() {
          throw new Error('SQLITE_CANTOPEN: unable to open database file');
        }
      },
    }));

    try {
      const directorio = temporalPropio('fallo-apertura');
      process.env.PUENTES_DB_PATH = path.join(directorio, 'puentes.db');
      const { obtenerDb: obtenerDbConFallo } = await import('@/lib/db/conexion');

      expect(() => obtenerDbConFallo()).toThrow(/SQLITE_CANTOPEN/);
    } finally {
      vi.doUnmock('better-sqlite3');
      vi.resetModules();
    }
  });

  it('deja la conexión con foreign_keys en ON', () => {
    const directorio = temporalPropio('foreign-keys');
    process.env.PUENTES_DB_PATH = path.join(directorio, 'puentes.db');

    const db = obtenerDb();

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('fija busy_timeout antes de journal_mode = WAL', async () => {
    // El cambio a WAL toma un lock exclusivo momentáneo: con el timeout todavía en 0,
    // un proceso concurrente recibe SQLITE_BUSY en vez de esperar.
    cerrarDb();
    vi.resetModules();
    const pragmas: string[] = [];
    vi.doMock('better-sqlite3', () => ({
      default: class {
        pragma(sentencia: string) {
          pragmas.push(sentencia);
          return 0;
        }
        exec() {}
        // El runner ya no sólo ejecuta SQL: la 003 es una migración de lógica que lee filas
        // con una sentencia preparada. Sin `prepare` acá, el doble no cumple el contrato que
        // `migrar()` necesita y este test fallaría por la razón equivocada.
        prepare() {
          return { all: () => [], run: () => undefined };
        }
        close() {}
      },
    }));

    try {
      const directorio = temporalPropio('orden-pragmas');
      process.env.PUENTES_DB_PATH = path.join(directorio, 'puentes.db');
      const { obtenerDb: obtenerDbEspiado } = await import('@/lib/db/conexion');

      obtenerDbEspiado();

      expect(pragmas).toContain('busy_timeout = 5000');
      expect(pragmas).toContain('journal_mode = WAL');
      expect(pragmas.indexOf('busy_timeout = 5000')).toBeLessThan(
        pragmas.indexOf('journal_mode = WAL'),
      );
    } finally {
      const { cerrarDb: cerrarEspiado } = await import('@/lib/db/conexion');
      cerrarEspiado();
      vi.doUnmock('better-sqlite3');
      vi.resetModules();
    }
  });

  it('cierra el handle y no lo cachea cuando la migración falla (M10, riesgo R10)', async () => {
    // Sin esto, "la app no arranca" es en realidad "la app falla y filtra un descriptor por
    // navegación": cada request abre un `Database` nuevo sobre el mismo archivo con WAL activo
    // y ninguno se cierra.
    cerrarDb();
    vi.resetModules();
    let cerrados = 0;
    vi.doMock('better-sqlite3', () => ({
      default: class {
        pragma() {
          return 0;
        }
        exec() {}
        close() {
          cerrados += 1;
        }
      },
    }));
    vi.doMock('@/lib/db/migrar', () => ({
      migrar: () => {
        throw new Error('la migración no se pudo aplicar');
      },
    }));

    try {
      const directorio = temporalPropio('migracion-fallida');
      process.env.PUENTES_DB_PATH = path.join(directorio, 'puentes.db');
      const { obtenerDb: obtenerDbConMigracionRota } = await import('@/lib/db/conexion');

      expect(() => obtenerDbConMigracionRota()).toThrow(/la migración no se pudo aplicar/u);

      expect(cerrados).toBe(1);
      // Y no queda cacheado: un handle roto en `globalThis` se serviría a todo el proceso.
      expect(globalThis.__puentesDePapelDb).toBeUndefined();

      // Un segundo intento vuelve a abrir y vuelve a cerrar: no hay handle acumulado.
      expect(() => obtenerDbConMigracionRota()).toThrow(/la migración no se pudo aplicar/u);
      expect(cerrados).toBe(2);
    } finally {
      vi.doUnmock('@/lib/db/migrar');
      vi.doUnmock('better-sqlite3');
      vi.resetModules();
    }
  });

  it('conserva el error de la migración aunque cerrar el handle falle (M10)', async () => {
    // Mismo riesgo que el ROLLBACK de `migrar.ts`, y por lo tanto mismo criterio: si el cierre
    // lanza, el error que hay que propagar sigue siendo el de la migración —es el único que
    // diagnostica por qué no arranca la app—, no el del cierre que tapó al anterior.
    cerrarDb();
    vi.resetModules();
    vi.doMock('better-sqlite3', () => ({
      default: class {
        pragma() {
          return 0;
        }
        exec() {}
        close() {
          throw new Error('SQLITE_BUSY: no se pudo cerrar la base');
        }
      },
    }));
    vi.doMock('@/lib/db/migrar', () => ({
      migrar: () => {
        throw new Error('la migración no se pudo aplicar');
      },
    }));

    try {
      const directorio = temporalPropio('cierre-fallido');
      process.env.PUENTES_DB_PATH = path.join(directorio, 'puentes.db');
      const { obtenerDb: obtenerDbConCierreRoto } = await import('@/lib/db/conexion');

      expect(() => obtenerDbConCierreRoto()).toThrow(/la migración no se pudo aplicar/u);
      expect(() => obtenerDbConCierreRoto()).not.toThrow(/SQLITE_BUSY/u);
      expect(globalThis.__puentesDePapelDb).toBeUndefined();
    } finally {
      vi.doUnmock('@/lib/db/migrar');
      vi.doUnmock('better-sqlite3');
      vi.resetModules();
    }
  });
});

describe('convenciones de lib/db', () => {
  /** Todo archivo `.ts` bajo `lib/db/`, recursivo, en ruta relativa a la raíz del repo. */
  function modulosDeDb(directorio = path.join(process.cwd(), 'lib/db')): string[] {
    return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const completo = path.join(directorio, entrada.name);

      if (entrada.isDirectory()) {
        return modulosDeDb(completo);
      }

      return /\.ts$/u.test(entrada.name) ? [path.relative(process.cwd(), completo)] : [];
    });
  }

  /**
   * Los dos módulos de `lib/db/` que **no** llevan `server-only`, y por qué.
   *
   * Es una allow-list explícita y no una lista de los que sí lo llevan: con la lista en positivo,
   * un módulo nuevo sin `server-only` no rompía nada —nadie lo agregaba a la lista y la guardia
   * no lo miraba nunca—. Al revés, cualquier archivo que aparezca en `lib/db/` queda vigilado
   * desde que existe, y sacarlo de la vigilancia obliga a escribir acá el motivo.
   *
   * Los dos son excepciones porque `app/` los importa: de acá salen los motivos de rechazo que
   * `app/mensajes.ts` traduce, y el tipo `Libro` que la pantalla muestra.
   */
  const SIN_SERVER_ONLY = ['lib/db/errores.ts', 'lib/db/tipos.ts'];

  const modulos = modulosDeDb();
  const MODULOS_DE_SERVIDOR = modulos.filter((relativo) => !SIN_SERVER_ONLY.includes(relativo));

  it('recorre de verdad lib/db/, incluidas las migraciones, y encuentra las dos excepciones', () => {
    // Meta-guardia del recorrido y de la allow-list: con un recorrido corto la guardia de abajo
    // pasaría sin haber mirado nada, y con una excepción mal escrita —un archivo renombrado— la
    // allow-list dejaría de excluir a nadie y taparía un módulo sin vigilancia.
    expect(modulos).toContain('lib/db/conexion.ts');
    expect(modulos).toContain('lib/db/libros.ts');
    expect(modulos).toContain('lib/db/migraciones/index.ts');
    expect(modulos).toContain('lib/db/migraciones/003-identidad.ts');

    for (const excepcion of SIN_SERVER_ONLY) {
      expect(modulos, `la excepción ${excepcion} ya no existe con ese nombre`).toContain(excepcion);
    }

    expect(MODULOS_DE_SERVIDOR.length).toBe(modulos.length - SIN_SERVER_ONLY.length);
  });

  it.each(MODULOS_DE_SERVIDOR)('%s marca server-only antes que ningún otro import', (relativo) => {
    const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
    const primerImport = fuente.match(/^import .*$/m)?.[0];

    expect(primerImport).toBe("import 'server-only';");
  });

  /**
   * Las cuatro formas de traerse **otro módulo**.
   *
   * `import … from`, `export … from`, `import(…)` y `require(…)`: las cuatro traen código, que es
   * lo que la excepción a `server-only` promete que acá no pasa. Un
   * `export { rutaDb } from './ruta'` arrastra el módulo de servidor igual que un `import`, y un
   * `await import('./ruta')` adentro de una función también.
   *
   * **Se busca sobre el fuente entero, no línea por línea.** Un `export` con varios nombres se
   * escribe en varias líneas —con nombres largos es la forma que produce Prettier—, y un filtro por
   * línea no ve ninguna de esas líneas: ni la del `export {`, ni la del `} from './conexion'`. Por
   * eso se sacan los comentarios y se colapsan los espacios primero, y recién después se busca:
   * así una sentencia repartida en cinco líneas se mira igual que si estuviera en una.
   *
   * Los comentarios se sacan porque la prosa de estos archivos habla de `import type` todo el
   * tiempo.
   */
  const FORMAS_QUE_TRAEN_MODULOS = [
    // `import … from 'x'` y `export … from 'x'`. El `[^;]*?` no deja cruzar el fin de sentencia.
    /\b(?:import|export)\b[^;]*?\bfrom\s*['"][^'"]+['"]/gu,
    // `import 'x'` a secas: un import de efecto también trae el módulo.
    /\bimport\s*['"][^'"]+['"]/gu,
    // Las dos formas dinámicas. El lookbehind evita morder un `algo.import(` o un `.require(`.
    /(?<![.\w$])import\s*\(/gu,
    /(?<![.\w$])require\s*\(/gu,
  ];

  function traidasDeModulos(fuente: string): string[] {
    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/(^|\n)\s*\/\/[^\n]*/gu, ' ')
      .replace(/\s+/gu, ' ');

    return FORMAS_QUE_TRAEN_MODULOS.flatMap((forma) => codigo.match(forma) ?? []);
  }

  it.each(SIN_SERVER_ONLY)(
    '%s no trae ningún módulo de valor, y por eso puede vivir sin él',
    (relativo) => {
      // Lo que sostiene la excepción no es la promesa de que el archivo "sea de tipos": es que no
      // traiga ningún valor, porque entonces no puede arrastrar nada de servidor a una pantalla
      // que lo importe. Dejó de ser evidente cuando `errores.ts` estrenó una función, así que se
      // afirma. `import type` y `export type` sí son legales: el compilador los borra.
      const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');

      for (const traida of traidasDeModulos(fuente)) {
        expect(traida, relativo).toMatch(/^(import|export) type /u);
      }
    },
  );

  it('el extractor ve de verdad lo que trae errores.ts, en una línea o en varias', () => {
    // Meta-guardia del extractor: `tipos.ts` no trae nada, así que sin esto la guardia podría
    // estar recorriendo una lista vacía en los dos casos y nadie lo notaría. Y se le pasa además
    // un `export` repartido en varias líneas, que es lo que el filtro por línea no veía: si el
    // extractor volviera a mirar línea por línea, esta afirmación se pone roja sola.
    const fuente = fs.readFileSync(path.join(process.cwd(), 'lib/db/errores.ts'), 'utf8');

    expect(traidasDeModulos(fuente).length).toBeGreaterThan(0);

    const multilinea = [
      'export {',
      '  aplicarPragmas as aplicarLosPragmasDeLaConexion,',
      '  obtenerDb as obtenerLaConexionUnicaDeLaBase,',
      "} from './conexion';",
    ].join('\n');

    expect(traidasDeModulos(multilinea)).toHaveLength(1);
    expect(traidasDeModulos(multilinea)[0]).not.toMatch(/^(import|export) type /u);
  });

  it('toda migración del directorio está dada de alta en MIGRACIONES', async () => {
    // Un archivo `NNN-*.ts` que nadie registra es una migración que no corre: el `server-only` lo
    // adopta la guardia derivada de arriba, y hasta acá no había nada que notara la ausencia. La
    // comparación es por número y en los dos sentidos, así que también delata un `numero`
    // repetido en la lista: `[1, 1, 3]` contra los archivos `[1, 2, 3]`.
    const { MIGRACIONES } = await import('@/lib/db/migraciones');

    const archivos = modulos.filter((relativo) => /migraciones[/\\]\d+-/u.test(relativo));
    expect(archivos.length, 'no se encontró ningún archivo de migración').toBeGreaterThan(0);

    const numerosDeArchivo = archivos.map((relativo) => {
      const encontrado = /^(\d+)-/u.exec(path.basename(relativo));

      if (encontrado === null) {
        throw new Error(`El archivo ${relativo} no empieza con el número de su migración.`);
      }

      return Number(encontrado[1]);
    });

    const ordenar = (uno: number, otro: number): number => uno - otro;

    expect([...MIGRACIONES.map((migracion) => migracion.numero)].sort(ordenar)).toEqual(
      [...numerosDeArchivo].sort(ordenar),
    );
  });

  const MIGRACIONES_NUEVAS = [
    'lib/db/migraciones/002-ventas.ts',
    'lib/db/migraciones/003-identidad.ts',
  ];

  /**
   * Los template literals del archivo que contienen SQL.
   *
   * Se toma el literal **entero** y no las líneas que traen palabras clave: filtrando por
   * palabras quedaban afuera justo las líneas donde una interpolación es plausible —el
   * `SET titulo_normalizado = ?` del UPDATE, y todas las definiciones de columna con su `CHECK`
   * del DDL—, así que la guardia miraba alrededor del agujero.
   */
  function literalesDeSql(fuente: string): string[] {
    return (fuente.match(/`[^`]*`/gu) ?? []).filter((literal) =>
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE\s+(TABLE|INDEX))\b/iu.test(literal),
    );
  }

  it.each(MIGRACIONES_NUEVAS)('%s no interpola nada dentro de su SQL (M9)', (relativo) => {
    const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
    const literales = literalesDeSql(fuente);

    // Meta-guardia: sin sentencias encontradas, el recorrido de abajo no mira nada.
    expect(literales.length, relativo).toBeGreaterThan(0);

    for (const literal of literales) {
      for (const linea of literal.split('\n')) {
        expect(linea, relativo).not.toContain('${');
      }
    }
  });

  it.each(MIGRACIONES_NUEVAS)('%s no arma ninguna sentencia por concatenación (M9)', (relativo) => {
    // La otra mitad, y va sobre la **declaración** de cada constante `SQL_*`, no sobre el sitio de
    // la llamada: mirar el `prepare()` no dice cómo se armó la constante, y
    // `const SQL_X = ` + COLUMNA + ` = ?`;` pasa un `prepare(SQL_X)` impecable con una columna que
    // vino de afuera. Lo que se exige es que el lado derecho sea **un único template literal**:
    // arranca en backtick y el punto y coma va inmediatamente después del backtick que lo cierra.
    //
    // Sigue sin buscarse un `+` dentro del SQL: la aritmética legítima —el `stock - 1` que llega
    // con el Block 4— es SQL válido y daría un falso positivo.
    const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
    const patron = /const\s+(SQL_\w+)\s*=\s*/gu;
    let declaraciones = 0;
    let encontrado = patron.exec(fuente);

    while (encontrado !== null) {
      const nombre = `${relativo} → ${encontrado[1]}`;
      const inicio = encontrado.index + encontrado[0].length;

      expect(fuente[inicio], `${nombre}: no arranca con un template literal`).toBe('`');

      const cierre = fuente.indexOf('`', inicio + 1);
      expect(cierre, `${nombre}: el template literal no cierra`).toBeGreaterThan(inicio);
      expect(
        fuente.slice(cierre + 1, cierre + 2),
        `${nombre}: sigue algo después del literal`,
      ).toBe(';');

      declaraciones += 1;
      encontrado = patron.exec(fuente);
    }

    // Meta-guardia doble: hay declaraciones que mirar, y **toda** sentencia SQL del archivo sale
    // de una de ellas. Sin la segunda mitad, un literal de SQL declarado con otro nombre —o
    // suelto dentro de una función— quedaría fuera de esta guardia sin que nada lo diga.
    expect(declaraciones, relativo).toBeGreaterThan(0);
    expect(literalesDeSql(fuente).length, relativo).toBe(declaraciones);

    // Y el sitio de la llamada sigue afirmado: `prepare()` recibe una constante y nada más.
    for (const llamada of fuente.match(/\.prepare\([^)]*\)/gu) ?? []) {
      expect(llamada, relativo).toMatch(/^\.prepare\([A-Z_][A-Z0-9_]*\)$/u);
    }
  });
});

/**
 * Error que devuelven las tablas STRICT ante un valor de otro tipo. Se afirma el mensaje
 * exacto y no un `toThrow()` a secas: un throw pelado también lo satisfaría una violación
 * de UNIQUE, de NOT NULL o de clave foránea, y el test pasaría sin haber probado el tipo.
 *
 * Ojo con lo que STRICT **no** hace: convierte cuando la conversión es sin pérdida, así
 * que `'1200'` y `3.0` entran y se guardan como INTEGER. La barrera contra la entrada del
 * usuario es `parsearPrecio()`, no el esquema.
 */
const ERROR_DE_TIPO = /cannot store (TEXT|REAL|BLOB) value in INTEGER column/;

describe('esquema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = baseDePrueba();
  });

  afterEach(() => {
    db.close();
  });

  it('rechaza una entrada de historial_precio con un libro_id inexistente', () => {
    expect(() => insertarPrecio(db, 9999)).toThrow(/FOREIGN KEY/i);
  });

  it('impide borrar un libro que tiene historial (ON DELETE RESTRICT)', () => {
    const libroId = insertarLibro(db);
    insertarPrecio(db, libroId);
    insertarStock(db, libroId);

    expect(() => db.prepare('DELETE FROM libros WHERE id = ?').run(libroId)).toThrow(
      /FOREIGN KEY/i,
    );
    expect(db.prepare('SELECT COUNT(*) AS n FROM libros').get()).toEqual({ n: 1 });
  });

  it('rechaza stock -1, stock 1000001, precio 0 y un título de 301 caracteres', () => {
    expect(() => insertarLibro(db, { stock: -1 })).toThrow(/CHECK/i);
    expect(() => insertarLibro(db, { stock: 1_000_001 })).toThrow(/CHECK/i);
    expect(() => insertarLibro(db, { precio: 0 })).toThrow(/CHECK/i);
    expect(() => insertarLibro(db, { titulo: 'x'.repeat(301) })).toThrow(/CHECK/i);

    expect(db.prepare('SELECT COUNT(*) AS n FROM libros').get()).toEqual({ n: 0 });
  });

  it("rechaza estado 'otro' y acepta 'activo' y 'archivado' (AC-08)", () => {
    expect(() => insertarLibro(db, { estado: 'otro', titulo_normalizado: 'otro' })).toThrow(
      /CHECK/i,
    );

    expect(() => insertarLibro(db, { estado: 'activo', titulo_normalizado: 'uno' })).not.toThrow();
    expect(() =>
      insertarLibro(db, { estado: 'archivado', titulo_normalizado: 'dos' }),
    ).not.toThrow();
  });

  it('acepta precio_anterior 0 y rechaza precio_nuevo 0 en historial_precio (AC-01)', () => {
    const libroId = insertarLibro(db);

    expect(() =>
      insertarPrecio(db, libroId, { precio_anterior: 0, precio_nuevo: 1200 }),
    ).not.toThrow();
    expect(() => insertarPrecio(db, libroId, { precio_anterior: 0, precio_nuevo: 0 })).toThrow(
      /CHECK/i,
    );
  });

  it('cada historial admite su propio conjunto de orígenes, y no el del otro', () => {
    const libroId = insertarLibro(db);

    expect(() => insertarPrecio(db, libroId, { origen: 'venta' })).toThrow(/CHECK/i);
    expect(() =>
      insertarPrecio(db, libroId, { origen: 'actualización masiva por Excel' }),
    ).not.toThrow();

    expect(() => insertarStock(db, libroId, { origen: 'actualización masiva por Excel' })).toThrow(
      /CHECK/i,
    );
    expect(() => insertarStock(db, libroId, { origen: 'venta' })).not.toThrow();
  });

  it('libros.precio rechaza texto no numérico, decimales y blobs', () => {
    expect(() => insertarLibro(db, { precio: 'abc' })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarLibro(db, { precio: 1.5 })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarLibro(db, { precio: Buffer.from('1200') })).toThrow(ERROR_DE_TIPO);

    expect(db.prepare('SELECT COUNT(*) AS n FROM libros').get()).toEqual({ n: 0 });
  });

  it('libros.stock rechaza texto no numérico, decimales y blobs', () => {
    expect(() => insertarLibro(db, { stock: 2.7 })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarLibro(db, { stock: 'abc' })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarLibro(db, { stock: Buffer.from('3') })).toThrow(ERROR_DE_TIPO);

    expect(db.prepare('SELECT COUNT(*) AS n FROM libros').get()).toEqual({ n: 0 });
  });

  it('historial_precio rechaza texto no numérico y decimales en sus dos importes', () => {
    const libroId = insertarLibro(db);

    expect(() => insertarPrecio(db, libroId, { precio_anterior: 'abc' })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarPrecio(db, libroId, { precio_anterior: 1.5 })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarPrecio(db, libroId, { precio_nuevo: 'abc' })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarPrecio(db, libroId, { precio_nuevo: 1200.75 })).toThrow(ERROR_DE_TIPO);

    expect(db.prepare('SELECT COUNT(*) AS n FROM historial_precio').get()).toEqual({ n: 0 });
  });

  it('historial_stock rechaza texto no numérico y decimales en sus dos cantidades', () => {
    const libroId = insertarLibro(db);

    expect(() => insertarStock(db, libroId, { cantidad_anterior: 'abc' })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarStock(db, libroId, { cantidad_anterior: 0.5 })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarStock(db, libroId, { cantidad_resultante: 'abc' })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarStock(db, libroId, { cantidad_resultante: 2.7 })).toThrow(ERROR_DE_TIPO);

    expect(db.prepare('SELECT COUNT(*) AS n FROM historial_stock').get()).toEqual({ n: 0 });
  });

  it('crea ventas con sus cuatro columnas y su índice (FR-07, migración 002)', () => {
    expect(tablas(db)).toContain('ventas');

    const columnas = db
      .prepare(`SELECT name FROM pragma_table_info('ventas') ORDER BY cid`)
      .all()
      .map((fila) => (fila as { name: string }).name);

    // Sin columna de origen: toda fila de esta tabla es una venta.
    expect(columnas).toEqual(['id', 'libro_id', 'fecha', 'precio_venta']);

    const indices = db
      .prepare(`SELECT name FROM pragma_index_list('ventas')`)
      .all()
      .map((fila) => (fila as { name: string }).name);

    expect(indices).toContain('idx_ventas_libro');
  });

  it('ventas exige un libro existente y no lo deja borrar ni renumerar (ON DELETE/UPDATE RESTRICT)', () => {
    // RESTRICT y nunca CASCADE: el Principio III prohíbe borrar historial y borrar libros
    // físicamente, y el historial de ventas es el que reconstruye la facturación.
    expect(() => insertarVenta(db, 9999)).toThrow(/FOREIGN KEY/i);

    const libroId = insertarLibro(db);
    insertarVenta(db, libroId);

    expect(() => db.prepare('DELETE FROM libros WHERE id = ?').run(libroId)).toThrow(
      /FOREIGN KEY/i,
    );
    expect(() => db.prepare('UPDATE libros SET id = ? WHERE id = ?').run(9999, libroId)).toThrow(
      /FOREIGN KEY/i,
    );
    expect(db.prepare('SELECT COUNT(*) AS n FROM ventas').get()).toEqual({ n: 1 });
  });

  it('ventas rechaza precio_venta 0 (CHECK) y valores de otro tipo (STRICT)', () => {
    const libroId = insertarLibro(db);

    expect(() => insertarVenta(db, libroId, { precio_venta: 0 })).toThrow(/CHECK/i);
    expect(() => insertarVenta(db, libroId, { precio_venta: -1 })).toThrow(/CHECK/i);
    expect(() => insertarVenta(db, libroId, { precio_venta: 'abc' })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarVenta(db, libroId, { precio_venta: 1.5 })).toThrow(ERROR_DE_TIPO);
    expect(() => insertarVenta(db, libroId, { precio_venta: Buffer.from('1200') })).toThrow(
      ERROR_DE_TIPO,
    );
    // `fecha` es TEXT NOT NULL. No se le afirma el tipo con un número: STRICT convierte
    // cuando la conversión es sin pérdida, así que un entero entra como texto (es lo mismo
    // que ya documenta ERROR_DE_TIPO para `'1200'` y `3.0`). Lo que sí rechaza es un BLOB.
    expect(() => insertarVenta(db, libroId, { fecha: Buffer.from('hoy') })).toThrow(
      /cannot store BLOB value in TEXT column/,
    );

    expect(db.prepare('SELECT COUNT(*) AS n FROM ventas').get()).toEqual({ n: 0 });
  });

  it('sigue aceptando los valores enteros válidos en las tres tablas', () => {
    const libroId = insertarLibro(db, { stock: 0, precio: 1 });

    expect(() =>
      insertarPrecio(db, libroId, { precio_anterior: 0, precio_nuevo: 1_000_000 }),
    ).not.toThrow();
    expect(() =>
      insertarStock(db, libroId, { cantidad_anterior: 0, cantidad_resultante: 1_000_000 }),
    ).not.toThrow();

    expect(db.prepare('SELECT stock, precio FROM libros WHERE id = ?').get(libroId)).toEqual({
      stock: 0,
      precio: 1,
    });
  });
});
