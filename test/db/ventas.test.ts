import fs from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { venderEjemplar } from '@/lib/db/ventas';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';
import {
  contenido,
  entradasDeStock,
  filaDelLibro,
  PRIMER_ID,
  sembrarDosLibros,
  ventas,
} from '@/test/ayudas/catalogo-de-prueba';
import { despejar, modulosDeDb } from '@/test/ayudas/convenciones-sql';
import {
  guardiaDeConvencionesDeSql,
  guardiaDeSentenciasSobreUnLibro,
} from '@/test/ayudas/guardias-sql';

/**
 * Tests de la venta (FEAT-001b Block 4: FR-02, FR-07, FR-08, AC-02, AC-03, AC-11).
 *
 * La siembra sale de `test/ayudas/catalogo-de-prueba.ts`, que da de alta **dos** libros por el camino
 * real de `crearLibro()`. Las dos decisiones tienen su razón:
 *
 * - **Dos libros y no uno**, en todos los caminos y no sólo en los sad paths: con un solo libro
 *   sembrado `libro.id` vale 1, y entonces cualquier constante clavada en el código —el `libro_id` de
 *   la entrada de historial, el `id` del `UPDATE`, los tres campos del payload de retorno— escribe y
 *   devuelve exactamente lo mismo que el código correcto. Los tests afirman sobre el **segundo**
 *   libro, que es el único cuyo id no es 1. Las aserciones que sostienen eso viven dentro de la
 *   siembra, así que ningún test nuevo puede olvidarlas.
 * - **Por el camino del alta y no con un `INSERT` propio**: la venta opera sobre un catálogo real
 *   —con sus dos entradas de historial de alta— y así los conteos de "no se escribió nada" se miden
 *   contra el estado que deja el camino de escritura de verdad.
 */

/** ISO-8601 en UTC al milisegundo, la misma forma que escribe el alta. */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/** Un ejemplar por venta, para escribir la resta esperada sin repetir el número. */
const UN_EJEMPLAR = 1;

const SQL_ARCHIVAR = "UPDATE libros SET estado = 'archivado' WHERE id = ?";
const SQL_FIJAR_PRECIO = 'UPDATE libros SET precio = ? WHERE id = ?';

type Preparar = Database.Database['prepare'];

/**
 * Reemplaza `db.prepare` en **esta** instancia para intervenir sentencias puntuales, igual que
 * `test/db/libros.test.ts`: la intervención devuelve un objeto con sólo el método que la sentencia
 * interceptada va a recibir, porque los del `Statement` real son nativos y esperan su propio
 * `this`. `db.transaction()` prepara su BEGIN/COMMIT/ROLLBACK contra el objeto nativo interno, así
 * que el parche no puede romper la transacción.
 */
function intervenirPrepare(
  db: Database.Database,
  intervencion: (sql: string) => object | undefined,
): void {
  const preparar = db.prepare.bind(db) as (sql: string) => unknown;
  db.prepare = ((sql: string) => intervencion(sql) ?? preparar(sql)) as unknown as Preparar;
}

describe('venderEjemplar()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = baseDePrueba();
  });

  afterEach(() => {
    db.close();
  });

  it('descuenta 1 ejemplar y registra la venta y el historial de stock (AC-02, FR-07, FR-08)', () => {
    const { primero, segundo } = sembrarDosLibros(db);

    // Una venta previa sobre el **otro** libro, y no un adorno: sin ella la fila que esta venta
    // escribe es la primera de `ventas`, y entonces `id: 1` clavado en el payload de retorno
    // devuelve lo mismo que el `lastInsertRowid` de verdad. La previa la hace la operación real
    // porque es el único camino de escritura de la tabla.
    const previa = venderEjemplar(primero.id, db);
    expect(previa.ok, 'la venta previa de la preparación falló').toBe(true);

    const antes = contenido(db);
    const stockDelOtro = filaDelLibro(db, primero.id).stock;
    const vigente = filaDelLibro(db, segundo.id);

    const resultado = venderEjemplar(segundo.id, db);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    // 1. El stock de **este** libro quedó en S − 1, y el del otro no se movió: el `UPDATE` eligió
    //    la fila que se pidió y no otra.
    expect(filaDelLibro(db, segundo.id).stock).toBe(vigente.stock - UN_EJEMPLAR);
    expect(filaDelLibro(db, primero.id).stock).toBe(stockDelOtro);

    // 2. La venta, con fecha y con el precio vigente del libro (FR-07). La fila nueva es la última.
    const registradas = ventas(db);
    expect(registradas).toHaveLength(antes.ventas + 1);

    const fila = registradas[registradas.length - 1];
    expect(fila).toMatchObject({ libro_id: segundo.id, precio_venta: vigente.precio });
    expect(fila.fecha).toMatch(FECHA_ISO);
    // Y no quedó escrita con los datos del otro libro, que es lo que un `1` o un precio clavados
    // producirían: las dos negaciones son las que hacen falsable la línea de arriba.
    expect(fila.libro_id).not.toBe(primero.id);
    expect(fila.precio_venta).not.toBe(primero.precio);

    // 3. La entrada de historial de stock con S, S − 1, origen `venta` (FR-08) y el `libro_id` de
    //    **este** libro. Es la escritura que más cuesta equivocar: el Principio III prohíbe editar
    //    o borrar una entrada de historial, así que un `libro_id` mal escrito acá no tiene arreglo.
    const entradas = entradasDeStock(db);
    expect(entradas).toHaveLength(antes.historialStock + 1);
    expect(entradas[entradas.length - 1]).toMatchObject({
      libro_id: segundo.id,
      cantidad_anterior: vigente.stock,
      cantidad_resultante: vigente.stock - UN_EJEMPLAR,
      origen: 'venta',
      // Las tres escrituras comparten el mismo instante, como el alta: sin eso, reconstruir una
      // venta desde los dos rastros exigiría emparejarlos a ojo.
      fecha: fila.fecha,
    });
    expect(entradas[entradas.length - 1].libro_id).not.toBe(primero.id);

    // 4. Una venta nunca toca el precio, así que su historial no crece (PRD-001 RF-13).
    expect(contenido(db).historialPrecio).toBe(antes.historialPrecio);

    // 5. Y el resultado describe exactamente la fila que quedó escrita: los cuatro campos salen de
    //    la fila leída de la base, no de los valores esperados a mano. Clavar cualquiera de los tres
    //    que el código calcula —`id`, `libroId`, `precioVenta`— pone esto rojo.
    expect(resultado.venta).toEqual({
      id: fila.id,
      libroId: fila.libro_id,
      fecha: fila.fecha,
      precioVenta: fila.precio_venta,
    });

    // Y la fila con la que se compara no es la que un `1` clavado produciría: sin estas dos, la
    // comparación de arriba se satisfaría con el payload equivocado.
    expect(fila.id).not.toBe(PRIMER_ID);
    expect(fila.libro_id).not.toBe(PRIMER_ID);
  });

  it('con stock 0 rechaza con motivo tipado y no escribe nada (AC-03)', () => {
    // El primero tiene ejemplares y el segundo no: el rechazo se decide sobre la fila del libro
    // que se pide, no sobre la primera de la tabla.
    const { primero: conStock, segundo: libro } = sembrarDosLibros(db, {
      primero: { stock: '5' },
      segundo: { stock: '0' },
    });
    const antes = contenido(db);

    const resultado = venderEjemplar(libro.id, db);

    expect(resultado).toEqual({ ok: false, motivo: 'sin_stock' });

    // Ni el stock, ni la venta, ni el historial: el rechazo ocurre antes de la primera escritura.
    expect(filaDelLibro(db, libro.id).stock).toBe(0);
    // Y el libro con ejemplares quedó intacto: el rechazo no se cobró sobre el stock de otro.
    expect(filaDelLibro(db, conStock.id).stock).toBe(5);
    expect(contenido(db)).toEqual(antes);
    expect(ventas(db)).toEqual([]);
  });

  it('sobre un libro inexistente devuelve motivo tipado y no escribe nada (sad path)', () => {
    const { primero, segundo: libro } = sembrarDosLibros(db);
    const antes = contenido(db);

    const resultado = venderEjemplar(libro.id + 1, db);

    expect(resultado).toEqual({ ok: false, motivo: 'libro_inexistente' });
    expect(contenido(db)).toEqual(antes);
    // Los dos libros que sí están quedaron intactos: el id ausente no se resolvió a ninguna fila.
    expect(filaDelLibro(db, primero.id).stock).toBe(primero.stock);
    expect(filaDelLibro(db, libro.id).stock).toBe(libro.stock);

    // Y el `libro_inexistente` no es lo que devuelve siempre: el segundo id sembrado sí se vende,
    // y se vende **ése** —no el primero, que es el que un filtro laxo devolvería—.
    expect(venderEjemplar(libro.id, db).ok).toBe(true);
    expect(filaDelLibro(db, libro.id).stock).toBe(libro.stock - UN_EJEMPLAR);
    expect(filaDelLibro(db, primero.id).stock).toBe(primero.stock);
    expect(ventas(db)).toHaveLength(1);
    expect(ventas(db)[0]).toMatchObject({ libro_id: libro.id });
  });

  it('sobre un libro archivado responde igual que sobre uno inexistente', () => {
    // La baja lógica es de otra feature, así que el archivado se fuerza por SQL. La venta filtra
    // por estado por la misma razón que la lectura por id (M5, riesgo R6): un libro que no se
    // puede ver tampoco se puede vender, y hoy ningún test de negocio se pondría rojo sin eso.
    //
    // El **libro siguiente**, activo y con ejemplares, es lo que hace falsable el filtro por clave
    // primaria: con `AND id >= ?` en lugar de la igualdad exacta, vender el id archivado lee la
    // primera fila activa con id mayor —la del siguiente— y escribe con el `libro_id` **pedido**, el
    // del archivado, pero con el stock y el precio de esa otra fila. O sea que el rastro queda a
    // nombre del libro correcto y con los números de otro, que es peor que escribir el `libro_id`
    // equivocado porque no hay nada en la fila que lo delate. Con un solo libro sembrado, ese cambio
    // no ponía rojo nada.
    //
    // Los stocks de los dos libros tienen que ser **distintos**, y por eso salen del fixture: con el
    // siguiente en 4 y el archivado en 3, la escritura del rango dejaba `4 − 1 = 3` en la fila del
    // archivado y la aserción de abajo se satisfacía por coincidencia con el stock sembrado.
    const { primero: libro, segundo: siguiente } = sembrarDosLibros(db);
    db.prepare(SQL_ARCHIVAR).run(libro.id);
    const antes = contenido(db);

    expect(siguiente.id).toBeGreaterThan(libro.id);
    expect(siguiente.stock - UN_EJEMPLAR).not.toBe(libro.stock);

    expect(venderEjemplar(libro.id, db)).toEqual({ ok: false, motivo: 'libro_inexistente' });
    expect(filaDelLibro(db, libro.id).stock).toBe(libro.stock);
    // El siguiente no se vendió: ni su stock se movió, ni quedó rastro de venta.
    expect(filaDelLibro(db, siguiente.id).stock).toBe(siguiente.stock);
    expect(contenido(db)).toEqual(antes);
    expect(ventas(db)).toEqual([]);
    expect(entradasDeStock(db)).toHaveLength(antes.historialStock);
    expect(entradasDeStock(db).map((entrada) => entrada.origen)).not.toContain('venta');
  });

  it('si falla la escritura de la fila de ventas no persiste el descuento ni el historial (AC-11, NFR-01)', () => {
    const { primero, segundo: libro } = sembrarDosLibros(db);
    const antes = contenido(db);

    intervenirPrepare(db, (sql) =>
      sql.includes('INSERT INTO ventas')
        ? {
            run: () => {
              throw new Error('disk I/O error');
            },
          }
        : undefined,
    );

    expect(() => venderEjemplar(libro.id, db)).toThrow(/disk I\/O error/u);

    // Las tres escrituras son inseparables: la última que falla revierte las dos anteriores. Y el
    // otro libro tampoco quedó tocado: la reversión no puede medirse sobre una sola fila.
    expect(filaDelLibro(db, libro.id).stock).toBe(libro.stock);
    expect(filaDelLibro(db, primero.id).stock).toBe(primero.stock);
    expect(contenido(db)).toEqual(antes);
  });

  it('registra el precio vigente en la base y no el que tenía al darse de alta (M2, R3)', () => {
    const { primero, segundo: libro } = sembrarDosLibros(db);
    const precioVigente = 14_000;

    // El precio vigente se fuerza por SQL porque la edición es del Block 5. Lo que esto distingue
    // es de dónde sale el precio de la venta: del alta —que dejó el precio sembrado en su historial
    // de precio— o de la fila leída dentro de la transacción de la venta.
    db.prepare(SQL_FIJAR_PRECIO).run(precioVigente, libro.id);

    const resultado = venderEjemplar(libro.id, db);

    expect(resultado.ok).toBe(true);
    expect(ventas(db)[0]).toMatchObject({ precio_venta: precioVigente });
    // Ni el precio con el que se dio de alta, ni el del otro libro: los dos son valores que una
    // constante clavada o un `SELECT` sin filtro producirían.
    expect(ventas(db)[0].precio_venta).not.toBe(libro.precio);
    expect(ventas(db)[0].precio_venta).not.toBe(primero.precio);
  });

  it('no admite ningún precio por parámetro: el único dato que recibe es el id (M2, R3)', () => {
    // La mitad estructural de M2: un `POST` a mano no puede fijar a qué precio se vendió porque la
    // operación **no tiene** por dónde recibirlo.
    //
    // **Cubre media mutación, y conviene saber cuál.** `Function.length` cuenta los parámetros
    // hasta el primero con valor por defecto, así que esto caza un precio insertado **antes** de
    // `db` y **no** uno agregado después (`(id, db = obtenerDb(), precio?)`). La propiedad completa
    // —que del formulario no salga nada más que el identificador— la sostiene la aserción
    // `argumentosDeVenta` de `test/app/acciones-libro.test.ts`, que mira la llamada real. Esto es
    // el cinturón, no el tirante.
    expect(venderEjemplar.length).toBe(1);
  });
});

/**
 * La forma de la transacción de toda operación que escribe la base (M4, riesgo R5).
 *
 * **Por qué es una guardia de fuente y no un test de negocio.** El check-then-act que M4 cierra
 * —leer el valor vigente fuera de la transacción, o abrirla en modo diferido, que deja la misma
 * ventana entre el `SELECT` de control y la primera escritura— necesita dos escritores concurrentes
 * para producir un efecto observable, y este producto corre en un solo proceso: sacar la lectura
 * afuera o borrar el `.immediate()` deja **toda** la suite en verde. Es exactamente el argumento con
 * el que este bloque justifica sus otras guardias de convención, y la condición 2 de la
 * verificación final de la spec pide que las once mitigaciones tengan su test de regresión.
 *
 * **Alcance real, escrito para que nadie le suponga más.** Se deriva sobre los módulos de `lib/db/`
 * que abren su transacción con **`db.transaction(`**, que es la forma que usan las operaciones del
 * repositorio: hoy `libros.ts` (el alta, que arrastra la misma laguna desde FEAT-001a) y `ventas.ts`
 * (la venta). Una lista de un solo elemento es la forma que este ticket ya corrigió tres veces, así
 * que el barrido es automático dentro de esa forma. Leer `libros.ts` acá no lo modifica.
 *
 * **Lo que queda afuera, y por qué.** `lib/db/migrar.ts` también abre una transacción, pero con
 * `db.exec('BEGIN IMMEDIATE')` a mano, así que este filtro no lo alcanza y la guardia de abajo, que
 * habla de un callback y de `.immediate()`, no tendría qué mirar. No es un olvido: M4 declara su
 * alcance en la venta y en la edición, el runner tiene sus propios tests de reversión en
 * `test/db/migrar.test.ts`, y la propiedad que le corresponde —que su `BEGIN` sea `IMMEDIATE`— la
 * afirma acá abajo su propio test, para que el único módulo excluido no quede sin nada.
 */
describe('forma de las transacciones de lib/db (M4, R5)', () => {
  function leer(relativo: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
  }

  /*
   * El despeje —`despejar()`— vive en `test/ayudas/convenciones-sql.ts`. Lo necesita también la
   * guardia del registro obligatorio de `test/convenciones/sql.test.ts`, que derivaba sus registros
   * del fuente **crudo** y contaba como registro válido una llamada comentada. Dos copias del mismo
   * despeje divergen, y la que quedara más laxa sería la que deja de ver.
   *
   * Llegó con **un** cambio, y no toca lo que este describe le pide: aprendió a reconocer los
   * literales de expresión regular. Sobre módulos de `lib/db/` no hay ninguno —el límite estaba
   * declarado en este mismo docstring—, pero sobre el fuente de una suite, `/'([^']*)'/gu` abría una
   * cadena falsa con la comilla de adentro y blanqueaba el resto del archivo. Su meta-guardia sigue
   * en este archivo, más abajo, sin una aserción cambiada; la del caso nuevo está en
   * `test/convenciones/sql.test.ts`, que es donde vive el consumidor que lo necesitó.
   */

  /** El índice del cierre que corresponde a la apertura en `desde`, o `-1`. */
  function cierreDe(codigo: string, desde: number, apertura: string, cierre: string): number {
    let profundidad = 0;

    for (let indice = desde; indice < codigo.length; indice += 1) {
      if (codigo[indice] === apertura) {
        profundidad += 1;
      } else if (codigo[indice] === cierre) {
        profundidad -= 1;

        if (profundidad === 0) {
          return indice;
        }
      }
    }

    return -1;
  }

  interface Operacion {
    nombre: string;
    /** Lo que el cuerpo de la operación hace **antes** de abrir la transacción. */
    antes: string;
    /** El cuerpo del callback que recibe `db.transaction(`. */
    adentro: string;
    /** Lo que queda después de cerrar la transacción: ahí vive el `.immediate()`. */
    despues: string;
  }

  /**
   * Las funciones exportadas del módulo que abren una transacción, ya despejadas.
   *
   * **Reconoce una sola forma de firma a propósito, y no se le pide que las reconozca todas.** Un
   * genérico (`export function vender<T>(…)`), un tipo de retorno inline (`): { ok: boolean } {`,
   * donde el primer `{` es el del tipo y no el del cuerpo) o una arrow exportada
   * (`export const vender = (…) => {`) no se encuentran acá. Lo que hace que eso **no** sea un
   * agujero es la guardia de cardinalidad de abajo: si el módulo abre más transacciones de las que
   * este reconocedor encuentra, se pone roja y nombra la diferencia, en vez de vigilar una y dejar
   * la otra suelta —que es el silencio que aparecería en cuanto un módulo tenga dos operaciones—.
   * Ampliar el reconocedor es preferible a aflojar esa cuenta.
   */
  function operacionesConTransaccion(codigo: string): Operacion[] {
    const operaciones: Operacion[] = [];
    const firma = /export function (\w+)\s*(?:<[^>{]*>)?\s*\(/gu;
    let encontrada = firma.exec(codigo);

    while (encontrada !== null) {
      const abreParametros = encontrada.index + encontrada[0].length - 1;
      const cierraParametros = cierreDe(codigo, abreParametros, '(', ')');
      const abreCuerpo = codigo.indexOf('{', cierraParametros);
      const cierraCuerpo = cierreDe(codigo, abreCuerpo, '{', '}');
      const cuerpo = codigo.slice(abreCuerpo, cierraCuerpo);
      const abreTransaccion = cuerpo.indexOf('db.transaction(');

      if (abreTransaccion >= 0) {
        const abreArgumento = cuerpo.indexOf('(', abreTransaccion + 'db.transaction'.length);
        const cierraArgumento = cierreDe(cuerpo, abreArgumento, '(', ')');

        operaciones.push({
          nombre: encontrada[1],
          antes: cuerpo.slice(0, abreTransaccion),
          adentro: cuerpo.slice(abreArgumento, cierraArgumento),
          despues: cuerpo.slice(cierraArgumento),
        });
      }

      encontrada = firma.exec(codigo);
    }

    return operaciones;
  }

  const MODULOS_CON_TRANSACCION = modulosDeDb().filter((relativo) =>
    despejar(leer(relativo)).includes('db.transaction('),
  );

  it('encuentra los módulos que abren transacción, y son más de uno', () => {
    // Meta-guardia del filtro: con la lista vacía —o con un solo módulo— las guardias de abajo
    // pasarían sin haber mirado el que importa. Los dos que escriben la base hoy son el alta y la
    // venta; el runner de migraciones también escribe, pero abre su transacción a mano y queda
    // fuera por la razón escrita en el encabezado de este describe. Los dos quedan vigilados por
    // existir, sin lista escrita a mano.
    expect(MODULOS_CON_TRANSACCION).toContain(path.join('lib', 'db', 'ventas.ts'));
    expect(MODULOS_CON_TRANSACCION).toContain(path.join('lib', 'db', 'libros.ts'));
    expect(MODULOS_CON_TRANSACCION.length).toBeGreaterThan(1);
  });

  it('ningún módulo se cae de la lista por culpa del despeje', () => {
    // El límite de `despejar()`: no distingue una expresión regular de una cadena, así que una
    // regex con comilla —`/'/u`, hoy inexistente en `lib/db/`— abriría una cadena falsa, blanquearía
    // el resto del archivo y **sacaría al módulo de la lista sin ruido**. A los dos de hoy los
    // salva la meta-guardia de arriba, que los nombra; un tercero desaparecería en silencio y
    // `toBeGreaterThan(1)` seguiría satisfecho por los otros dos. El Block 5 trae ese tercero.
    //
    // Se compara contra una detección independiente sobre el fuente **crudo**: si las dos listas
    // difieren, o el despeje se comió un módulo, o alguien nombró `db.transaction(` en un comentario
    // —y entonces la prosa habla de una transacción que no está donde la guardia mira—. Las dos
    // merecen una revisión, y ninguna merece silencio.
    const enCrudo = modulosDeDb().filter((relativo) => leer(relativo).includes('db.transaction('));

    expect(MODULOS_CON_TRANSACCION).toEqual(enCrudo);
  });

  it.each(MODULOS_CON_TRANSACCION)(
    '%s no le esconde ninguna transacción a la guardia',
    (relativo) => {
      // Guardia de cardinalidad, y lo que sostiene que el reconocedor de firmas pueda ser simple:
      // cada `db.transaction(` del módulo tiene que corresponderse con una operación encontrada. Si
      // alguien escribe la segunda operación como arrow, como genérico o con un tipo de retorno
      // inline —o mete dos transacciones en la misma función—, la cuenta no da y esto se pone rojo
      // en vez de vigilar una y dejar la otra sin mirar.
      const codigo = despejar(leer(relativo));
      const aperturas = (codigo.match(/db\.transaction\(/gu) ?? []).length;

      expect(aperturas, `${relativo}: no se encontró ninguna apertura`).toBeGreaterThan(0);
      expect(
        operacionesConTransaccion(codigo).length,
        `${relativo}: hay ${String(aperturas)} transacciones y la guardia sólo reconoce sus firmas parcialmente`,
      ).toBe(aperturas);
    },
  );

  it('el runner de migraciones, que abre su transacción a mano, la abre en IMMEDIATE', () => {
    // El único módulo que escribe la base y queda fuera del filtro de arriba. No se lo deja sin
    // nada: la propiedad de M4 que le corresponde es que su `BEGIN` sea `IMMEDIATE` —con un `BEGIN`
    // diferido, leer `user_version` y escribirla vuelve a ser un check-then-act, que es lo que su
    // propio docstring dice evitar—. Si alguien lo reescribe con `db.transaction(`, entra solo en
    // la lista de arriba y esta guardia deja de hacer falta; mientras tanto, cubre el hueco.
    // Sobre el fuente **crudo** y no despejado: `despejar()` vacía el contenido de las cadenas, que
    // es justo lo que hay que leer acá. Se exige la forma completa de la llamada —`db.exec('BEGIN
    // IMMEDIATE')`— y no la palabra suelta, así que la prosa del docstring de `migrar.ts`, que la
    // nombra dos veces, no la satisface.
    const fuenteDelRunner = leer(path.join('lib', 'db', 'migrar.ts'));

    expect(fuenteDelRunner).toMatch(/db\.exec\(\s*'BEGIN IMMEDIATE'\s*\)/u);
    expect(fuenteDelRunner).not.toMatch(/db\.exec\(\s*'BEGIN'\s*\)/u);
  });

  it('el despeje conserva el largo y neutraliza comentarios, cadenas y plantillas', () => {
    // Meta-guardia del despeje, contra literales: si devolviera la cadena vacía o algo más corto,
    // los índices de abajo apuntarían a cualquier lado y las tres guardias medirían otra cosa.
    const fuenteDePrueba = "const A = `INSERT INTO x (a)`; // db.prepare(\nconst B = 'db';";

    expect(despejar(fuenteDePrueba)).toHaveLength(fuenteDePrueba.length);
    expect(despejar(fuenteDePrueba)).not.toContain('INSERT');
    expect(despejar(fuenteDePrueba)).not.toContain('db.prepare(');
    expect(despejar('/* db */ const a = 1;')).not.toContain('db');
    expect(despejar('const a = 1;')).toBe('const a = 1;');
    // Y lo que **no** debe borrar: el código que las guardias leen.
    expect(despejar('  const venta = db.transaction((): T => {')).toContain('db.transaction(');
  });

  it.each(MODULOS_CON_TRANSACCION)(
    '%s no toca la base antes de abrir la transacción (M4, R5)',
    (relativo) => {
      // El paso 1 de la venta y del alta: la fila vigente se lee **dentro** de la transacción. Si la
      // lectura sube a antes de abrirla, vuelve el check-then-act de R5 —el stock ≥ 1 comprobado
      // sobre un dato viejo, el `cantidad_anterior` del historial escrito con un valor que ya
      // cambió— y ningún test de negocio se pone rojo, porque hace falta un segundo escritor.
      //
      // La afirmación es que el cuerpo de la operación **no menciona la conexión** hasta la línea que
      // abre la transacción: no hay `db.prepare()`, ni un helper que reciba `db`, ni nada que pueda
      // leer o escribir. Es sintáctica y mecánica, y por eso no depende de qué se lea.
      const operaciones = operacionesConTransaccion(despejar(leer(relativo)));

      expect(
        operaciones.length,
        `${relativo}: no se encontró la operación que abre transacción`,
      ).toBeGreaterThan(0);

      for (const operacion of operaciones) {
        expect(operacion.antes, `${relativo} → ${operacion.nombre}`).not.toMatch(/\bdb\b/u);
        // Y adentro sí se toca la base: si no, la transacción estaría envolviendo la nada y la
        // aserción de arriba se satisfaría sola.
        expect(operacion.adentro, `${relativo} → ${operacion.nombre}`).toMatch(/db\.prepare\(/u);
      }
    },
  );

  it.each(MODULOS_CON_TRANSACCION)(
    '%s abre la transacción en modo immediate (M4, R5)',
    (relativo) => {
      // La otra mitad de M4: un `BEGIN` diferido no toma el lock de escritura hasta la primera
      // escritura, así que deja abierta la misma ventana entre el `SELECT` de control y el `UPDATE`
      // aunque los dos estén dentro de la transacción. Borrar `.immediate()` deja la suite entera en
      // verde, y es un cambio de once caracteres.
      const codigo = despejar(leer(relativo));

      for (const operacion of operacionesConTransaccion(codigo)) {
        const nombre = /(?:const|let|var)\s+(\w+)\s*=\s*$/u.exec(operacion.antes.trimEnd())?.[1];

        // Falla cerrado: si la transacción deja de asignarse a una constante —`return
        // db.transaction(fn)()` en una sola línea— esta guardia no puede seguir el rastro del
        // `.immediate()`, y lo correcto es ponerse roja y que alguien la revise.
        expect(
          nombre,
          `${relativo} → ${operacion.nombre}: la transacción no se asigna a una constante`,
        ).toBeDefined();

        const invocada = new RegExp(`\\b${nombre ?? ''}\\s*\\(`, 'u');
        const immediate = new RegExp(`\\b${nombre ?? ''}\\.immediate\\(\\)`, 'u');

        expect(operacion.despues, `${relativo} → ${operacion.nombre}`).toMatch(immediate);
        expect(
          operacion.despues,
          `${relativo} → ${operacion.nombre}: invocada sin immediate`,
        ).not.toMatch(invocada);
      }
    },
  );
});

/**
 * Las dos guardias de convención de `lib/db/ventas.ts` se **registran**, no se escriben acá.
 *
 * Las dos —la de M9 (la barrera `server-only` y el SQL sin interpolación) y la que exige que toda
 * sentencia que opera sobre una fila de `libros` la elija por su clave primaria con igualdad exacta—
 * viven parametrizadas por módulo en `test/ayudas/guardias-sql.ts`, y el Block 5 las estrena para
 * `lib/db/edicion.ts` con dos líneas iguales a estas dos. Copiar sesenta líneas de describe al test
 * del módulo siguiente es cómo las dos copias divergen, y la que quedara más laxa sería la que deja
 * de exigir.
 *
 * De paso desaparecieron las dos lecturas del propio fuente —cada describe hacía su
 * `fs.readFileSync` y extraía las constantes `SQL_` con su propia expresión, con una meta-guardia del
 * extractor repetida literal en los dos— y las meta-guardias de los reconocedores compartidos, que
 * ahora están en `test/convenciones/sql.test.ts`, donde no dependen de un describe que habla de otro
 * módulo.
 */
const MODULO_DE_LA_VENTA = path.join('lib', 'db', 'ventas.ts');

guardiaDeConvencionesDeSql({ relativo: MODULO_DE_LA_VENTA });

guardiaDeSentenciasSobreUnLibro({
  relativo: MODULO_DE_LA_VENTA,
  // Las dos que hoy operan sobre una fila de `libros`: el `SELECT` de control y el `UPDATE` del
  // descuento. Las otras dos escriben `historial_stock` y `ventas`, que no eligen ninguna fila de
  // `libros`.
  esperadas: ['SQL_LIBRO_A_VENDER', 'SQL_DESCONTAR_STOCK'],
});
