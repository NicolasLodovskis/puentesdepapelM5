import fs from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearLibro, type EntradaLibro } from '@/lib/db/libros';
import { baseDePrueba, rutaTemporal } from '@/test/ayudas/base-de-prueba';

const ENV_ORIGINAL = process.env.PUENTES_DB_PATH;

function restaurarEntorno(): void {
  if (ENV_ORIGINAL === undefined) {
    delete process.env.PUENTES_DB_PATH;
  } else {
    process.env.PUENTES_DB_PATH = ENV_ORIGINAL;
  }
}

/**
 * La entrada llega del `FormData` de Block 5, así que los números viajan como texto:
 * los tests usan esa misma forma y no la conveniente.
 */
function entrada(cambios: Partial<EntradaLibro> = {}): EntradaLibro {
  return { titulo: 'El Aleph', editorial: 'Sur', stock: '3', precio: '1200', ...cambios };
}

/**
 * Las tres consultas de conteo son literales fijos, una por tabla, en vez de una sola con
 * el nombre de la tabla interpolado: ni en los tests se arma SQL por concatenación.
 */
const CONTEOS = {
  libros: 'SELECT COUNT(*) AS n FROM libros',
  historialPrecio: 'SELECT COUNT(*) AS n FROM historial_precio',
  historialStock: 'SELECT COUNT(*) AS n FROM historial_stock',
} as const;

function contenido(db: Database.Database): Record<keyof typeof CONTEOS, number> {
  return {
    libros: (db.prepare(CONTEOS.libros).get() as { n: number }).n,
    historialPrecio: (db.prepare(CONTEOS.historialPrecio).get() as { n: number }).n,
    historialStock: (db.prepare(CONTEOS.historialStock).get() as { n: number }).n,
  };
}

const BASE_VACIA = { libros: 0, historialPrecio: 0, historialStock: 0 };

/** Las cinco columnas TEXT que el INSERT ata por posición, en el orden de la tabla. */
const SQL_COLUMNAS_DERIVADAS = `
  SELECT titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada
    FROM libros
   WHERE id = ?
`;

/**
 * Restricciones `UNIQUE` de `libros`, con la columna que cubre cada una.
 *
 * Se leen de `pragma_index_list`/`pragma_index_info` en vez de buscar la palabra `UNIQUE`
 * en el DDL de `sqlite_master`: así también cuenta un futuro `CREATE UNIQUE INDEX`, que no
 * aparece en el `CREATE TABLE`.
 */
const SQL_UNICOS_DE_LIBROS = `
  SELECT indice.name AS indice, columna.name AS columna
    FROM pragma_index_list('libros') AS indice
    JOIN pragma_index_info(indice.name) AS columna
   WHERE indice."unique" = 1
`;

type Preparar = Database.Database['prepare'];

/**
 * Reemplaza `db.prepare` en **esta instancia** para intervenir sentencias puntuales.
 *
 * La intervención devuelve un objeto con sólo los métodos que la sentencia interceptada
 * va a recibir (`get` o `run`), igual que la `dbFalsa` de `migrar.test.ts`: heredar del
 * `Statement` real no sirve, porque sus métodos son nativos y esperan su propio `this`.
 *
 * `db.transaction()` prepara su `BEGIN`/`COMMIT`/`ROLLBACK` contra el objeto nativo
 * interno, no contra este método, así que el parche no puede romper la transacción.
 */
function intervenirPrepare(
  db: Database.Database,
  intervencion: (sql: string) => object | undefined,
): void {
  const preparar = db.prepare.bind(db) as (sql: string) => unknown;
  db.prepare = ((sql: string) => intervencion(sql) ?? preparar(sql)) as unknown as Preparar;
}

/**
 * Hace que el SELECT de conflicto mienta **una sola vez**: la primera consulta no ve la
 * fila, así que el INSERT llega a la base y es la restricción UNIQUE la que lo rechaza. La
 * reconsulta del `catch` usa una sentencia nueva y ya devuelve el libro real.
 *
 * El engancho va por substring de la plantilla SQL, que es frágil: si alguien la reindenta,
 * el stub deja de matchear, el caso sale por el camino normal de duplicado y el test pasa
 * sin haber ejercitado la rama del UNIQUE tardío. Por eso el propio helper expone la
 * afirmación de que mintió, y no queda a criterio de cada test acordarse de escribirla.
 */
function mentirUnaVezEnElSelectDeConflicto(db: Database.Database): {
  confirmarQueMintio: () => void;
} {
  let yaMintio = false;

  intervenirPrepare(db, (sql) => {
    if (sql.includes('WHERE titulo_normalizado = ?') && !yaMintio) {
      yaMintio = true;
      return { get: () => undefined };
    }
    return undefined;
  });

  return {
    confirmarQueMintio: () => {
      expect(yaMintio).toBe(true);
    },
  };
}

describe('crearLibro()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = baseDePrueba();
  });

  afterEach(() => {
    db.close();
  });

  it('persiste el libro y una entrada en cada historial con origen alta manual (AC-01)', () => {
    const resultado = crearLibro(entrada(), db);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const fila = db.prepare('SELECT * FROM libros').get() as Record<string, unknown>;
    expect(fila).toMatchObject({
      titulo: 'El Aleph',
      titulo_normalizado: 'el aleph',
      titulo_orden: 'el aleph',
      editorial: 'Sur',
      editorial_normalizada: 'sur',
      stock: 3,
      precio: 1200,
    });
    expect(fila.creado_en).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // El mapeo fila → objeto es explícito: las columnas son snake_case y `Libro` camelCase.
    expect(resultado.libro).toEqual({
      id: fila.id,
      titulo: 'El Aleph',
      tituloNormalizado: 'el aleph',
      tituloOrden: 'el aleph',
      editorial: 'Sur',
      editorialNormalizada: 'sur',
      stock: 3,
      precio: 1200,
      estado: 'activo',
      creadoEn: fila.creado_en,
    });

    const precios = db.prepare('SELECT * FROM historial_precio').all();
    expect(precios).toHaveLength(1);
    expect(precios[0]).toMatchObject({
      libro_id: resultado.libro.id,
      precio_anterior: 0,
      precio_nuevo: 1200,
      origen: 'alta manual',
      fecha: fila.creado_en,
    });

    const stocks = db.prepare('SELECT * FROM historial_stock').all();
    expect(stocks).toHaveLength(1);
    expect(stocks[0]).toMatchObject({
      libro_id: resultado.libro.id,
      cantidad_anterior: 0,
      cantidad_resultante: 3,
      origen: 'alta manual',
      fecha: fila.creado_en,
    });
  });

  it('escribe cada columna derivada en su propia columna, sin cruzarlas (FR-02)', () => {
    // `'El Aleph'` no sirve como fixture para esto: `normalizarTitulo()` y `plegarTexto()`
    // devuelven las dos `'el aleph'`, así que cruzar `titulo_normalizado` con `titulo_orden`
    // pasa inadvertido. Las cinco columnas TEXT del INSERT son adyacentes y van atadas por
    // posición, y el invariante del repositorio declara ese cruce no negociable: con
    // `'Principito, El'` + `'Emecé'` los cinco valores difieren entre sí y cualquier
    // intercambio se ve.
    const resultado = crearLibro(entrada({ titulo: 'Principito, El', editorial: 'Emecé' }), db);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    // Se leen de la base y no del objeto devuelto, para cubrir los bind del INSERT.
    const fila = db.prepare(SQL_COLUMNAS_DERIVADAS).get(resultado.libro.id);
    expect(fila).toEqual({
      titulo: 'Principito, El',
      titulo_normalizado: 'el principito',
      titulo_orden: 'principito, el',
      editorial: 'Emecé',
      editorial_normalizada: 'emece',
    });

    // Y del objeto devuelto también: cruzar dos líneas de `aLibro()` no toca la base, así
    // que la lectura de arriba sola no lo detectaría.
    expect(resultado.libro).toMatchObject({
      titulo: 'Principito, El',
      tituloNormalizado: 'el principito',
      tituloOrden: 'principito, el',
      editorial: 'Emecé',
      editorialNormalizada: 'emece',
    });
  });

  it('deja el libro creado en estado activo (AC-08)', () => {
    const resultado = crearLibro(entrada(), db);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.libro.estado).toBe('activo');
    expect(db.prepare('SELECT estado FROM libros WHERE id = ?').get(resultado.libro.id)).toEqual({
      estado: 'activo',
    });
  });

  const CAMPOS_INVALIDOS: Array<[string, Partial<EntradaLibro>, string, string]> = [
    ['título vacío', { titulo: '' }, 'titulo', 'vacio'],
    ['editorial vacía', { editorial: '' }, 'editorial', 'vacio'],
    ['título de 301 caracteres', { titulo: 'x'.repeat(301) }, 'titulo', 'demasiado_largo'],
    // `editorial` necesita las mismas dos filas que `titulo` porque no tiene su segunda
    // red: un título que se cuela sin recortar lo ataja después la guardia del título
    // normalizado vacío, y una editorial de sólo espacios no la ataja nadie — llegaría al
    // INSERT y la rechazaría el CHECK del esquema con un SqliteError que no es de UNIQUE, y
    // por lo tanto se relanza crudo, con el nombre de la tabla y de la columna adentro
    // (mitigación 8).
    ['editorial de sólo espacios', { editorial: '   ' }, 'editorial', 'vacio'],
    ['editorial de 301 caracteres', { editorial: 'x'.repeat(301) }, 'editorial', 'demasiado_largo'],
    ['stock -1', { stock: '-1' }, 'stock', 'fuera_de_rango'],
    ['stock 1000001', { stock: '1000001' }, 'stock', 'fuera_de_rango'],
    ['precio 0', { precio: '0' }, 'precio', 'fuera_de_rango'],
  ];

  it.each(CAMPOS_INVALIDOS)(
    'rechaza %s con campos_invalidos y no persiste nada (AC-02)',
    (_descripcion, cambios, campo, detalle) => {
      const resultado = crearLibro(entrada(cambios), db);

      expect(resultado).toEqual({
        ok: false,
        motivo: 'campos_invalidos',
        errores: [{ campo, detalle }],
      });
      expect(contenido(db)).toEqual(BASE_VACIA);
    },
  );

  /**
   * Filas de la tabla de validación de la spec que los 12 tests obligatorios no ejercitan.
   * Importan porque el Bloque 5 depende de ellas: su tabla de errores manda tratar un campo
   * ausente del `FormData` como vacío y **no asumir `0`**, y eso se decide acá.
   */
  const RESTO_DE_LA_TABLA: Array<[string, Partial<EntradaLibro>, string, string]> = [
    ['stock ausente', { stock: null }, 'stock', 'no_entero'],
    ['stock indefinido', { stock: undefined }, 'stock', 'no_entero'],
    ['stock con decimales', { stock: 2.5 }, 'stock', 'no_entero'],
    ['stock no numérico', { stock: 'tres' }, 'stock', 'no_entero'],
    ['precio que no es texto ni número', { precio: { archivo: 'x' } }, 'precio', 'no_numerico'],
  ];

  it.each(RESTO_DE_LA_TABLA)(
    'rechaza %s con el motivo de la tabla de validación y no persiste nada',
    (_descripcion, cambios, campo, detalle) => {
      const resultado = crearLibro(entrada(cambios), db);

      expect(resultado).toEqual({
        ok: false,
        motivo: 'campos_invalidos',
        errores: [{ campo, detalle }],
      });
      expect(contenido(db)).toEqual(BASE_VACIA);
    },
  );

  it('rechaza un título de sólo espacios como vacío', () => {
    // `NOT NULL` no rechaza la cadena vacía y "   " es un título vacío: la validación va
    // sobre el valor recortado.
    const resultado = crearLibro(entrada({ titulo: '   ' }), db);

    expect(resultado).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [{ campo: 'titulo', detalle: 'vacio' }],
    });
    expect(contenido(db)).toEqual(BASE_VACIA);
  });

  it('rechaza como vacío un título que normaliza a cadena vacía', () => {
    // "¿¡?!" no es vacío, pero su identidad sí: `normalizarTitulo()` le quita toda la
    // puntuación y no queda nada con lo que construir la clave del catálogo. Si esto
    // pasara, lo rechazaría el CHECK del esquema con un error de SQLite, que es justo lo
    // que la mitigación 8 prohíbe propagar.
    const resultado = crearLibro(entrada({ titulo: '¿¡?!' }), db);

    expect(resultado).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [{ campo: 'titulo', detalle: 'vacio' }],
    });
    expect(contenido(db)).toEqual(BASE_VACIA);
  });

  it('devuelve un error por cada campo inválido, en el orden del formulario (AC-02)', () => {
    // El resto de los casos manda un solo campo mal, así que el `flatMap` que recolecta los
    // errores nunca se ejercita con dos fallos: devolver sólo el primero, o devolverlos al
    // revés, los dejaría todos en verde. El Bloque 5 itera este array para pintar un mensaje
    // por campo y la spec pide un elemento por campo, así que el orden es parte del contrato.
    const resultado = crearLibro(entrada({ titulo: '', precio: 'abc' }), db);

    expect(resultado).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [
        { campo: 'titulo', detalle: 'vacio' },
        { campo: 'precio', detalle: 'no_numerico' },
      ],
    });
    expect(contenido(db)).toEqual(BASE_VACIA);
  });

  it('rechaza el precio "1234,50" con el motivo decimal, sin redondear (AC-02, AC-05)', () => {
    const resultado = crearLibro(entrada({ precio: '1234,50' }), db);

    expect(resultado).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [{ campo: 'precio', detalle: 'decimal' }],
    });
    expect(contenido(db)).toEqual(BASE_VACIA);
  });

  it('devuelve titulo_duplicado con el título y la editorial en conflicto (AC-03)', () => {
    const primero = crearLibro(entrada(), db);
    expect(primero.ok).toBe(true);
    if (!primero.ok) return;

    const segundo = crearLibro(entrada({ titulo: '¡EL ALEPH!' }), db);

    expect(segundo).toEqual({
      ok: false,
      motivo: 'titulo_duplicado',
      conflicto: { id: primero.libro.id, titulo: 'El Aleph', editorial: 'Sur' },
    });
    expect(contenido(db)).toEqual({ libros: 1, historialPrecio: 1, historialStock: 1 });
  });

  it('detecta el duplicado aunque la editorial sea distinta (AC-03)', () => {
    crearLibro(entrada(), db);

    const segundo = crearLibro(entrada({ titulo: 'el aleph', editorial: 'Emecé' }), db);

    expect(segundo).toMatchObject({
      ok: false,
      motivo: 'titulo_duplicado',
      conflicto: { titulo: 'El Aleph', editorial: 'Sur' },
    });
    expect(contenido(db).libros).toBe(1);
  });

  it('detecta el duplicado entre "El Principito" y "Principito, El" (AC-03)', () => {
    crearLibro(entrada({ titulo: 'El Principito', editorial: 'Emecé' }), db);

    const segundo = crearLibro(entrada({ titulo: 'Principito, El', editorial: 'Sur' }), db);

    expect(segundo).toMatchObject({
      ok: false,
      motivo: 'titulo_duplicado',
      conflicto: { titulo: 'El Principito', editorial: 'Emecé' },
    });
    expect(contenido(db).libros).toBe(1);
  });

  it('revierte el libro y el otro historial si falla un INSERT de historial (AC-10, NFR-02)', () => {
    intervenirPrepare(db, (sql) =>
      sql.includes('INSERT INTO historial_stock')
        ? {
            run: () => {
              throw new Error('disk I/O error');
            },
          }
        : undefined,
    );

    expect(() => crearLibro(entrada(), db)).toThrow(/disk I\/O error/);

    expect(contenido(db)).toEqual(BASE_VACIA);
  });

  it('mantiene una sola restricción UNIQUE en libros, la de la identidad del título', () => {
    // Test-guardia de la rama `esViolacionDeUnique()`: el `catch` mira el `code` del error,
    // que no dice *qué* UNIQUE se violó, y trata cualquiera como un choque de identidad. Eso
    // sólo es correcto mientras haya exactamente uno. Si mañana aparece otro —un
    // `UNIQUE (libro_id, fecha)` en un historial es una migración razonable, porque los pasos
    // 5 y 6 comparten el mismo `ahora` al milisegundo—, un choque ahí entraría por esta rama,
    // la reconsulta no encontraría conflicto y la usuaria recibiría el error fabricado que
    // habla del título. Que se ponga rojo acá obliga a revisar la rama antes de producción.
    expect(db.prepare(SQL_UNICOS_DE_LIBROS).all()).toEqual([
      { indice: 'sqlite_autoindex_libros_1', columna: 'titulo_normalizado' },
    ]);
  });

  it('traduce un SQLITE_CONSTRAINT_UNIQUE tardío a titulo_duplicado sin propagarlo', () => {
    const primero = crearLibro(entrada(), db);
    expect(primero.ok).toBe(true);
    if (!primero.ok) return;

    const stub = mentirUnaVezEnElSelectDeConflicto(db);

    const segundo = crearLibro(entrada({ titulo: 'El Aleph', editorial: 'Emecé' }), db);

    stub.confirmarQueMintio();
    expect(segundo).toEqual({
      ok: false,
      motivo: 'titulo_duplicado',
      conflicto: { id: primero.libro.id, titulo: 'El Aleph', editorial: 'Sur' },
    });
    expect(contenido(db)).toEqual({ libros: 1, historialPrecio: 1, historialStock: 1 });
  });

  it('propaga un fallo de conexión en vez de convertirlo en un resultado de negocio', async () => {
    const directorio = rutaTemporal('libros-fallo-conexion');
    vi.resetModules();
    vi.doMock('better-sqlite3', () => ({
      default: class {
        constructor() {
          throw new Error('SQLITE_CANTOPEN: unable to open database file');
        }
      },
    }));

    try {
      process.env.PUENTES_DB_PATH = path.join(directorio, 'puentes.db');
      const { cerrarDb } = await import('@/lib/db/conexion');
      cerrarDb();
      const { crearLibro: crearLibroSinConexion } = await import('@/lib/db/libros');

      expect(() => crearLibroSinConexion(entrada())).toThrow(/SQLITE_CANTOPEN/);
    } finally {
      const { cerrarDb } = await import('@/lib/db/conexion');
      cerrarDb();
      vi.doUnmock('better-sqlite3');
      vi.resetModules();
      restaurarEntorno();
      fs.rmSync(directorio, { recursive: true, force: true });
    }
  });

  it('no expone texto de SQLite en ninguno de sus rechazos', () => {
    const invalido = crearLibro(entrada({ precio: 'abc' }), db);
    crearLibro(entrada(), db);
    const duplicado = crearLibro(entrada({ titulo: 'el aleph' }), db);

    const stub = mentirUnaVezEnElSelectDeConflicto(db);
    const uniqueTardio = crearLibro(entrada({ titulo: 'El Aleph' }), db);
    stub.confirmarQueMintio();

    // Los tres son rechazos de negocio con su forma completa: el test no se contenta con
    // la ausencia de `SQLITE_`, que una respuesta vacía también satisfaría.
    expect(invalido).toMatchObject({ motivo: 'campos_invalidos' });
    expect(duplicado).toMatchObject({
      motivo: 'titulo_duplicado',
      conflicto: { titulo: 'El Aleph' },
    });
    expect(uniqueTardio).toMatchObject({
      motivo: 'titulo_duplicado',
      conflicto: { editorial: 'Sur' },
    });

    for (const resultado of [invalido, duplicado, uniqueTardio]) {
      const serializado = JSON.stringify(resultado);
      expect(serializado).not.toMatch(/SQLITE_/);
      expect(serializado).not.toMatch(/constraint/i);
      expect(serializado).not.toMatch(/titulo_normalizado/);
    }
  });

  it('sanea el error si la base reporta UNIQUE y el conflicto no aparece', () => {
    // Rama imposible en un solo proceso, pero es el único camino en el que el error de
    // SQLite podría escapar: se comprueba que lo que sale es genérico.
    intervenirPrepare(db, (sql) =>
      sql.includes('INSERT INTO libros')
        ? {
            run: () => {
              const error = new Error(
                'SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: libros.titulo_normalizado',
              ) as Error & { code: string };
              error.code = 'SQLITE_CONSTRAINT_UNIQUE';
              throw error;
            },
          }
        : undefined,
    );

    let capturado: unknown;
    try {
      crearLibro(entrada(), db);
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(Error);
    expect((capturado as Error).message).not.toMatch(/SQLITE_/);
    expect((capturado as Error).message).not.toMatch(/titulo_normalizado/);
    expect(contenido(db)).toEqual(BASE_VACIA);
  });
});

describe('crearLibro() con el campo foto (FEAT-001c Block 2)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = baseDePrueba();
  });

  afterEach(() => {
    db.close();
  });

  it('sigue creando el libro sin pasar el parámetro de foto (regresión de las llamadas existentes)', () => {
    const resultado = crearLibro(entrada(), db);

    expect(resultado.ok).toBe(true);
    expect(contenido(db)).toEqual({ libros: 1, historialPrecio: 1, historialStock: 1 });
  });

  it('rechaza una foto inválida igual que cualquier otro campo, sin persistir nada', () => {
    const resultado = crearLibro(entrada(), db, {
      ok: false,
      error: { campo: 'foto', detalle: 'formato_no_admitido' },
    });

    expect(resultado).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [{ campo: 'foto', detalle: 'formato_no_admitido' }],
    });
    expect(contenido(db)).toEqual(BASE_VACIA);
  });

  it('junta el rechazo de foto con el de otro campo inválido, uno por campo', () => {
    const resultado = crearLibro(entrada({ titulo: '' }), db, {
      ok: false,
      error: { campo: 'foto', detalle: 'demasiado_grande' },
    });

    expect(resultado).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [
        { campo: 'titulo', detalle: 'vacio' },
        { campo: 'foto', detalle: 'demasiado_grande' },
      ],
    });
    expect(contenido(db)).toEqual(BASE_VACIA);
  });

  it('crea el libro igual cuando la foto es válida, sin que el buffer llegue a la base', () => {
    const resultado = crearLibro(entrada(), db, {
      ok: true,
      valor: Buffer.from('contenido-de-prueba'),
    });

    expect(resultado.ok).toBe(true);
    expect(contenido(db)).toEqual({ libros: 1, historialPrecio: 1, historialStock: 1 });
  });
});

describe('convenciones de lib/db/libros.ts', () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), 'lib/db/libros.ts'), 'utf8');

  it('marca server-only antes que ningún otro import', () => {
    expect(fuente.match(/^import .*$/m)?.[0]).toBe("import 'server-only';");
  });

  it('no interpola ni concatena nada dentro de una sentencia SQL', () => {
    // Ninguna línea de SQL lleva `${}` ni un `+`: los valores viajan siempre por los
    // parámetros del prepared statement (mitigación 2). Los comentarios quedan afuera del
    // filtro para que la prosa no dispare falsos positivos.
    const lineasSql = fuente
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => !linea.startsWith('//') && !linea.startsWith('*'))
      .filter((linea) =>
        /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|FROM|WHERE|VALUES)\b/.test(linea),
      );

    expect(lineasSql.length).toBeGreaterThan(0);
    for (const linea of lineasSql) {
      expect(linea).not.toMatch(/\$\{/);
      expect(linea).not.toMatch(/\+/);
    }
  });
});
