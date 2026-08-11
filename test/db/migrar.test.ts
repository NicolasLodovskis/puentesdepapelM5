import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cerrarDb, obtenerDb } from '@/lib/db/conexion';
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

function tablas(db: Database.Database): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all()
    .map((fila) => (fila as { name: string }).name);
}

function version(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

describe('migrar()', () => {
  it('sobre una base vacía deja user_version en 1 y crea las tres tablas (AC-08)', () => {
    const db = new Database(':memory:');

    expect(version(db)).toBe(0);

    migrar(db);

    expect(version(db)).toBe(1);
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

    expect(version(db)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM libros').get()).toEqual({ n: 1 });

    db.close();
  });

  it('revierte por completo si una migración falla a mitad de camino', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/migraciones', () => ({
      MIGRACIONES: [
        {
          numero: 1,
          sql: 'CREATE TABLE a_medias (id INTEGER PRIMARY KEY); ESTO NO ES SQL VALIDO;',
        },
      ],
    }));

    const db = new Database(':memory:');
    try {
      const { migrar: migrarConFallo } = await import('@/lib/db/migrar');

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

      expect(MIGRACIONES).toHaveLength(1);
      expect(MIGRACIONES[0].numero).toBe(1);
      expect(MIGRACIONES[0].sql).toContain('CREATE TABLE libros');
    } finally {
      vi.doUnmock('node:fs');
      vi.resetModules();
    }
  });

  it('conserva intactos los acentos de los orígenes admitidos', async () => {
    const { MIGRACIONES } = await import('@/lib/db/migraciones');
    const sql = MIGRACIONES[0].sql;

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
});

describe('convenciones de lib/db', () => {
  const MODULOS_DE_SERVIDOR = [
    'lib/db/conexion.ts',
    'lib/db/ruta.ts',
    'lib/db/migrar.ts',
    'lib/db/migraciones/index.ts',
    'lib/db/migraciones/001-inicial.ts',
  ];

  it.each(MODULOS_DE_SERVIDOR)('%s marca server-only antes que ningún otro import', (relativo) => {
    const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
    const primerImport = fuente.match(/^import .*$/m)?.[0];

    expect(primerImport).toBe("import 'server-only';");
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
