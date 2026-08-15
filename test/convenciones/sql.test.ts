import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  comparaElIdPorRango,
  conBarras,
  declaracionesEsperadas,
  declaracionesSql,
  declaraSql,
  filtraPorClavePrimaria,
  modulosDeDb,
  sinComentarios,
  tocaLaTablaLibros,
} from '@/test/ayudas/convenciones-sql';
import * as registradores from '@/test/ayudas/guardias-sql';
import { guardiaDeConvencionesDeSql, guardiaDeSqlSinPreparar } from '@/test/ayudas/guardias-sql';

/**
 * Las meta-guardias del reconocedor de SQL compartido (`test/ayudas/convenciones-sql.ts`).
 *
 * **Por qué acá y no en el test de un módulo.** Ese archivo es infraestructura de tres guardias: la
 * de `lib/db/consultas.ts` (a qué sentencia se le exige el `ORDER BY`), la de `lib/db/ventas.ts`
 * (que toda sentencia que opera sobre una fila de `libros` la elija por su clave primaria) y, en el
 * Block 5, la de `lib/db/edicion.ts`. Sus aserciones vivían dentro de
 * `describe('convenciones de lib/db/consultas.ts')`, en `test/db/consultas.test.ts`: ahí quedaban a
 * merced de que alguien reescribiera o borrara un describe que habla de **otro** módulo, y con él el
 * reconocedor se quedaba sin una sola aserción mientras la guardia de `ventas.ts` seguía apoyándose
 * en un lookbehind que ya nadie prueba. Las cuatro que se movieron llegaron **sin una aserción
 * cambiada**; las que se agregaron son las de las formas de escribir SQL que el reconocedor no veía.
 *
 * Todas van contra **literales** y no contra el archivo: reescribir una sentencia de producción no
 * debe mover este test.
 */

describe('el reconocedor del filtro por clave primaria', () => {
  it('reconoce el filtro por clave primaria y sólo ése', () => {
    // Meta-guardia del patrón, contra literales y no contra el archivo: reescribir una sentencia
    // no debe mover este test, y un patrón que mordiera `libro_id` o `estado` exceptuaría del
    // `ORDER BY` a sentencias que sí ordenan.
    expect(filtraPorClavePrimaria('WHERE id = ?')).toBe(true);
    expect(filtraPorClavePrimaria("WHERE estado = 'activo'\n AND id = ?")).toBe(true);
    expect(filtraPorClavePrimaria('WHERE libro_id = ?')).toBe(false);
    expect(filtraPorClavePrimaria('WHERE l.id = ?')).toBe(false);

    // Y las **tres** formas en que la cadena aparece sin ser un filtro: dentro de un literal de
    // texto, dentro de un comentario de línea y dentro de un comentario de bloque. Las tres
    // exceptuaban de más, y el `/* */` era el que quedaba: es comentario válido en SQLite, así que
    // `/* id = ? */` disfrazaba una sentencia sin `ORDER BY` y sin filtro por clave primaria
    // mientras `-- id = ?` daba rojo. El modelo del despeje es `sinComentarios()` de
    // `test/convenciones/red.test.ts`, que ya trataba las dos formas de comentario.
    expect(filtraPorClavePrimaria("WHERE titulo = 'id = ?'")).toBe(false);
    expect(filtraPorClavePrimaria('-- id = ?\n WHERE estado = 3')).toBe(false);
    expect(filtraPorClavePrimaria('/* id = ? */ WHERE estado = 3')).toBe(false);
    // Y la cuarta, que es la que quedaba: el comentario de bloque **sin cerrar**. SQLite comenta
    // hasta el fin de la entrada, así que `/* id = ?` es comentario para el motor; para un despeje
    // que exigiera el `*​/` era un filtro por clave primaria, y con él una sentencia sin `ORDER BY`
    // y sin filtro quedaba exceptuada. Va en las dos formas —al final y con SQL después— porque un
    // patrón anclado a `$` sólo cubriría la primera.
    expect(filtraPorClavePrimaria('WHERE estado = 3 /* id = ?')).toBe(false);
    expect(filtraPorClavePrimaria('/* id = ?\n WHERE estado = 3')).toBe(false);
    // Sin dejar ciego al filtro de verdad cuando conviven con él.
    expect(filtraPorClavePrimaria("-- busca por id\n WHERE titulo = 'x' AND id = ?")).toBe(true);
    // Y el despeje de bloque no se puede comer el SQL que hay entre dos comentarios: con un
    // cuantificador voraz, este filtro legítimo desaparecería y la guardia exigiría de más.
    expect(filtraPorClavePrimaria('/* uno */ WHERE id = ? /* dos */')).toBe(true);
    expect(filtraPorClavePrimaria("WHERE estado = 'activo' ORDER BY titulo_orden")).toBe(false);
  });

  it('no deja que un comentario satisfaga las reglas que no se acotan', () => {
    // Meta-guardia del despeje de las **dos reglas no acotadas** (M5), contra literales y no contra
    // el archivo: `estado = 'activo'` es una exigencia, así que un comentario que la nombre la
    // satisfaría sobre la sentencia cruda y la sentencia quedaría sin filtrar por estado. Es la
    // dirección peligrosa —la guardia deja de exigir— y la misma que ya se había cerrado para la
    // excepción del `ORDER BY`.
    expect(sinComentarios("-- estado = 'activo'\n SELECT id FROM libros")).not.toMatch(
      /estado = 'activo'/u,
    );
    expect(sinComentarios("/* estado = 'activo' */ SELECT id FROM libros")).not.toMatch(
      /estado = 'activo'/u,
    );
    expect(sinComentarios("/* estado = 'activo'\n SELECT id FROM libros")).not.toMatch(
      /estado = 'activo'/u,
    );

    // Y el filtro de verdad sobrevive al despeje: si no, la regla se pondría roja contra el código
    // correcto y la reacción previsible a ese rojo es borrar la guardia. Con el literal intacto,
    // que es por lo que el despeje de literales no se aplica a esta regla.
    expect(sinComentarios("WHERE estado = 'activo' -- el catálogo activo")).toMatch(
      /estado = 'activo'/u,
    );
    expect(sinComentarios('ORDER BY titulo_orden')).toMatch(/ORDER BY\s+titulo_orden/u);
  });
});

describe('el reconocedor de las sentencias que operan sobre la tabla libros', () => {
  it('reconoce qué sentencias tocan la tabla libros y cuáles no', () => {
    // Meta-guardia del particionado, contra literales y no contra el archivo: reescribir una
    // sentencia no debe mover este test. Un patrón demasiado angosto dejaría a la sentencia del
    // descuento fuera de la lista y la guardia pasaría en silencio sobre un `UPDATE` sin filtro.
    expect(tocaLaTablaLibros('SELECT stock, precio FROM libros WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros('UPDATE libros SET stock = ? WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros('INSERT INTO historial_stock (libro_id, fecha) VALUES (?, ?)')).toBe(
      false,
    );
    expect(tocaLaTablaLibros('INSERT INTO ventas (libro_id, fecha) VALUES (?, ?)')).toBe(false);

    // Y la palabra que aparece sin ser el sujeto de la sentencia: dentro de un literal de texto,
    // de un comentario de línea y de uno de bloque. Acá la dirección peligrosa es la inversa que en
    // el filtro —incluir de más pone roja una sentencia correcta—, y de las dos conviene saber cuál
    // es cuál.
    expect(tocaLaTablaLibros("SELECT titulo FROM ventas WHERE titulo = 'FROM libros'")).toBe(false);
    expect(tocaLaTablaLibros('-- FROM libros\n SELECT 1')).toBe(false);
    expect(tocaLaTablaLibros('/* UPDATE libros */ SELECT 1')).toBe(false);
  });

  it('reconoce las cinco formas en que SQLite admite escribir el nombre de la tabla', () => {
    // Las cinco están verificadas contra el motor: las cinco compilan y operan sobre la misma
    // tabla. El patrón anterior —`\b(?:FROM|UPDATE|JOIN|INTO)\s+libros\b`— sólo veía la primera, y
    // eso lo hacía fallar **abierto** para cualquier sentencia nueva: se le agregó a
    // `lib/db/ventas.ts` una tercera sentencia `UPDATE main.libros SET stock = ? WHERE id >= ?`,
    // ejecutada de verdad dentro de la transacción de la venta, y la suite quedó entera en verde.
    // El Block 5 agrega sentencias nuevas, así que la forma de cerrarlo es el reconocedor y no una
    // aserción por sentencia.
    expect(tocaLaTablaLibros('UPDATE main.libros SET stock = ? WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros('SELECT stock FROM main . libros WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros('UPDATE "libros" SET stock = ? WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros('UPDATE [libros] SET stock = ? WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros('UPDATE `libros` SET stock = ? WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros("UPDATE 'libros' SET stock = ? WHERE id = ?")).toBe(true);
    expect(tocaLaTablaLibros('UPDATE OR ROLLBACK libros SET stock = ? WHERE id = ?')).toBe(true);
    expect(tocaLaTablaLibros('INSERT OR IGNORE INTO libros (titulo) VALUES (?)')).toBe(true);
    expect(tocaLaTablaLibros('SELECT stock FROM temp.libros WHERE id = ?')).toBe(true);

    // Y lo que **no** debe arrastrar el ensanchamiento: otra tabla cuyo nombre empieza igual, y la
    // tabla nombrada en una restricción, que no lee ni escribe ninguna fila.
    expect(tocaLaTablaLibros('SELECT * FROM libros_archivados WHERE id = ?')).toBe(false);
    expect(tocaLaTablaLibros('REFERENCES libros (id) ON DELETE RESTRICT')).toBe(false);
    expect(tocaLaTablaLibros("SELECT 1 WHERE titulo = 'UPDATE main.libros'")).toBe(false);
  });

  it('reconoce el comparador de rango y no confunde la igualdad con uno', () => {
    // Meta-guardia del segundo patrón, también sobre literales. La mutación que esta guardia
    // existe para cazar es el `AND id >= ?` en el `SELECT` de control.
    expect(comparaElIdPorRango('WHERE id >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id > ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id <= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id < ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id <> ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id != ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id BETWEEN ? AND ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id IN (?, ?)')).toBe(true);
    // Y en minúscula, que es SQL igual de válido: sin el flag insensible, `between` se colaba.
    expect(comparaElIdPorRango('WHERE id between ? and ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE id like ?')).toBe(true);

    // La columna citada y la calificada por la tabla, que son SQL igual de válido y por las que el
    // patrón anterior fallaba **abierto**: `libros.id >= ?` no lo veía. Acá la asimetría con
    // `filtraPorClavePrimaria()` —que trata `l.id = ?` como si no filtrara— es deliberada: allá el
    // reconocedor decide una excepción y equivocarse de menos exige de más; acá decide una
    // prohibición, y no ver una forma es dejar de prohibirla.
    expect(comparaElIdPorRango('WHERE "id" >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE [id] >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE `id` >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE libros.id >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE l.id >= ?')).toBe(true);

    // La igualdad exacta no es un rango, y la columna del historial no es esta clave primaria.
    expect(comparaElIdPorRango('WHERE id = ?')).toBe(false);
    expect(comparaElIdPorRango("WHERE estado = 'activo'\n AND id = ?")).toBe(false);
    expect(comparaElIdPorRango('WHERE libro_id >= ?')).toBe(false);
    expect(comparaElIdPorRango('WHERE historial.libro_id >= ?')).toBe(false);
    expect(comparaElIdPorRango('id INTEGER PRIMARY KEY AUTOINCREMENT')).toBe(false);
    // Y las columnas del catálogo que terminan pareciéndose, para que el ensanchamiento de abajo no
    // ponga roja una sentencia correcta: sin estas dos, un `oid` mordido de más exigiría de más.
    expect(comparaElIdPorRango('WHERE titulo_orden LIKE ?')).toBe(false);
    expect(comparaElIdPorRango('WHERE editorial_normalizada LIKE ?')).toBe(false);
    // Ni un rango escrito donde no es SQL: si contara, pondría roja una sentencia correcta.
    expect(comparaElIdPorRango("WHERE titulo = 'id >= ?' AND id = ?")).toBe(false);
    expect(comparaElIdPorRango('-- id >= ?\n WHERE id = ?')).toBe(false);
    expect(comparaElIdPorRango('/* id >= ? */ WHERE id = ?')).toBe(false);
  });

  it('reconoce los tres alias del rowid, que son la misma clave primaria escrita de otro modo', () => {
    // SQLite deja elegir la fila de una tabla con `INTEGER PRIMARY KEY` por `rowid`, por `_rowid_` o
    // por `oid`, y las tres son la misma columna. Sin ellas, un `WHERE rowid >= ?` se colaba **hasta
    // en un módulo registrado**: el barrido universal de `lib/db/` sólo mira este patrón, y
    // `filtraPorClavePrimaria()` —que sí lo hubiera cazado— no alcanza a los módulos que no
    // registran esa guardia. Verificado contra el motor: la sentencia con `rowid` compila y opera
    // sobre las mismas filas.
    //
    // Son un conjunto **cerrado de tres** y no una familia abierta, que es lo que hace que
    // enumerarlos cierre el hueco en vez de empezar una persecución.
    expect(comparaElIdPorRango('WHERE rowid >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE _rowid_ >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE oid >= ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE ROWID BETWEEN ? AND ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE libros.rowid > ?')).toBe(true);
    expect(comparaElIdPorRango('WHERE "rowid" != ?')).toBe(true);

    // Y la igualdad exacta sobre el alias sigue sin ser un rango, igual que sobre `id`: lo que la
    // rechaza en un módulo registrado es `filtraPorClavePrimaria()`, que no la reconoce como filtro.
    expect(comparaElIdPorRango('WHERE rowid = ?')).toBe(false);
    expect(filtraPorClavePrimaria('WHERE rowid = ?')).toBe(false);
  });
});

/**
 * El barrido completo de `lib/db/`, derivado y sin lista de módulos.
 *
 * **Lo que promete, exactamente y nada más:** ninguna sentencia declarada en `lib/db/` elige un libro
 * por un comparador de rango. Una sola regla, aplicada a todos los módulos.
 *
 * **Lo que no promete, y antes decía prometer.** La prosa anterior afirmaba que «un módulo nuevo que
 * se olvide de llamar a su guardia queda igual cubierto contra la peor de las mutaciones». Es falso,
 * y se demostró con cuatro formas invisibles para este barrido —una constante con dígitos en el
 * nombre, un `db.prepare()` sin constante, un `WHERE rowid >= ?` y una interpolación con `${}`, que
 * es M9— y con un `UPDATE "main"."libros" … WHERE id >= ?` **ejecutándose de verdad** dentro de la
 * transacción de la venta, con la suite entera en verde. Dos de esas cuatro las cierra esta ronda —el
 * patrón con dígitos y los alias del rowid—; las otras dos no son cerrables angostando este barrido,
 * porque las reglas que las cazan no pueden ser universales.
 *
 * **Por eso la promesa se achicó y en su lugar el registro se volvió obligatorio.** Enumerar formas
 * de nombrar una tabla en SQLite no tiene fondo; exigir que todo módulo de `lib/db/` que declare SQL
 * esté registrado en una guardia es una propiedad finita y cerrada. Lo hace el describe de más abajo.
 */
describe('ninguna sentencia de lib/db elige un libro por rango (AC-02, M5)', () => {
  const modulos = modulosDeDb();

  const sentencias = modulos.flatMap((relativo) =>
    declaracionesSql(relativo).map((declaracion) => ({ ...declaracion, relativo })),
  );

  const sobreLibros = sentencias.filter(({ sentencia }) => tocaLaTablaLibros(sentencia));

  it('el barrido encuentra las sentencias de más de un módulo', () => {
    // Meta-guardia del barrido: con la lista vacía —o con las de un solo módulo— la guardia de abajo
    // pasaría sin haber mirado nada. Se nombran las tres que hoy eligen una fila de `libros` en tres
    // módulos distintos, y se exige que el extractor no se haya comido ninguna declaración de
    // ninguno: un módulo que declarara su SQL de otra forma saldría del barrido en silencio.
    const nombres = sobreLibros.map(({ nombre }) => nombre);

    expect(nombres).toContain('SQL_DESCONTAR_STOCK');
    expect(nombres).toContain('SQL_LIBRO_POR_ID');
    expect(nombres).toContain('SQL_ESCRIBIR_IDENTIDAD');
    expect(new Set(sobreLibros.map(({ relativo }) => relativo)).size).toBeGreaterThan(2);

    for (const relativo of modulos) {
      expect(declaracionesSql(relativo), relativo).toHaveLength(declaracionesEsperadas(relativo));
    }
  });

  it('ninguna compara el identificador del libro por rango', () => {
    expect(sobreLibros.length).toBeGreaterThan(0);

    for (const { relativo, nombre, sentencia } of sobreLibros) {
      expect(
        comparaElIdPorRango(sentencia),
        `${relativo} → ${nombre}: elige la fila de libros por un comparador de rango`,
      ).toBe(false);
    }
  });
});

/**
 * El registro de guardias es **obligatorio**: todo módulo de `lib/db/` que declara SQL tiene la suya.
 *
 * Es la propiedad que reemplaza a la promesa que el barrido de arriba no podía cumplir. La elección
 * está escrita: enumerar formas de escribir el nombre de una tabla en SQLite no tiene fondo —el
 * calificador de esquema citado sigue abierto, y está documentado como desvío en
 * `test/convenciones/mutaciones-de-identidad.md`—, mientras que «todo módulo que declara SQL está
 * registrado» es finita, cerrada y se comprueba de una sola forma.
 *
 * **Las dos listas se derivan; ninguna se escribe a mano.** La de módulos sale del recorrido de
 * `lib/db/`; la de registros, de leer el fuente de las suites y resolver a qué módulo apunta cada
 * llamada a un registrador. Y los registradores tampoco se enumeran: salen de los exports de
 * `test/ayudas/guardias-sql.ts`, así que un registrador nuevo entra solo.
 */
describe('todo módulo de lib/db que declara SQL tiene su guardia registrada (M9)', () => {
  /** Los registradores de guardias, derivados de lo que exporta el módulo que los define. */
  const REGISTRADORES = Object.entries(registradores)
    .filter(([, valor]) => typeof valor === 'function')
    .map(([nombre]) => nombre);

  /** Toda suite `.test.ts(x)` bajo `test/`, recursivo: ahí es donde se registran las guardias. */
  function suites(directorio = path.join(process.cwd(), 'test')): string[] {
    return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const completo = path.join(directorio, entrada.name);

      if (entrada.isDirectory()) {
        return suites(completo);
      }

      return /\.test\.tsx?$/u.test(entrada.name) ? [path.relative(process.cwd(), completo)] : [];
    });
  }

  const LITERAL = /'([^']*)'|"([^"]*)"/gu;
  const IDENTIFICADOR = /^[A-Za-z_$][\w$]*$/u;

  function literalesDe(expresion: string): string[] {
    return Array.from(expresion.matchAll(LITERAL), (encontrado) => encontrado[1] ?? encontrado[2]);
  }

  /**
   * La ruta que vigila un registro, resuelta desde la expresión escrita en el `relativo:`.
   *
   * Se admiten las dos formas que aparecen hoy: el literal (`'lib/db/consultas.ts'`) y el
   * `path.join('lib', 'db', 'ventas.ts')`, directo o a través de una constante del mismo archivo.
   * Cualquier otra cosa devuelve `undefined` y la guardia la reporta en vez de saltearla: un registro
   * que no se puede resolver es un módulo que nadie sabe si está vigilado.
   */
  function rutaDelRegistro(expresion: string, fuente: string): string | undefined {
    const directos = literalesDe(expresion);

    if (directos.length > 0) {
      return directos.join('/');
    }

    if (!IDENTIFICADOR.test(expresion)) {
      return undefined;
    }

    const declarado = new RegExp(
      String.raw`\b(?:const|let|var)\s+${expresion}\s*=\s*([^;]*);`,
      'u',
    ).exec(fuente);
    const indirectos = declarado === null ? [] : literalesDe(declarado[1]);

    return indirectos.length > 0 ? indirectos.join('/') : undefined;
  }

  interface Registro {
    suite: string;
    registrador: string;
    expresion: string;
    modulo?: string;
  }

  const REGISTROS: Registro[] = suites().flatMap((suite) => {
    const fuente = fs.readFileSync(path.join(process.cwd(), suite), 'utf8');

    return REGISTRADORES.flatMap((registrador) =>
      Array.from(
        fuente.matchAll(new RegExp(String.raw`\b${registrador}\s*\(\s*\{([^}]*)\}`, 'gu')),
        (encontrado) => {
          const expresion = /\brelativo\s*:\s*([^,\n}]+)/u.exec(encontrado[1])?.[1].trim() ?? '';

          return { suite, registrador, expresion, modulo: rutaDelRegistro(expresion, fuente) };
        },
      ),
    );
  });

  const CON_SQL = modulosDeDb().filter(declaraSql).map(conBarras);

  it('encuentra los registradores y los módulos que declaran SQL', () => {
    // Meta-guardia de las dos derivaciones: con cualquiera de las dos vacía, la exigencia de abajo
    // pasaría sin haber comparado nada. Los seis módulos de hoy se nombran acá y sólo acá.
    expect(REGISTRADORES).toContain('guardiaDeConvencionesDeSql');
    expect(REGISTRADORES).toContain('guardiaDeSentenciasSobreUnLibro');
    expect(REGISTRADORES).toContain('guardiaDeSqlSinPreparar');

    expect(CON_SQL).toContain('lib/db/ventas.ts');
    expect(CON_SQL).toContain('lib/db/libros.ts');
    expect(CON_SQL).toContain('lib/db/consultas.ts');
    // Los tres de `migraciones/`, que el patrón `SQL_[A-Z_]+` no veía por los dígitos del nombre:
    // sin el arreglo, la lista nacía incompleta y el registro obligatorio no los alcanzaba.
    expect(CON_SQL).toContain('lib/db/migraciones/001-inicial.ts');
    expect(CON_SQL).toContain('lib/db/migraciones/002-ventas.ts');
    expect(CON_SQL).toContain('lib/db/migraciones/003-identidad.ts');
  });

  it('resuelve cada registro al módulo que vigila, sin saltearse ninguno', () => {
    expect(REGISTROS.length).toBeGreaterThan(1);
    expect(
      REGISTROS.filter(({ modulo }) => modulo === undefined).map(
        ({ suite, registrador, expresion }) =>
          `${suite}: ${registrador}({ relativo: ${expresion} })`,
      ),
    ).toEqual([]);

    // Y los registros apuntan a módulos que existen: una ruta mal resuelta —o un módulo renombrado—
    // dejaría un registro huérfano y, del otro lado, un módulo sin guardia que esta suite reportaría
    // como si le faltara el registro que sí está escrito.
    for (const { suite, modulo } of REGISTROS) {
      expect(
        fs.existsSync(path.join(process.cwd(), modulo ?? '')),
        `${suite}: ${modulo ?? ''}`,
      ).toBe(true);
    }
  });

  it('ninguno se quedó sin registrar', () => {
    const registrados = new Set(REGISTROS.map(({ modulo }) => modulo));

    expect(
      CON_SQL.filter((relativo) => !registrados.has(relativo)),
      'declaran SQL y ninguna guardia los vigila',
    ).toEqual([]);
  });
});

/*
 * Los registros de los módulos que no tienen suite propia donde ponerlos.
 *
 * `lib/db/ventas.ts` se registra desde `test/db/ventas.test.ts`, que es su suite. Éstos cinco no
 * tienen dónde: `consultas.ts` y `libros.ts` son de FEAT-001a y sus suites hablan de otras
 * propiedades, y las tres migraciones se prueban por su efecto sobre el esquema, no por su fuente.
 * Registrarlos acá —junto a la guardia que los exige— es lo que hace que la exigencia de arriba sea
 * satisfacible sin repartir cinco líneas por cinco archivos.
 */
guardiaDeConvencionesDeSql({ relativo: 'lib/db/consultas.ts' });
guardiaDeConvencionesDeSql({ relativo: 'lib/db/libros.ts' });
guardiaDeConvencionesDeSql({ relativo: 'lib/db/migraciones/003-identidad.ts' });

// Las dos de DDL puro: su texto lo ejecuta el runner con `db.exec()`, así que no preparan nada.
guardiaDeSqlSinPreparar({ relativo: 'lib/db/migraciones/001-inicial.ts' });
guardiaDeSqlSinPreparar({ relativo: 'lib/db/migraciones/002-ventas.ts' });
