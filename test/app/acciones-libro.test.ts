import fs from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';

import type Database from 'better-sqlite3';
import { notFound, redirect } from 'next/navigation';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ventaDeLibro } from '@/app/acciones-libro';
import PaginaDetalle from '@/app/libros/[id]/page';
import {
  MENSAJE_ERROR_DE_VENTA,
  MENSAJE_VENTA_SIN_STOCK,
  rutaDelDetalle,
  TEXTO_CONFIRMAR_VENTA,
  TEXTO_VENDER,
} from '@/app/mensajes';
import Pagina from '@/app/page';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';
import {
  type CambiosDeLaSiembra,
  type Conteos,
  contenido as contenidoDe,
  type DosLibros,
  entradasDeStock as entradasDeStockDe,
  sembrarDosLibros,
  stockDe as stockDeLibro,
  ventas as ventasDe,
} from '@/test/ayudas/catalogo-de-prueba';

/**
 * Tests del Server Action de venta (FEAT-001b Block 4: AC-02, AC-03, AC-11, AC-17, M1, M2, M3, M8).
 *
 * No hay entorno DOM ni runner e2e: el Server Action se ejercita como una función async y las
 * pantallas se renderizan a texto, igual que en `test/app/acciones.test.ts` y en
 * `test/app/detalle.test.ts`.
 */

/** La base `:memory:` del test en curso. `app/` no la recibe por parámetro: se intercepta la conexión. */
let db: Database.Database | undefined;

/** Con esto en `true`, `obtenerDb()` falla como falla un disco: es el fallo de infraestructura. */
let conexionRota = false;

/** El texto que jamás debe llegar a la usuaria (M8): un error del motor nombra tablas y códigos. */
const ERROR_DE_INFRAESTRUCTURA = 'SQLITE_CANTOPEN: unable to open database file';

vi.mock('@/lib/db/conexion', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/db/conexion')>();

  return {
    ...original,
    obtenerDb: (): Database.Database => {
      if (conexionRota) {
        throw new Error(ERROR_DE_INFRAESTRUCTURA);
      }

      if (db === undefined) {
        throw new Error('El test no abrió su base de prueba.');
      }

      return db;
    },
  };
});

/**
 * `revalidatePath()` es la mitad de "la venta se ve": sin ella el stock se descuenta y la pantalla
 * sigue mostrando el anterior. Fuera de un request de Next.js la función real lanza, así que se
 * intercepta para poder afirmar que se la llamó y con qué rutas.
 */
const revalidar = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidar }));

/**
 * Los argumentos con los que el Server Action llamó a la venta, en orden y completos.
 *
 * Es **la frontera** entre `app/` y el repositorio, y lo único de M2 que le pertenece a esta capa:
 * que del formulario no salga nada más que el identificador. Observar el precio guardado no alcanza
 * —eso lo decide `lib/db/ventas.ts`—, y observar sólo el primer argumento dejaría pasar un segundo
 * parámetro con el precio.
 *
 * Se registra con un envoltorio que delega en la función real (la venta tiene que ocurrir de verdad
 * contra la base de prueba) y en un array y no en un `vi.fn()`, para que ningún `restoreAllMocks`
 * le pueda borrar la implementación.
 */
const argumentosDeVenta = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/lib/db/ventas', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/db/ventas')>();

  const venderEjemplar: typeof original.venderEjemplar = (...argumentos) => {
    argumentosDeVenta.push(argumentos);

    return original.venderEjemplar(...argumentos);
  };

  return { ...original, venderEjemplar };
});

/**
 * La señal con la que Next.js pide la respuesta 404, **preguntada a `notFound()`** en vez de
 * clavada como literal: derivándola, un cambio de formato del framework mueve a la vez lo esperado
 * y lo observado, y el test se sigue poniendo rojo si la acción deja de responder 404.
 */
const RESPUESTA_404 = ((): string => {
  try {
    notFound();
  } catch (senal) {
    const mensaje = senal instanceof Error ? senal.message : '';

    if (mensaje === '') {
      throw new Error(
        'notFound() de Next.js lanzó algo sin mensaje: la respuesta 404 ya no se puede afirmar.',
      );
    }

    return mensaje;
  }

  throw new Error('notFound() de Next.js dejó de lanzar: la respuesta 404 ya no se puede afirmar.');
})();

/**
 * El `digest` con el que Next.js pide una redirección a `destino`, **preguntado a `redirect()`**,
 * por el mismo motivo que el 404: el formato interno (`NEXT_REDIRECT;replace;/libros/7;307;`) es un
 * detalle del framework, y clavarlo haría que un cambio de versión pusiera rojo un test que sigue
 * describiendo la propiedad correcta. Lo que se compara es que la acción pida la **misma**
 * redirección que pediría `redirect(destino)`.
 */
function digestDeRedireccion(destino: string): string {
  try {
    redirect(destino);
  } catch (senal) {
    const digest = (senal as { digest?: unknown }).digest;

    if (typeof digest !== 'string' || digest === '') {
      throw new Error(
        'redirect() de Next.js ya no lleva digest: la redirección no se puede afirmar.',
      );
    }

    return digest;
  }

  throw new Error('redirect() de Next.js dejó de lanzar: la redirección no se puede afirmar.');
}

function digestDe(senal: unknown): unknown {
  return (senal as { digest?: unknown }).digest;
}

/**
 * El `action` con el que react-dom marca un formulario **ligado a una función** —o sea, a una
 * Server Action—, preguntado a react-dom en vez de clavado como literal.
 *
 * Un formulario cuyo `action` es una función no se puede servir como HTML que el navegador envíe
 * solo, así que React renderiza en su lugar un `action` sintético (`javascript:throw new
 * Error(…)`) y un script que intercepta el envío. **Ese marcador es la única evidencia, en un
 * renderizado a texto, de que el botón de confirmar ejecuta la venta y no navega a ningún lado.**
 *
 * Se deriva renderizando un formulario de referencia: si React cambia el marcador, cambian a la vez
 * lo esperado y lo observado, y la aserción se sigue poniendo roja exactamente cuando el formulario
 * deja de estar ligado a una función —que es la propiedad que vigila—.
 */
const ACCION_LIGADA_A_FUNCION = ((): string => {
  const html = renderToStaticMarkup(
    createElement('form', { action: (): undefined => undefined }, null),
  );
  const encontrado = /<form action="([^"]+)"/u.exec(html);

  if (encontrado === null) {
    throw new Error(
      'react-dom dejó de marcar el formulario ligado a una función: la confirmación de la venta ya no se puede afirmar sobre el marcado.',
    );
  }

  return encontrado[1];
})();

/**
 * El formulario de la sección de venta del detalle, con su marcado adentro.
 *
 * Se elige por el marcador del control de confirmación —`data-venta="confirmar"`— y no por ser el
 * primer `<form>` del HTML: el Block 5 mete un segundo formulario en la misma pantalla, y con el
 * criterio posicional las ocho aserciones de la confirmación pasarían a medir el formulario de la
 * edición y el rojo hablaría de la venta cuando el problema es el orden del marcado.
 *
 * Falla cerrado si no encuentra exactamente uno, igual que `filaConTitulo()`: con cero devolvía `''`
 * y las aserciones que vinieran después medían otra cosa —o nada— sin ruido.
 */
function formularioDeVenta(html: string): string {
  const encontrados = Array.from(
    html.matchAll(/<form[\s\S]*?<\/form>/gu),
    (coincidencia) => coincidencia[0],
  ).filter((formulario) => formulario.includes('data-venta="confirmar"'));

  if (encontrados.length !== 1) {
    throw new Error(
      `Se esperaba un solo formulario de venta en el detalle y se encontraron ${String(encontrados.length)}.`,
    );
  }

  return encontrados[0];
}

/**
 * Ejecuta la acción y devuelve la señal que lanzó.
 *
 * La venta **siempre** termina en una señal de navegación (M3: POST-Redirect-GET, o 404): una
 * acción que devolviera normalmente sería un `POST` reenviable, así que "no lanzó" es un fallo del
 * test y no un caso a tolerar.
 */
async function senalDe(accion: () => Promise<void>): Promise<unknown> {
  try {
    await accion();
  } catch (senal) {
    return senal;
  }

  throw new Error('La acción de venta devolvió normalmente en vez de redirigir o responder 404.');
}

/** La base del test en curso, sin `!`: si no está abierta es un error del test, no del código. */
function baseAbierta(): Database.Database {
  if (db === undefined) {
    throw new Error('El test no abrió su base de prueba.');
  }

  return db;
}

/*
 * La siembra y las consultas de medición salen de `test/ayudas/catalogo-de-prueba.ts`, compartidas
 * con `test/db/ventas.test.ts` y con el Block 5. Acá se envuelven para que reciban la base del test
 * en curso, que `app/` no toma por parámetro: la conexión se intercepta.
 *
 * **Se siembran dos libros en todos los caminos y no sólo en los que afirman sobre el marcado.** Con
 * un solo libro sembrado `libro.id` vale 1, así que `rutaDelDetalle(1)` clavado en el destino de la
 * redirección o en la ruta que se revalida —vender cualquier libro y terminar en el detalle del libro
 * 1, revalidando la ruta equivocada— renderiza y redirige exactamente igual que el código correcto.
 * Las aserciones que sostienen que el segundo id no es 1 viven dentro de la siembra.
 */
function sembrarDos(cambios: CambiosDeLaSiembra = {}): DosLibros {
  return sembrarDosLibros(baseAbierta(), cambios);
}

function contenido(): Conteos {
  return contenidoDe(baseAbierta());
}

function stockDe(id: number): number {
  return stockDeLibro(baseAbierta(), id);
}

function ventas(): Array<Record<string, unknown>> {
  return ventasDe(baseAbierta());
}

function entradasDeStock(): Array<Record<string, unknown>> {
  return entradasDeStockDe(baseAbierta());
}

/**
 * **Toda** constante de texto que exporta un módulo de `app/`, derivada y sin lista.
 *
 * Tuvo tres formas antes de ésta, y las tres fallaban abierto. La primera era una lista escrita a
 * mano: enumeraba cuatro textos y el módulo exportaba cinco, así que `TITULO_VENTA` quedó afuera y
 * ninguna de las cuatro reglas de M8 lo miraba. La segunda derivaba de los exports pero filtraba por
 * el **nombre** —la familia `VENTA`/`VENDER`—, y con eso un texto llamado `MENSAJE_STOCK_AGOTADO`
 * cuyo contenido fuera `'SQLITE_CONSTRAINT: fallo al escribir historial_stock en
 * /var/data/puentes.db'` pasaba la suite entera en verde (289/289). La tercera derivaba de **un
 * módulo**: `import * as mensajes from '@/app/mensajes'`. El universo de M8 no es un archivo, es la
 * interfaz, y con esa forma un `app/mensajes-edicion.ts` con ese mismo texto del motor renderizado
 * en el detalle dejaba la suite entera en verde (medido: 318/318).
 *
 * **Por qué importa ahora y no cuando aparezca el segundo módulo.** `app/mensajes.ts` tiene 291
 * líneas, veinte exports y cuatro responsabilidades declaradas en su propio encabezado, y partirlo
 * está sobre la mesa. Si se parte antes que esto, media M8 se apaga sin un solo rojo. Con el
 * universo derivado de los módulos, la partición pasa a ser segura y los textos de la edición del
 * Block 5 **nacen cubiertos**.
 *
 * **Por qué sin lista y sin filtro.** Las cuatro reglas de M8 son prohibiciones genéricas —ni
 * prefijo del motor, ni `.db`, ni rutas, ni nombres de tabla— y ninguna de las cuatro depende de a
 * qué pantalla pertenece el texto. Un filtro por nombre no las hace más precisas: sólo decide a
 * cuáles no se aplican, y esa decisión la termina tomando quien elige el nombre del export.
 *
 * Se cargan los módulos de verdad —`import.meta.glob` con `eager`, que es el recorrido recursivo de
 * `app/` que hace Vite— y no se leen sus fuentes: lo que la usuaria ve es el **valor** exportado, y
 * un texto compuesto no se puede leer del fuente. Lo que evita que el universo se vacíe en silencio
 * —un `typeof` mal escrito, un módulo que deja de exportar, un patrón angostado a un archivo— es la
 * meta-guardia de abajo, que nombra los textos de hoy uno por uno y exige que los módulos
 * recorridos sean varios.
 */
const MODULOS_CARGADOS = import.meta.glob('../../app/**/*.{ts,tsx}', {
  eager: true,
}) as Record<string, Record<string, unknown>>;

/** Las rutas recorridas, relativas a la raíz del repositorio, para que el rojo diga en cuál. */
const MODULOS_DE_LA_INTERFAZ = Object.keys(MODULOS_CARGADOS)
  .map((ruta) => ruta.replace(/^(?:\.\.\/)+/u, ''))
  .sort();

const TEXTOS_DE_LA_INTERFAZ = Object.entries(MODULOS_CARGADOS).flatMap(([ruta, modulo]) =>
  Object.entries(modulo)
    .filter(([, valor]) => typeof valor === 'string')
    .map(
      ([nombre, valor]) =>
        [`${ruta.replace(/^(?:\.\.\/)+/u, '')} → ${nombre}`, valor as string, nombre] as const,
    ),
);

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();

  for (const [campo, valor] of Object.entries(campos)) {
    datos.set(campo, valor);
  }

  return datos;
}

async function renderizarDetalle(id: string): Promise<string> {
  return renderToStaticMarkup(await PaginaDetalle({ params: Promise.resolve({ id }) }));
}

async function renderizarCatalogo(): Promise<string> {
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }));
}

/**
 * El contenido de una celda del listado **con su marcado adentro**.
 *
 * El extractor `celdas()` de los otros tests corta en el primer `<`, así que devuelve `''` para una
 * celda con un control dentro: acá hace falta ver el control entero para poder afirmar que **no**
 * es un `POST`.
 */
function celdasConMarcado(html: string, campo: string): string[] {
  const patron = new RegExp(`<td[^>]*data-campo="${campo}"[^>]*>([\\s\\S]*?)</td>`, 'gu');

  return Array.from(html.matchAll(patron), (coincidencia) => coincidencia[1]);
}

/**
 * La fila del listado cuyo título es `titulo`, con su marcado adentro.
 *
 * Hace falta para poder afirmar sobre **la fila del segundo libro**: `celdasConMarcado()` devuelve
 * las celdas de todas las filas y pierde a qué fila pertenece cada una, así que con dos libros
 * sembrados no alcanza para decir "la celda de venta *de este* libro enlaza a *su* detalle". Se
 * busca por el título y no por el índice del orden alfabético: el orden lo decide otra propiedad,
 * probada en `test/db/consultas.test.ts`, y un test que dependiera de él se pondría rojo por un
 * cambio de orden en vez de por lo que vigila.
 *
 * Falla cerrado si no encuentra exactamente una: con cero o con dos, la aserción que viniera después
 * mediría otra cosa —o nada— sin ruido.
 */
function filaConTitulo(html: string, titulo: string): string {
  const filas = Array.from(
    html.matchAll(/<tr>([\s\S]*?)<\/tr>/gu),
    (coincidencia) => coincidencia[1],
  );
  const encontradas = filas.filter((fila) => fila.includes(`>${titulo}<`));

  if (encontradas.length !== 1) {
    throw new Error(
      `Se esperaba una sola fila con el título ${titulo} y se encontraron ${String(encontradas.length)}.`,
    );
  }

  return encontradas[0];
}

describe('ventaDeLibro()', () => {
  beforeEach(() => {
    db = baseDePrueba();
    conexionRota = false;
    revalidar.mockClear();
    argumentosDeVenta.length = 0;
  });

  afterEach(() => {
    db?.close();
    db = undefined;
    vi.restoreAllMocks();
  });

  it('confirmada desde el detalle descuenta 1, registra la venta y el historial (AC-02)', async () => {
    const { primero, segundo: libro } = sembrarDos();
    const antes = contenido();

    await senalDe(() => ventaDeLibro(formulario({ id: String(libro.id) })));

    expect(stockDe(libro.id)).toBe(libro.stock - 1);
    // Y el otro libro no se movió: la acción le pasó al repositorio el id que vino en el formulario.
    expect(stockDe(primero.id)).toBe(primero.stock);

    const registradas = ventas();
    expect(registradas).toHaveLength(1);
    expect(registradas[0]).toMatchObject({ libro_id: libro.id, precio_venta: libro.precio });

    const entradas = entradasDeStock();
    expect(entradas).toHaveLength(antes.historialStock + 1);
    expect(entradas[entradas.length - 1]).toMatchObject({
      libro_id: libro.id,
      cantidad_anterior: libro.stock,
      cantidad_resultante: libro.stock - 1,
      origen: 'venta',
      fecha: registradas[0].fecha,
    });
  });

  it('tras la venta redirige al detalle de ese libro, así que el reenvío no la repite (M3, R4)', async () => {
    const { primero: otro, segundo: libro } = sembrarDos();

    const senal = await senalDe(() => ventaDeLibro(formulario({ id: String(libro.id) })));

    // La respuesta es la redirección al detalle **de este** libro, no una página renderizada sobre
    // el `POST` ni el detalle de otro: con un `rutaDelDetalle(1)` clavado, la usuaria termina en el
    // detalle del libro 1 después de vender cualquier otro. La negación es la que lo hace falsable.
    expect(digestDe(senal)).toBe(digestDeRedireccion(rutaDelDetalle(libro.id)));
    expect(digestDe(senal)).not.toBe(digestDeRedireccion(rutaDelDetalle(otro.id)));
    expect(ventas()).toHaveLength(1);
  });

  it('revalida la ruta del catálogo y la del detalle de ese libro, no una sola', async () => {
    const { primero: otro, segundo: libro } = sembrarDos();

    await senalDe(() => ventaDeLibro(formulario({ id: String(libro.id) })));

    // El alta ya dejó la cicatriz de revalidar una sola: el stock se ve en las dos pantallas. Y la
    // segunda es la del libro que se vendió: revalidar la ruta de otro libro deja el detalle del que
    // cambió sirviéndose de caché, con el stock viejo y el botón que el servidor va a rechazar.
    expect(revalidar.mock.calls).toEqual([['/'], [rutaDelDetalle(libro.id)]]);
    expect(revalidar.mock.calls).not.toContainEqual([rutaDelDetalle(otro.id)]);
  });

  it('registra el precio vigente de la base aunque el formulario mande otro (M2, R3)', async () => {
    const { segundo: libro } = sembrarDos({ segundo: { stock: '2' } });

    // Un `POST` a mano puede mandar lo que quiera: acá manda un precio de venta regalado, un stock
    // y una fecha. Ninguno de los cuatro campos de más puede fijar a qué precio se vendió.
    await senalDe(() =>
      ventaDeLibro(
        formulario({
          id: String(libro.id),
          precio: '1',
          precio_venta: '1',
          stock: '999',
          fecha: '1999-01-01T00:00:00.000Z',
        }),
      ),
    );

    const registradas = ventas();
    expect(registradas).toHaveLength(1);
    expect(registradas[0]).toMatchObject({ precio_venta: libro.precio });
    expect(registradas[0].fecha).not.toBe('1999-01-01T00:00:00.000Z');
    expect(stockDe(libro.id)).toBe(1);

    // Y la frontera: al repositorio no llegó nada del formulario más que el identificador.
    expect(argumentosDeVenta).toEqual([[libro.id]]);
  });

  it('con stock 0 no escribe nada y el detalle explica por qué (AC-03)', async () => {
    const { primero: otro, segundo: libro } = sembrarDos({ segundo: { stock: '0' } });
    const antes = contenido();

    const senal = await senalDe(() => ventaDeLibro(formulario({ id: String(libro.id) })));

    // Vuelve al detalle **de este** libro, que es donde está el motivo: el mensaje sale del stock
    // vigente y no de un parámetro de la URL, así que no se puede fabricar desde el navegador. Con un
    // `rutaDelDetalle(1)` clavado, el rechazo devolvía a la usuaria al detalle de otro libro —uno con
    // ejemplares, donde el aviso no aparece— y la negación es la que lo hace falsable.
    expect(digestDe(senal)).toBe(digestDeRedireccion(rutaDelDetalle(libro.id)));
    expect(digestDe(senal)).not.toBe(digestDeRedireccion(rutaDelDetalle(otro.id)));
    expect(contenido()).toEqual(antes);
    expect(stockDe(libro.id)).toBe(0);
    expect(stockDe(otro.id)).toBe(otro.stock);
    expect(revalidar).not.toHaveBeenCalled();

    const html = await renderizarDetalle(String(libro.id));
    expect(html).toContain(MENSAJE_VENTA_SIN_STOCK);
    // Y la pantalla no ofrece confirmar una venta que el servidor va a rechazar. Se afirma por el
    // texto **y** por la marca del control, que es el mismo anclaje que usan `data-campo` y
    // `data-operacion`: el texto solo cambiaría de redacción, la marca es el control.
    expect(html).not.toContain(TEXTO_CONFIRMAR_VENTA);
    expect(html).not.toContain('data-venta="confirmar"');
    expect(html).toContain('data-venta="sin-stock"');
  });

  it('con stock 1 sí ofrece la confirmación, así que la ausencia de arriba dice algo', async () => {
    const { segundo: libro } = sembrarDos({ segundo: { stock: '1' } });

    const html = await renderizarDetalle(String(libro.id));

    expect(html).toContain(TEXTO_CONFIRMAR_VENTA);
    expect(html).toContain('data-venta="confirmar"');
    expect(html).not.toContain(MENSAJE_VENTA_SIN_STOCK);
    expect(html).not.toContain('data-venta="sin-stock"');
    // Mirar la pantalla no escribe nada: la venta la ejecuta la confirmación (AC-17).
    expect(ventas()).toEqual([]);
  });

  it('vende el último ejemplar y recién ahí el detalle pasa a sin-stock (AC-02 contra AC-03)', async () => {
    // **El borde donde AC-02 toca AC-03, y en una librería es el caso más común.** Cambiar el
    // `if (fila.stock < EJEMPLARES_POR_VENTA)` de `lib/db/ventas.ts` por `<=` —un carácter— deja
    // el último ejemplar invendible, el stock nunca llega a 0 y la pantalla de sin-stock deja de
    // ser alcanzable por el camino real. Esa mutación dejaba la suite entera en verde: los dos
    // tests que siembran `stock: '1'` sólo **renderizan** el detalle, ninguno ejecuta la venta.
    //
    // Por eso el test cierra el borde por los dos lados: que la última venta ocurre, y que después
    // de ocurrir la pantalla cambia de estado.
    const { primero: otro, segundo: libro } = sembrarDos({ segundo: { stock: '1' } });
    const antes = contenido();

    expect(libro.stock, 'la siembra dejó al libro con más de un ejemplar').toBe(1);

    // Antes de vender, el detalle ofrece la confirmación. Sin esta línea, el `sin-stock` del final
    // no diría nada: podría haber estado ahí desde el principio.
    expect(await renderizarDetalle(String(libro.id))).toContain('data-venta="confirmar"');

    await senalDe(() => ventaDeLibro(formulario({ id: String(libro.id) })));

    // 1. El último ejemplar se vendió: el stock llega a 0, que es el valor que la mutación `<=`
    //    vuelve inalcanzable. Y el otro libro no se movió.
    expect(stockDe(libro.id)).toBe(0);
    expect(stockDe(otro.id)).toBe(otro.stock);

    // 2. Con su fila de `ventas` y su entrada de historial: el rechazo de `sin_stock` no escribe
    //    nada, así que estas dos son las que distinguen la venta ocurrida del rechazo silencioso.
    const registradas = ventas();
    expect(registradas).toHaveLength(1);
    expect(registradas[0]).toMatchObject({ libro_id: libro.id, precio_venta: libro.precio });

    const entradas = entradasDeStock();
    expect(entradas).toHaveLength(antes.historialStock + 1);
    expect(entradas[entradas.length - 1]).toMatchObject({
      libro_id: libro.id,
      cantidad_anterior: 1,
      cantidad_resultante: 0,
      origen: 'venta',
      fecha: registradas[0].fecha,
    });

    // 3. Y la pantalla cambia de estado. Es lo que hace valioso al test: la vista de sin-stock
    //    pasa a ser alcanzable por el camino de la usuaria —vender el último ejemplar— y no sólo
    //    sembrando un libro en 0.
    const despues = await renderizarDetalle(String(libro.id));

    expect(despues).toContain('data-venta="sin-stock"');
    expect(despues).toContain(MENSAJE_VENTA_SIN_STOCK);
    expect(despues).not.toContain('data-venta="confirmar"');
    expect(despues).not.toContain(TEXTO_CONFIRMAR_VENTA);
  });

  it('el control de confirmación ejecuta la venta y le pasa el id del libro (AC-02, M3)', async () => {
    // **La aserción que faltaba, y es el espejo de la de la fila.** El control de la fila —el que
    // *no* escribe— tiene tres negaciones con su mutación cada una; el del detalle —el único
    // control del producto que **sí** escribe— no tenía ninguna: cambiar su `<form>` por una
    // navegación dejaba el botón "confirmar" sin vender nada y la suite entera en verde.
    //
    // Es además la mitad de M3 que el threat model llama control compensatorio de A3
    // ("confirmación en el detalle + redirección tras el POST"): la redirección ya tenía test, que
    // la confirmación **sea** la confirmación no.
    //
    // Se siembran **dos** libros y se afirma sobre el segundo: con uno solo, `libro.id` vale 1 y
    // `value={String(libro.id)}` y `value="1"` renderizan lo mismo, así que "le pasa el id del
    // libro" era infalsificable y el detalle de cualquier libro podía postear el id 1 —vender el
    // libro equivocado— con la suite en verde. Las aserciones que sostienen que el segundo id no es
    // 1 —y que una siembra futura no lo devuelva a ese estado sin avisar— viven adentro de
    // `sembrarDosLibros()`.
    const { primero: otro, segundo: libro } = sembrarDos({ segundo: { stock: '1' } });

    const formulario = formularioDeVenta(await renderizarDetalle(String(libro.id)));

    // 1. Es el formulario de la venta y no otro.
    expect(formulario).toContain('data-venta="confirmar"');
    expect(formulario).toContain(TEXTO_CONFIRMAR_VENTA);

    // 2. Está ligado a una función —la Server Action— y no a una URL. Con un `action` de texto,
    //    React no emite este marcador y el botón navega en vez de vender.
    expect(formulario).toContain(`action="${ACCION_LIGADA_A_FUNCION}"`);
    // Y no lleva método propio: un formulario ligado a una función lo elige React (React avisa
    // "Cannot specify a encType or method for a form that specifies a function as the action").
    expect(formulario).not.toContain('method=');

    // 3. Y le pasa el identificador **de este** libro, que es lo único que la acción lee del
    //    formulario. La negación es la que hace falsable la afirmación: el campo no lleva el id del
    //    otro libro de la base.
    expect(formulario).toContain('type="hidden"');
    expect(formulario).toContain('name="id"');
    expect(formulario).toContain(`value="${String(libro.id)}"`);
    expect(formulario).not.toContain(`value="${String(otro.id)}"`);

    // Y el mismo campo en el detalle del otro libro lleva **su** id: así lo que se afirma es que el
    // valor sigue al libro renderizado, y no que coincide una vez por casualidad.
    const formularioDelOtro = formularioDeVenta(await renderizarDetalle(String(otro.id)));
    expect(formularioDelOtro).toContain(`value="${String(otro.id)}"`);
    expect(formularioDelOtro).not.toContain(`value="${String(libro.id)}"`);
  });

  it('el extractor toma el formulario de la venta y falla cerrado, no el primero del marcado', () => {
    // Meta-guardia del extractor, contra literales y no contra la pantalla. Tomaba el **primer**
    // `<form>` del HTML, que hoy es el de la venta por el orden en que está escrito el detalle. El
    // Block 5 mete un segundo formulario —el de edición— en la misma pantalla: con el extractor
    // anterior, las ocho aserciones de la confirmación pasaban a medir el formulario que estuviera
    // primero, y el rojo hubiera hablado de la venta cuando el problema era el orden del marcado.
    //
    // Falla cerrado con cero y con dos, igual que `filaConTitulo()`: una aserción que viniera
    // después de un `''` mediría otra cosa —o nada— sin ruido.
    const venta = '<form data-x="1"><button data-venta="confirmar">Confirmar</button></form>';
    const edicion = '<form data-edicion="guardar"><button>Guardar</button></form>';

    expect(formularioDeVenta(`${edicion}${venta}`)).toBe(venta);
    expect(formularioDeVenta(`${venta}${edicion}`)).toBe(venta);
    expect(() => formularioDeVenta(edicion)).toThrow(/formulario de venta/u);
    expect(() => formularioDeVenta(`${venta}${venta}`)).toThrow(/formulario de venta/u);
  });

  it('responde 404 sin llegar al repositorio ante un id que no es un entero positivo (M1, R1)', async () => {
    const { primero: otro, segundo: libro } = sembrarDos();
    const antes = contenido();
    // Los mismos casos que la ruta del detalle: la validación del identificador es una sola.
    const invalidos = ['abc', '-1', '0', '9e99', '99999999999999999999', '1.0', '', ' 1'];

    for (const invalido of invalidos) {
      const senal = await senalDe(() => ventaDeLibro(formulario({ id: invalido })));

      expect((senal as Error).message, invalido).toBe(RESPUESTA_404);
    }

    // Y sin el campo: un `FormData` sin `id` no se completa con nada (Principio II).
    const sinCampo = await senalDe(() => ventaDeLibro(new FormData()));
    expect((sinCampo as Error).message).toBe(RESPUESTA_404);

    expect(argumentosDeVenta).toEqual([]);
    expect(contenido()).toEqual(antes);
    expect(stockDe(libro.id)).toBe(libro.stock);
    expect(stockDe(otro.id)).toBe(otro.stock);
  });

  it('responde 404 ante un libro inexistente, sin escribir nada', async () => {
    const { primero: otro, segundo: libro } = sembrarDos();
    const antes = contenido();

    const senal = await senalDe(() => ventaDeLibro(formulario({ id: String(libro.id + 1) })));

    expect((senal as Error).message).toBe(RESPUESTA_404);
    expect(contenido()).toEqual(antes);
    // Acá sí se consultó la base: el 404 sale del motivo tipado del repositorio, y el id que llegó
    // es el que vino en el formulario y no otro.
    expect(argumentosDeVenta).toEqual([[libro.id + 1]]);
    expect(stockDe(libro.id)).toBe(libro.stock);
    expect(stockDe(otro.id)).toBe(otro.stock);
    expect(revalidar).not.toHaveBeenCalled();
  });

  it('ante un fallo de infraestructura no expone el motor y registra sin el formulario (M8)', async () => {
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    conexionRota = true;

    let capturado: unknown;
    try {
      await ventaDeLibro(formulario({ id: '7', precio: '424242' }));
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(Error);
    expect((capturado as Error).message).toBe(MENSAJE_ERROR_DE_VENTA);
    expect((capturado as Error).message).not.toContain('SQLITE_');
    expect((capturado as Error).message).not.toContain('unable to open database file');

    // El fallo se registra —si no, nadie se enteraría— pero **sin el contenido del formulario**:
    // un log con lo que vino en el `POST` es el formulario copiado al disco.
    expect(registro).toHaveBeenCalled();
    const argumentos = registro.mock.calls.flat();

    // Se serializa con `util.inspect` y **no** con `String`: `String(formData)` devuelve
    // `'[object FormData]'`, así que un `console.error(mensaje, error, datos)` —la regresión más
    // probable de las dos líneas que vigila este test— pasaba verde mientras Node imprimía
    // `FormData { precio: '424242' }` en la consola del servidor.
    const registrado = argumentos.map((argumento) => inspect(argumento)).join(' ');
    expect(registrado).not.toContain('424242');

    // Y el cinturón estructural, que no depende de lo que hoy traiga el formulario: ningún
    // argumento logueado **es** el formulario. Sin esto, un campo nuevo del `FormData` que este
    // test no conozca se filtraría al log sin ponerlo rojo.
    for (const argumento of argumentos) {
      expect(argumento).not.toBeInstanceOf(FormData);
    }
  });

  it('encuentra todos los textos de la interfaz, y no los de un solo módulo', () => {
    // Meta-guardia de la derivación: con la lista vacía —o corta— la guardia de abajo pasaría sin
    // haber mirado el texto que importa. Los cinco de la venta se nombran acá y sólo acá.
    // El nombre pelado del export, que es lo que se nombra acá; en el resto de las aserciones el
    // nombre viaja calificado por su módulo, para que el rojo diga en cuál de ellos está el texto.
    const nombres = TEXTOS_DE_LA_INTERFAZ.map(([, , nombre]) => nombre);

    // El universo son **los módulos de `app/`**, no uno. Con el universo derivado de
    // `app/mensajes.ts` y nada más, un `app/mensajes-edicion.ts` con
    // `'SQLITE_CONSTRAINT: fallo al escribir historial_stock en /var/data/puentes.db'` renderizado
    // en el detalle dejaba la suite entera en verde (medido: 318/318). Importa ahora y no después:
    // `app/mensajes.ts` tiene cuatro responsabilidades declaradas en su propio encabezado y
    // partirlo está sobre la mesa —si se parte antes que esto, media M8 se apaga sin un solo rojo—.
    expect(MODULOS_DE_LA_INTERFAZ).toContain('app/mensajes.ts');
    expect(MODULOS_DE_LA_INTERFAZ).toContain('app/componentes/listado-libros.tsx');
    expect(MODULOS_DE_LA_INTERFAZ).toContain('app/libros/[id]/page.tsx');
    expect(MODULOS_DE_LA_INTERFAZ.length).toBeGreaterThan(5);

    expect(nombres).toContain('TEXTO_VENDER');
    expect(nombres).toContain('TITULO_VENTA');
    expect(nombres).toContain('TEXTO_CONFIRMAR_VENTA');
    expect(nombres).toContain('MENSAJE_VENTA_SIN_STOCK');
    expect(nombres).toContain('MENSAJE_ERROR_DE_VENTA');

    // Y **tres que no son de la venta**: son las que se ponen rojas si alguien vuelve a filtrar por
    // el nombre del export. Sin ellas, un filtro `/VENTA|VENDER/` reintroducido dejaría las cinco de
    // arriba satisfechas y el universo otra vez recortado a la familia que el nombre delata.
    expect(nombres).toContain('MENSAJE_LIBRO_INEXISTENTE');
    expect(nombres).toContain('MENSAJE_ALTA_EXITOSA');
    expect(nombres).toContain('MENSAJE_COLISION_DE_IDENTIDAD');
    expect(nombres.length).toBeGreaterThan(5);
  });

  it('ningún texto de la interfaz nombra el motor, una tabla ni una ruta del disco (M8)', () => {
    expect(TEXTOS_DE_LA_INTERFAZ.length).toBeGreaterThan(0);

    for (const [nombre, texto] of TEXTOS_DE_LA_INTERFAZ) {
      expect(texto, nombre).toMatch(/\S/u);
      expect(texto, nombre).not.toMatch(/SQLITE_/u);
      expect(texto, nombre).not.toMatch(/\.db\b/u);
      expect(texto, nombre).not.toMatch(/historial_stock|titulo_normalizado|\bventas\b/u);
    }
  });
});

describe('el control de venta de la fila del listado (AC-17)', () => {
  beforeEach(() => {
    db = baseDePrueba();
    conexionRota = false;
    revalidar.mockClear();
    argumentosDeVenta.length = 0;
  });

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('accionarlo lleva al detalle de ese libro y no modifica el stock ni escribe nada', async () => {
    // Dos libros, y las afirmaciones de destino sobre el segundo: con uno solo, `href="/libros/1"`
    // clavado y `href={rutaDelDetalle(libro.id)}` renderizan lo mismo, así que "lleva al detalle de
    // **ese** libro" era infalsificable y las 2.000 filas podían apuntar al libro 1 con la suite en
    // verde. La cobertura que lo cazaba era el `enlacesAlDetalle()` de `test/app/detalle.test.ts`,
    // que este bloque acotó a la celda `data-campo="detalle"`; esta es su reposición para la celda
    // de venta.
    const { primero: otro, segundo: libro } = sembrarDos();
    const antes = contenido();

    const catalogo = await renderizarCatalogo();
    const celdas = celdasConMarcado(catalogo, 'venta');

    // El control existe, es uno por fila y dice qué hace.
    expect(celdas).toHaveLength(2);
    for (const celda of celdas) {
      expect(celda).toContain(TEXTO_VENDER);
    }

    // Y **no** ejecuta la venta: es un enlace al detalle de ese libro. Las tres negaciones son las
    // tres formas de que dejara de serlo, y cada una tiene su mutación: un `<form>` que postee, el
    // `method="post"` de ese formulario, y el `action` sintético con el que React renderiza un
    // formulario que invoca una Server Action (`javascript:throw…`).
    for (const celda of celdas) {
      expect(celda).not.toContain('<form');
      expect(celda).not.toContain('method="post"');
      expect(celda).not.toContain('javascript:');
    }

    // El destino se afirma **dentro de la fila del libro**, que es lo que `celdasConMarcado()` sobre
    // el catálogo entero no puede distinguir: la celda de venta de la fila del segundo enlaza al
    // detalle del segundo, y no al del otro.
    const filaDelLibro = filaConTitulo(catalogo, libro.titulo);
    const ventaDelLibro = celdasConMarcado(filaDelLibro, 'venta');

    expect(ventaDelLibro).toHaveLength(1);
    expect(ventaDelLibro[0]).toContain(`href="${rutaDelDetalle(libro.id)}"`);
    expect(ventaDelLibro[0]).not.toContain(`href="${rutaDelDetalle(otro.id)}"`);

    // Y la fila del otro libro lleva **su** destino: así lo que se afirma es que el enlace sigue a
    // la fila, y no que una de las dos coincide por casualidad.
    const ventaDelOtro = celdasConMarcado(filaConTitulo(catalogo, otro.titulo), 'venta');
    expect(ventaDelOtro).toHaveLength(1);
    expect(ventaDelOtro[0]).toContain(`href="${rutaDelDetalle(otro.id)}"`);
    expect(ventaDelOtro[0]).not.toContain(`href="${rutaDelDetalle(libro.id)}"`);

    // AC-17 pide además que el control de venta se distinga del de ver. Comparten destino —los dos
    // llevan al detalle, que es donde se confirma— así que lo que los distingue es su celda y su
    // texto: sin esto serían dos anclas idénticas y la fila ofrecería dos veces lo mismo.
    const celdaDeVer = celdasConMarcado(filaDelLibro, 'detalle');
    expect(celdaDeVer).toHaveLength(1);
    expect(celdaDeVer[0]).toContain('>Ver<');
    expect(ventaDelLibro[0]).not.toContain('>Ver<');

    // Se sigue el camino de la usuaria: se acciona el control y se renderiza a dónde lleva.
    const html = await renderizarDetalle(String(libro.id));
    expect(html).toContain(TEXTO_CONFIRMAR_VENTA);

    // La venta quedó pendiente de confirmación: nada se escribió y el stock no se movió, ni el de
    // este libro ni el del otro.
    expect(stockDe(libro.id)).toBe(libro.stock);
    expect(stockDe(otro.id)).toBe(otro.stock);
    expect(contenido()).toEqual(antes);
    expect(ventas()).toEqual([]);
    expect(argumentosDeVenta).toEqual([]);
    expect(revalidar).not.toHaveBeenCalled();
  });

  it('el listado no invoca ninguna Server Action ni gana JavaScript de cliente (AC-17, M11)', () => {
    // La otra mitad, sobre el fuente: si la fila importara el módulo de la venta, un click de más
    // descontaría stock —el riesgo que AC-17 cierra— y el HTML renderizado dejaría de ser la única
    // evidencia. Se afirma acá y no en el HTML porque un import sin usar no se ve renderizado.
    const fuente = fs.readFileSync(
      path.join(process.cwd(), 'app/componentes/listado-libros.tsx'),
      'utf8',
    );

    expect(fuente).not.toMatch(/acciones-libro/u);
    expect(fuente).not.toMatch(/^\s*['"]use (client|server)['"]/mu);
    expect(fuente).not.toMatch(/from\s+['"]next\/link['"]/u);
  });
});
