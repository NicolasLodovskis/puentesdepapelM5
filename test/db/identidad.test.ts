import Database from 'better-sqlite3';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { EstadoDelCatalogo } from '@/app/estado-del-catalogo';
import { MENSAJE_COLISION_DE_IDENTIDAD, TITULO_CATALOGO_SIN_MIGRAR } from '@/app/mensajes';
import { aplicarPragmas } from '@/lib/db/conexion';
import { buscarLibros } from '@/lib/db/consultas';
import { esColisionDeIdentidad } from '@/lib/db/errores';
import { SQL_001_INICIAL } from '@/lib/db/migraciones/001-inicial';
import { PREFIJO_CENTINELA } from '@/lib/db/migraciones/003-identidad';
import { migrar } from '@/lib/db/migrar';
import type { ColumnasDerivadas } from '@/lib/dominio/derivar-libro';
import { normalizarTitulo } from '@/lib/dominio/normalizar-titulo';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';

/**
 * Un libro tal como quedó almacenado por FEAT-001a: su título, la identidad que la
 * normalización **de entonces** produjo y su clave de orden.
 *
 * Los tres valores son literales y **no** salen de llamar a las funciones de dominio. Si el
 * fixture se calculara con la misma función que usa el recálculo, los tests de AC-15 y AC-16
 * compararían la implementación contra sí misma y no podrían ponerse rojos.
 */
interface Semilla {
  titulo: string;
  /** Lo que hay hoy en la columna `titulo_normalizado`, que es lo que el recálculo reescribe. */
  identidadAlmacenada: string;
  tituloOrden: string;
  editorial: string;
  /**
   * Estado del libro. Por omisión `activo`, que es como nacen todos hoy.
   *
   * Existe para poder sembrar un archivado: la identidad es `UNIQUE` sobre **toda** la tabla, así
   * que el recálculo tiene que leer también los archivados, y sin una semilla archivada esa
   * decisión no la sostiene ningún test.
   */
  estado?: 'activo' | 'archivado';
}

const FECHA = '2026-08-09T00:00:00.000Z';

/** Título con puntuación final: es el caso que FR-10 unificó y que AC-15 exige recalcular. */
const CON_PUNTUACION: Semilla = {
  titulo: 'Principito, El.',
  identidadAlmacenada: 'principito el',
  tituloOrden: 'principito, el.',
  editorial: 'Emece',
};

/** Título ya coherente: el recálculo no debe cambiarlo. */
const YA_COHERENTE: Semilla = {
  titulo: 'El Aleph',
  identidadAlmacenada: 'el aleph',
  tituloOrden: 'el aleph',
  editorial: 'Sur',
};

const SQL_SEMBRAR_LIBRO = `
  INSERT INTO libros
    (titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
     stock, precio, estado, creado_en)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function sembrar(db: Database.Database, semilla: Semilla): number {
  const insercion = db
    .prepare(SQL_SEMBRAR_LIBRO)
    .run(
      semilla.titulo,
      semilla.identidadAlmacenada,
      semilla.tituloOrden,
      semilla.editorial,
      semilla.editorial.toLowerCase(),
      3,
      1200,
      semilla.estado ?? 'activo',
      FECHA,
    );
  const id = Number(insercion.lastInsertRowid);

  // Las dos entradas del alta: AC-16 exige comprobar que el recálculo abortado no las toca.
  db.prepare(
    `INSERT INTO historial_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, FECHA, 0, 1200, 'alta manual');
  db.prepare(
    `INSERT INTO historial_stock (libro_id, fecha, cantidad_anterior, cantidad_resultante, origen)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, FECHA, 0, 3, 'alta manual');

  return id;
}

/**
 * Base migrada **sólo hasta la 001**, para poder sembrar antes del recálculo.
 *
 * Es el punto del que dependen AC-15 y AC-16: `baseDePrueba()` aplica todas las migraciones
 * sobre una base vacía, así que el recálculo procesaría 0 filas y los dos criterios quedarían
 * verdes sin haberse ejecutado nunca. Se recorta la lista con `vi.doMock`, el mismo patrón que
 * ya usa `test/db/migrar.test.ts`, y **no** se cambia el contrato del runner: la 002 y la 003
 * se aplican después con el `migrar()` real y su lista real.
 */
async function baseSinRecalcular(): Promise<Database.Database> {
  vi.resetModules();
  // Se recorta **sólo** `MIGRACIONES` y el resto del módulo queda como está: `migrar()` también
  // importa de acá `llevaUnaSolaMitad()`, y un mock que lo reemplazara entero se lo llevaría.
  vi.doMock('@/lib/db/migraciones', async (importarOriginal) => {
    const original = await importarOriginal<typeof import('@/lib/db/migraciones')>();

    return { ...original, MIGRACIONES: [{ numero: 1, sql: SQL_001_INICIAL }] };
  });

  // El handle se abre **antes** del `try`: si `migrarSolo001` lanzara con el handle abierto
  // dentro del `try`, el `finally` desmockearía y la base quedaría sin cerrar.
  const db = new Database(':memory:');

  try {
    const { migrar: migrarSolo001 } = await import('@/lib/db/migrar');
    aplicarPragmas(db);
    migrarSolo001(db);

    return db;
  } catch (error) {
    db.close();
    throw error;
  } finally {
    vi.doUnmock('@/lib/db/migraciones');
    vi.resetModules();
  }
}

/**
 * Las dos versiones que este archivo afirma, a mano y por el mismo motivo que
 * `ULTIMA_VERSION` en `migrar.test.ts`: derivarlas de `MIGRACIONES` las haría comparar la lista
 * contra sí misma.
 */
const ULTIMA_VERSION = 3;

/** La versión de una base sembrada y todavía sin recalcular: sólo la 001 aplicada. */
const VERSION_SIN_RECALCULAR = 1;

function version(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

function tablas(db: Database.Database): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all()
    .map((fila) => (fila as { name: string }).name);
}

function identidades(db: Database.Database): unknown[] {
  return db.prepare('SELECT titulo, titulo_normalizado FROM libros ORDER BY id').all();
}

/** Todo el contenido de las tres tablas, para comparar el antes y el después de un rollback. */
function radiografia(db: Database.Database): Record<string, unknown[]> {
  return {
    libros: db.prepare('SELECT * FROM libros ORDER BY id').all(),
    historialPrecio: db.prepare('SELECT * FROM historial_precio ORDER BY id').all(),
    historialStock: db.prepare('SELECT * FROM historial_stock ORDER BY id').all(),
  };
}

function capturar(accion: () => void): unknown {
  try {
    accion();
  } catch (error) {
    return error;
  }

  throw new Error('Se esperaba que el recálculo fallara, y no falló.');
}

/**
 * Dos libros que hoy tienen identidades distintas y que con FR-10 pasan a compartirla:
 * `"Principito, El."` normaliza a `"el principito"`, que es la identidad de `"El Principito"`.
 */
async function baseQueColisiona(): Promise<Database.Database> {
  const db = await baseSinRecalcular();
  sembrar(db, CON_PUNTUACION);
  sembrar(db, {
    titulo: 'El Principito',
    identidadAlmacenada: 'el principito',
    tituloOrden: 'el principito',
    editorial: 'Sur',
  });

  return db;
}

/**
 * Aplica la 002 y la 003 con `derivarLibro()` interceptado por un centinela.
 *
 * Es el análogo del centinela del alta (`test/dominio/derivar-libro.test.ts`) para el recálculo:
 * con títulos legítimos, un recálculo que reimplementara la normalización daría el mismo
 * resultado que delegando y ningún test lo notaría —que es literalmente el riesgo R8—. Estas
 * tres cadenas no las produce ninguna normalización, así que sólo aparecen si el recálculo
 * **llama** a la función.
 */
async function recalcularConDerivacionCentinela(db: Database.Database): Promise<void> {
  vi.resetModules();
  vi.doMock('@/lib/dominio/derivar-libro', () => ({
    derivarLibro: (titulo: string, editorial: string): ColumnasDerivadas => ({
      // El centinela lleva los dos argumentos adentro: así también queda afirmado que la
      // editorial se le pasa, y no sólo el título.
      tituloNormalizado: `centinela ${titulo} ${editorial}`,
      tituloOrden: 'centinela orden',
      editorialNormalizada: 'centinela editorial',
    }),
  }));

  try {
    const { migrar: migrarConCentinela } = await import('@/lib/db/migrar');
    migrarConCentinela(db);
  } finally {
    vi.doUnmock('@/lib/dominio/derivar-libro');
    vi.resetModules();
  }
}

describe('recálculo de identidad (migración 003, FR-11)', () => {
  it('reescribe titulo_normalizado de los libros ya cargados (AC-15)', async () => {
    const db = await baseSinRecalcular();

    try {
      sembrar(db, CON_PUNTUACION);
      sembrar(db, YA_COHERENTE);

      migrar(db);

      // Se lee de la base, no del valor que devolvió nadie: lo que AC-15 pide es que la
      // columna quede reescrita.
      expect(identidades(db)).toEqual([
        { titulo: 'Principito, El.', titulo_normalizado: 'el principito' },
        { titulo: 'El Aleph', titulo_normalizado: 'el aleph' },
      ]);
      expect(version(db)).toBe(ULTIMA_VERSION);
      // **Éste es el único test que ejercita el upgrade real**: una base v1 —la que ya tiene
      // instalada la librería con FEAT-001a— subiendo a v3. `baseDePrueba()` migra desde 0, así
      // que sin esta línea una migración que se saltee por un `numero` repetido dejaría la base
      // en v3 sin `ventas` y ningún test lo vería.
      expect(tablas(db)).toContain('ventas');
    } finally {
      db.close();
    }
  });

  it('deja cada libro recuperable por su título en la búsqueda (AC-15)', async () => {
    const db = await baseSinRecalcular();

    try {
      sembrar(db, CON_PUNTUACION);
      sembrar(db, YA_COHERENTE);

      migrar(db);

      for (const semilla of [CON_PUNTUACION, YA_COHERENTE]) {
        const encontrados = buscarLibros(semilla.titulo, db);

        expect(encontrados.map((libro) => libro.titulo)).toEqual([semilla.titulo]);
        // La otra mitad de AC-15, y la que ata las dos: el libro que la búsqueda devuelve es
        // el ya recalculado. Sin esto, el `titulo_orden` intacto haría pasar el test aunque el
        // recálculo no existiera.
        expect(encontrados[0].tituloNormalizado).toBe(normalizarTitulo(semilla.titulo));
      }
    } finally {
      db.close();
    }
  });

  it('recalcula también los libros archivados, que el UNIQUE no distingue', async () => {
    // El recálculo lee **sin filtro de estado**, y esta es la semilla que lo sostiene: la
    // identidad es `UNIQUE` sobre toda la tabla, así que un archivado sin recalcular seguiría
    // ocupando una identidad vieja que ningún camino puede volver a calcular.
    const db = await baseSinRecalcular();

    try {
      sembrar(db, CON_PUNTUACION);
      sembrar(db, {
        titulo: 'Cuentos, Los.',
        identidadAlmacenada: 'cuentos los',
        tituloOrden: 'cuentos, los.',
        editorial: 'Losada',
        estado: 'archivado',
      });

      migrar(db);

      expect(
        db.prepare('SELECT titulo, titulo_normalizado, estado FROM libros ORDER BY id').all(),
      ).toEqual([
        { titulo: 'Principito, El.', titulo_normalizado: 'el principito', estado: 'activo' },
        // Recalculado, y sigue archivado: el recálculo toca la identidad y nada más.
        { titulo: 'Cuentos, Los.', titulo_normalizado: 'los cuentos', estado: 'archivado' },
      ]);
    } finally {
      db.close();
    }
  });

  it('detecta la colisión entre un activo y un archivado antes de escribir (AC-16, M7, M8)', async () => {
    // La consecuencia de leer con filtro de estado no sería sólo un archivado con identidad
    // vieja: su identidad no entraría en la detección previa, así que esta colisión saldría como
    // el error crudo del motor contra el `UNIQUE` al escribir, y la usuaria vería texto de SQLite
    // en vez del aviso curado. Los pasos de precálculo existen justamente para esto.
    const db = await baseSinRecalcular();

    try {
      sembrar(db, CON_PUNTUACION);
      sembrar(db, {
        titulo: 'El Principito',
        identidadAlmacenada: 'el principito',
        tituloOrden: 'el principito',
        editorial: 'Sur',
        estado: 'archivado',
      });
      const antes = radiografia(db);

      const error = capturar(() => migrar(db));

      expect(esColisionDeIdentidad(error)).toBe(true);
      expect((error as Error).message).not.toMatch(/UNIQUE|SQLITE_|constraint/iu);
      expect(version(db)).toBe(VERSION_SIN_RECALCULAR);
      expect(tablas(db)).not.toContain('ventas');
      expect(radiografia(db)).toEqual(antes);
    } finally {
      db.close();
    }
  });

  it('obtiene la identidad de derivarLibro() y no la calcula por su cuenta (M6, riesgo R8)', async () => {
    const db = await baseSinRecalcular();

    try {
      sembrar(db, CON_PUNTUACION);

      await recalcularConDerivacionCentinela(db);

      // Leído de la base: si el recálculo normalizara por su cuenta, acá habría una identidad
      // plausible en vez del centinela, y todos los demás tests seguirían verdes.
      expect(identidades(db)).toEqual([
        { titulo: 'Principito, El.', titulo_normalizado: 'centinela Principito, El. Emece' },
      ]);

      // Y las otras dos derivadas quedan como estaban: el recálculo escribe la identidad y
      // nada más. `plegarTexto()` no cambió con FR-10, así que reescribirlas sería un UPDATE
      // sin cambio por fila — y acá se vería, porque el centinela las delata.
      expect(db.prepare('SELECT titulo_orden, editorial_normalizada FROM libros').get()).toEqual({
        titulo_orden: 'principito, el.',
        editorial_normalizada: 'emece',
      });
    } finally {
      db.close();
    }
  });

  it('usa un prefijo de centinela que ninguna identidad puede contener (premisa de M7)', () => {
    // La seguridad de las dos pasadas descansa en que el centinela no pueda chocar con una
    // identidad real, y eso es una propiedad de `normalizarTitulo()` —de `PUNTUACION`, en otro
    // módulo—, no del recálculo. Sin esta guardia, ampliar los caracteres que la normalización
    // conserva volvería el centinela una identidad posible sin romper nada visible.
    for (const caracter of ['#', ':']) {
      expect(PREFIJO_CENTINELA).toContain(caracter);
      expect(normalizarTitulo(`El Aleph${caracter}`)).not.toContain(caracter);
      expect(normalizarTitulo(`${caracter}El${caracter}Aleph`)).not.toContain(caracter);
    }

    // Y el prefijo entero, que es lo que de verdad importa: ni al principio ni en el medio.
    expect(normalizarTitulo(`${PREFIJO_CENTINELA}1`)).not.toContain(PREFIJO_CENTINELA);
    expect(normalizarTitulo(`El ${PREFIJO_CENTINELA}Aleph`)).not.toContain(PREFIJO_CENTINELA);
  });

  it('recalcula dos libros que intercambian identidad sin violar el UNIQUE (M7)', async () => {
    // El estado **intermedio**, que precalcular no descarta: el primer UPDATE escribiría la
    // identidad que la otra fila todavía ocupa. El fixture es sintético a propósito —el cambio
    // de FR-10 no puede producir un ciclo de dos sobre datos reales—, y es justamente por eso
    // que sin las dos pasadas con centinela nada lo detectaría hasta el día que un cambio
    // futuro de la derivación sí lo produzca.
    const db = await baseSinRecalcular();

    try {
      sembrar(db, {
        titulo: 'Principito, El.',
        identidadAlmacenada: 'el aleph',
        tituloOrden: 'principito, el.',
        editorial: 'Emece',
      });
      sembrar(db, {
        titulo: 'Aleph, El.',
        identidadAlmacenada: 'el principito',
        tituloOrden: 'aleph, el.',
        editorial: 'Sur',
      });

      migrar(db);

      expect(identidades(db)).toEqual([
        { titulo: 'Principito, El.', titulo_normalizado: 'el principito' },
        { titulo: 'Aleph, El.', titulo_normalizado: 'el aleph' },
      ]);
      expect(version(db)).toBe(ULTIMA_VERSION);
    } finally {
      db.close();
    }
  });

  it('revierte entero y no avanza user_version si dos libros pasan a compartir identidad (AC-16)', async () => {
    const db = await baseQueColisiona();

    try {
      const antes = radiografia(db);

      const error = capturar(() => migrar(db));

      expect(esColisionDeIdentidad(error)).toBe(true);
      expect(version(db)).toBe(VERSION_SIN_RECALCULAR);
      // El DDL también es transaccional: la 002 se aplicó antes de la 003 y se fue con ella.
      expect(tablas(db)).not.toContain('ventas');
      expect(radiografia(db)).toEqual(antes);
    } finally {
      db.close();
    }
  });

  it('no nombra ningún libro ni id del catálogo al informar la colisión (AC-16, M7, M8)', async () => {
    const db = await baseQueColisiona();

    try {
      const error = capturar(() => migrar(db));
      const mensaje = error instanceof Error ? error.message : String(error);

      // El payload del error, afirmado por su lista de claves y no sólo por lo que se ve
      // serializado: `JSON.stringify` de un `Error` copia únicamente las propiedades propias
      // **enumerables**, así que la caja que se revisa abajo es más chica que la que el error
      // carga. Con esto, el día que alguien le agregue un campo —los títulos en conflicto, un
      // contador— la guardia se pone roja en vez de mirar para otro lado.
      expect(Object.keys(error as object)).toEqual(['colisionDeIdentidad']);

      const serializado = JSON.stringify({ ...(error as object), mensaje });
      const pantalla = renderToStaticMarkup(createElement(EstadoDelCatalogo));
      // El texto que lee la usuaria, sin el markup: los nombres de etiqueta traen dígitos
      // propios (`<h1>`) que no son datos del catálogo.
      const textoDeLaPantalla = pantalla.replace(/<[^>]*>/gu, ' ');

      for (const texto of [mensaje, serializado, textoDeLaPantalla]) {
        // Los dos títulos sembrados, en las dos cajas: los dos comparten esta subcadena.
        expect(texto).not.toContain('Principito');
        expect(texto).not.toContain('principito');
        // Ningún dígito: sin dígitos no puede haber colado un id ni una cantidad de libros.
        expect(texto).not.toMatch(/\d/u);
        expect(texto).not.toMatch(/SQLITE_/u);
        expect(texto).not.toMatch(/titulo_normalizado/u);
        expect(texto).not.toMatch(/\.db\b/u);
      }

      // Y dice algo: un aviso vacío también pasaría todas las negaciones de arriba.
      expect(pantalla).toContain(TITULO_CATALOGO_SIN_MIGRAR);
      expect(pantalla).toContain(MENSAJE_COLISION_DE_IDENTIDAD);
    } finally {
      db.close();
    }
  });

  it('revierte y no avanza user_version ante un fallo que no es una colisión', async () => {
    const db = await baseSinRecalcular();

    try {
      sembrar(db, CON_PUNTUACION);
      sembrar(db, YA_COHERENTE);
      const antes = radiografia(db);

      const preparar = db.prepare.bind(db) as (sql: string) => unknown;
      let intervino = false;
      db.prepare = ((sql: string) => {
        if (sql.includes('UPDATE libros')) {
          intervino = true;
          return {
            run: () => {
              throw new Error('disk I/O error');
            },
          };
        }

        return preparar(sql);
      }) as unknown as Database.Database['prepare'];

      const error = capturar(() => migrar(db));

      // Que el engancho por substring haya funcionado se afirma acá: si alguien reindenta el
      // UPDATE, el test pasaría sin haber forzado ningún fallo.
      expect(intervino).toBe(true);
      expect((error as Error).message).toMatch(/disk I\/O error/u);
      expect(esColisionDeIdentidad(error)).toBe(false);
      expect(version(db)).toBe(VERSION_SIN_RECALCULAR);
      expect(tablas(db)).not.toContain('ventas');
      expect(radiografia(db)).toEqual(antes);
    } finally {
      db.close();
    }
  });
});

describe('esColisionDeIdentidad()', () => {
  it('reconoce el error del recálculo y rechaza todo lo demás', async () => {
    const db = await baseQueColisiona();
    let real: unknown;

    try {
      real = capturar(() => migrar(db));
    } finally {
      db.close();
    }

    expect(esColisionDeIdentidad(real)).toBe(true);

    // La marca sola no alcanza: el tipo que este predicado afirma extiende `Error`, así que un
    // objeto pelado que pasara dejaría a quien lea su `.message` con `undefined`.
    expect(esColisionDeIdentidad({ colisionDeIdentidad: true })).toBe(false);
    // Y la marca tiene que ser la marca: cualquier otro valor en la misma clave no lo es.
    expect(
      esColisionDeIdentidad(Object.assign(new Error('otra cosa'), { colisionDeIdentidad: 'sí' })),
    ).toBe(false);
    // Un fallo de infraestructura es lo que este predicado tiene que dejar pasar hacia arriba.
    expect(esColisionDeIdentidad(new Error('disk I/O error'))).toBe(false);
    expect(esColisionDeIdentidad(null)).toBe(false);
    expect(esColisionDeIdentidad('colisionDeIdentidad')).toBe(false);
  });
});

/**
 * Catálogo con la identidad **coherente con la normalización de hoy**, escrita a mano.
 *
 * Es el fixture de la guardia de M6 y su valor está en que los literales son los que hay en
 * una base ya migrada: si alguien cambia `normalizarTitulo()` sin recalcular las filas
 * existentes, la comparación se rompe acá y no en producción.
 */
const CATALOGO_COHERENTE: Semilla[] = [
  {
    titulo: 'El Aleph',
    identidadAlmacenada: 'el aleph',
    tituloOrden: 'el aleph',
    editorial: 'Sur',
  },
  {
    titulo: 'Principito, El.',
    identidadAlmacenada: 'el principito',
    tituloOrden: 'principito, el.',
    editorial: 'Emece',
  },
  {
    titulo: '"Cuentos, Los"',
    identidadAlmacenada: 'los cuentos',
    tituloOrden: '"cuentos, los"',
    editorial: 'Sur',
  },
  {
    titulo: 'Casa, La de Bernarda',
    identidadAlmacenada: 'casa la de bernarda',
    tituloOrden: 'casa, la de bernarda',
    editorial: 'Losada',
  },
];

describe('coherencia de la identidad almacenada (M6, riesgo R8)', () => {
  it('para todo libro vale titulo_normalizado === normalizarTitulo(titulo)', () => {
    // **Por qué esta guardia no es decoración.** La identidad se almacena, así que un cambio
    // en `normalizarTitulo()` no rompe nada hasta que alguien compara: la fila vieja sigue
    // siendo única y el `UNIQUE` protege una clave que ya nadie calcula (R8). El fixture trae
    // los valores almacenados **como literales**, así que un cambio de la normalización sin su
    // migración de recálculo pone rojo este test.
    const db = baseDePrueba();

    try {
      for (const semilla of CATALOGO_COHERENTE) {
        sembrar(db, semilla);
      }

      const filas = db
        .prepare('SELECT titulo, titulo_normalizado FROM libros ORDER BY id')
        .all() as Array<{ titulo: string; titulo_normalizado: string }>;

      // Meta-guardia: con la base vacía el `for` de abajo no miraría ni una fila.
      expect(filas).toHaveLength(CATALOGO_COHERENTE.length);

      for (const fila of filas) {
        expect(fila.titulo_normalizado, fila.titulo).toBe(normalizarTitulo(fila.titulo));
      }
    } finally {
      db.close();
    }
  });
});
