import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { altaDeLibro } from '@/app/acciones';
import { Buscador, PARAMETRO_BUSQUEDA } from '@/app/componentes/buscador';
import { CamposDeAlta, FormularioAlta } from '@/app/componentes/formulario-alta';
import { ListadoLibros } from '@/app/componentes/listado-libros';
import ErrorDeRuta from '@/app/error';
import { MENSAJE_CAMPO_INVALIDO, mensajeDeCampo } from '@/app/mensajes';
import Pagina from '@/app/page';
import { buscarLibros } from '@/lib/db/consultas';
import type { ErrorCampo } from '@/lib/db/errores';
import { tienePortada } from '@/lib/portadas/almacenamiento';
import { baseDePrueba, DIRECTORIO_TEMPORAL } from '@/test/ayudas/base-de-prueba';

/**
 * La base `:memory:` del test en curso.
 *
 * `app/` no recibe la base por parámetro: `altaDeLibro()` y la página llaman a
 * `crearLibro()` y a `buscarLibros()` sin pasarla, así que la única forma de que el Server
 * Action opere contra una base de prueba es interceptar `obtenerDb()`. Es la excepción al
 * estilo de la casa —stubs por objeto y base inyectada—, y la razón es la firma del Server
 * Action: agregarle un parámetro `db` le agregaría un tercer campo a una superficie HTTP
 * pública (`POST /`), que es exactamente lo que la spec no quiere.
 */
let db: Database.Database | undefined;

/** Con esto en `true`, `obtenerDb()` falla como falla un disco: es el fallo de infraestructura. */
let conexionRota = false;

/**
 * El texto que jamás debe llegar a la usuaria (mitigación 8, riesgo R10): un error del
 * motor nombra tablas, columnas y códigos.
 */
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
 * `revalidatePath()` es la mitad de "el libro aparece en el listado": sin ella el Server
 * Action escribe y la página sigue mostrando el catálogo anterior. Fuera de un request de
 * Next.js la función real lanza (`Invariant: static generation store missing`), así que se
 * intercepta para poder afirmar que se la llamó, y con qué ruta.
 */
const revalidar = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidar }));

/**
 * Las entradas con las que el Server Action llamó a `crearLibro()`, en orden.
 *
 * Es la **frontera** entre `app/` y el repositorio, y es lo único de esta propiedad que le
 * pertenece a esta capa: qué claves arma el Server Action. Observar el efecto —que el libro
 * quede activo— no alcanza, porque eso lo decide la lista de columnas de `lib/db/libros.ts`.
 *
 * Se registra con un envoltorio que delega en la función real, no con un `vi.fn()` suelto: el
 * alta tiene que seguir ocurriendo de verdad contra la base de prueba. Y es un array y no un
 * mock a propósito, para que el `vi.restoreAllMocks()` del `afterEach` no le pueda borrar la
 * implementación y dejar a `crearLibro()` devolviendo `undefined`.
 */
const entradasDeCrearLibro = vi.hoisted(() => [] as unknown[]);

vi.mock('@/lib/db/libros', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/db/libros')>();

  const crearLibro: typeof original.crearLibro = (entrada, db, foto) => {
    entradasDeCrearLibro.push(entrada);

    return original.crearLibro(entrada, db, foto);
  };

  return { ...original, crearLibro };
});

/**
 * Espía de `guardarPortadaProcesada()` (FEAT-001c Block 2): envuelve la implementación real
 * —los tests de escritura efectiva la necesitan de verdad— y permite forzar, por test, un
 * fallo de infraestructura DESPUÉS de que `crearLibro()` ya tuvo éxito (riesgo aceptado A4).
 */
const guardarPortadaProcesadaMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/portadas/almacenamiento', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/portadas/almacenamiento')>();

  guardarPortadaProcesadaMock.mockImplementation(original.guardarPortadaProcesada);

  return { ...original, guardarPortadaProcesada: guardarPortadaProcesadaMock };
});

/** Un alta que el repositorio acepta. Los cuatro campos viajan como texto, igual que en el navegador. */
const ALTA_VALIDA = {
  titulo: 'El Aleph',
  editorial: 'Sur',
  stock: '3',
  precio: '1200',
} as const;

function formulario(campos: Record<string, string | File>): FormData {
  const datos = new FormData();

  for (const [campo, valor] of Object.entries(campos)) {
    datos.set(campo, valor);
  }

  return datos;
}

/** Un `File` como el que arma el navegador al adjuntar una foto (FEAT-001c Block 2). */
function archivo(bytes: Buffer, nombre = 'portada.jpg', tipo = 'image/jpeg'): File {
  // `new Uint8Array(bytes)` y no `bytes` directo: el `Buffer` de Node tipa su `.buffer` como
  // `ArrayBufferLike` (admite `SharedArrayBuffer`), que no es un `BlobPart` válido para `File`.
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

/** Un JPEG real y chico, para no depender de un fixture en el repositorio. */
async function imagenValida(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

/**
 * Da de alta un libro por el mismo camino que la usuaria: el Server Action.
 *
 * El estado previo va en `null`, que es lo que `useActionState` pasa en el primer envío.
 */
async function alta(campos: Record<string, string | File>) {
  return altaDeLibro(null, formulario(campos));
}

function titulosDelCatalogo(): string[] {
  return buscarLibros('', db).map((libro) => libro.titulo);
}

/**
 * Renderiza la pantalla principal a HTML.
 *
 * `app/page.tsx` es un Server Component async: primero se resuelve la promesa que devuelve
 * —ahí adentro está la lectura de `searchParams` y la consulta— y después se renderiza el
 * árbol. `searchParams` es una promesa en Next 16, no un objeto plano.
 */
async function renderizarPagina(
  consulta: Record<string, string | string[] | undefined> = {},
): Promise<string> {
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(consulta) }));
}

/**
 * Extrae el contenido de las celdas de un campo, en el orden en que salieron renderizadas.
 *
 * El listado marca cada celda con `data-campo`, que es el punto de anclaje de estos tests:
 * contar `<tr>` mezclaría la fila del encabezado con las de datos, y buscar el título con
 * `toContain` no diría nada del orden ni de cuántas filas hay.
 */
function celdas(html: string, campo: string): string[] {
  const patron = new RegExp(`<td[^>]*data-campo="${campo}"[^>]*>([^<]*)</td>`, 'gu');

  return Array.from(html.matchAll(patron), (coincidencia) => coincidencia[1]);
}

describe('altaDeLibro()', () => {
  beforeEach(async () => {
    db = baseDePrueba();
    conexionRota = false;
    revalidar.mockClear();
    entradasDeCrearLibro.length = 0;

    // `afterEach` corre `vi.restoreAllMocks()`, que a un `vi.fn()` sin spy detrás lo deja sin
    // implementación: se reafirma la real en cada test para que sobreviva al restore del test
    // anterior (y no sólo al primero de la describe).
    const real = await vi.importActual<typeof import('@/lib/portadas/almacenamiento')>(
      '@/lib/portadas/almacenamiento',
    );
    guardarPortadaProcesadaMock.mockReset();
    guardarPortadaProcesadaMock.mockImplementation(real.guardarPortadaProcesada);
  });

  afterEach(() => {
    db?.close();
    db = undefined;
    vi.restoreAllMocks();
  });

  it('con un FormData válido crea el libro y devuelve éxito (AC-01, FR-01)', async () => {
    const resultado = await alta({ ...ALTA_VALIDA });

    expect(resultado).toEqual({ ok: true, mensaje: expect.stringMatching(/\S/u) });

    // El éxito no es el valor de retorno sino el libro recuperable después (AC-01).
    expect(buscarLibros('aleph', db)).toEqual([
      expect.objectContaining({ titulo: 'El Aleph', editorial: 'Sur', stock: 3, precio: 1200 }),
    ]);

    // Y sin revalidar la ruta, la usuaria daría el alta y seguiría viendo el catálogo viejo.
    expect(revalidar).toHaveBeenCalledWith('/');
  });

  it('con título vacío devuelve el mensaje del campo titulo y no crea nada (AC-02)', async () => {
    const resultado = await alta({ ...ALTA_VALIDA, titulo: '' });

    // `toEqual` y no `toMatchObject`: el mapa tiene **una** clave, la del campo inválido.
    expect(resultado).toEqual({ ok: false, mensajes: { titulo: expect.stringMatching(/tít/iu) } });
    expect(titulosDelCatalogo()).toEqual([]);
    expect(revalidar).not.toHaveBeenCalled();
  });

  it('distingue el precio decimal del ausente y del no numérico (AC-02, AC-05)', async () => {
    const decimal = await alta({ ...ALTA_VALIDA, precio: '1234,50' });
    const ausente = await alta({ ...ALTA_VALIDA, precio: '' });
    const noNumerico = await alta({ ...ALTA_VALIDA, precio: 'abc' });
    const miles = await alta({ ...ALTA_VALIDA, precio: '1.234,50' });

    const mensajes = [decimal, ausente, noNumerico, miles].map((resultado) =>
      resultado.ok === false ? resultado.mensajes.precio : undefined,
    );

    // Los cuatro motivos tienen que llegar con cuatro textos distintos: reagruparlos le saca
    // a la usuaria la única pista de por qué le rechazaron el precio (AC-05).
    expect(new Set(mensajes).size).toBe(4);
    for (const mensaje of mensajes) {
      expect(mensaje).toMatch(/\S/u);
    }

    // Y el rechazo del decimal no redondea a 1235 ni a 1234: no persiste nada.
    expect(titulosDelCatalogo()).toEqual([]);
  });

  it('con un título duplicado nombra el libro en conflicto y su editorial (AC-03)', async () => {
    await alta({ ...ALTA_VALIDA, titulo: 'El Aleph', editorial: 'Emecé' });

    // El primer alta sí revalidó la ruta: lo que se mira acá es que el rechazo del segundo
    // **no** vuelva a revalidar.
    revalidar.mockClear();

    // Normaliza al mismo valor —`el aleph`— y declara otra editorial: sigue siendo el mismo
    // libro, porque la editorial no forma parte de la identidad.
    const resultado = await alta({ ...ALTA_VALIDA, titulo: '  el  aleph ', editorial: 'Sur' });

    expect(resultado.ok).toBe(false);
    const mensaje = resultado.ok === false ? (resultado.mensajes.titulo ?? '') : '';
    expect(mensaje).toContain('El Aleph');
    expect(mensaje).toContain('Emecé');

    expect(titulosDelCatalogo()).toEqual(['El Aleph']);
    expect(revalidar).not.toHaveBeenCalled();
  });

  it('sin el campo stock lo trata como vacío y no asume 0 (AC-02)', async () => {
    const resultado = await alta({
      titulo: ALTA_VALIDA.titulo,
      editorial: ALTA_VALIDA.editorial,
      precio: ALTA_VALIDA.precio,
    });

    expect(resultado).toEqual({ ok: false, mensajes: { stock: expect.stringMatching(/stock/iu) } });

    // La mitad que importa: no quedó un libro con stock 0 inventado por el servidor.
    expect(titulosDelCatalogo()).toEqual([]);
  });

  it('ignora los campos de más que traiga el FormData', async () => {
    // La spec lo declara y una invocación manipulada es la forma de probarlo: el Server Action
    // es un `POST /` y cualquiera puede agregarle campos. `estado` e `id` son justo los dos que
    // servirían para colarse —nacer archivado, o pisar un id—, así que se manda los dos.
    const resultado = await alta({
      ...ALTA_VALIDA,
      estado: 'archivado',
      id: '999',
      creado_en: '1999-01-01T00:00:00.000Z',
    });

    expect(resultado).toEqual({ ok: true, mensaje: expect.stringMatching(/\S/u) });

    // Primera mitad — **la frontera**, que es lo que le pertenece a esta capa: el Server Action
    // le pasa al repositorio exactamente las cuatro claves del alta y ninguna más. Ésta es la
    // aserción que se pone roja si alguien arma la entrada con un `...Object.fromEntries(datos)`.
    expect(entradasDeCrearLibro).toHaveLength(1);
    expect(Object.keys(entradasDeCrearLibro[0] as object).sort()).toEqual([
      'editorial',
      'precio',
      'stock',
      'titulo',
    ]);

    // Segunda mitad — el efecto de punta a punta, que es lo que le importa a la usuaria: el
    // libro quedó con el estado y el id que decide el servidor y no los que vinieron. Esta
    // mitad **no** se pone roja por un cambio en `app/` —la lista de columnas que se escriben
    // está fija en `lib/db/libros.ts`, del Bloque 3—: se pondría roja el día que el repositorio
    // escribiera columnas a partir de las claves del objeto de entrada. Las dos mitades se
    // conservan porque vigilan cosas distintas.
    expect(buscarLibros('aleph', db)).toEqual([
      expect.objectContaining({ titulo: 'El Aleph', estado: 'activo' }),
    ]);
    expect(buscarLibros('aleph', db)[0]?.id).not.toBe(999);
  });

  it('ante un fallo de infraestructura devuelve un mensaje genérico sin texto de SQLite', async () => {
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    conexionRota = true;

    const resultado = await alta({ ...ALTA_VALIDA });

    expect(resultado).toEqual({
      ok: false,
      mensajes: {},
      general: expect.stringMatching(/\S/u),
    });
    const general = resultado.ok === false ? (resultado.general ?? '') : '';
    expect(general).not.toContain('SQLITE_');
    expect(general).not.toContain('unable to open database file');

    // El fallo se registra —si no, nadie se enteraría— pero **sin el contenido del
    // formulario**: un log con el título y la editorial es el formulario filtrado al disco.
    expect(registro).toHaveBeenCalled();
    const registrado = registro.mock.calls.flat().map(String).join(' ');
    expect(registrado).not.toContain(ALTA_VALIDA.titulo);
    expect(registrado).not.toContain(ALTA_VALIDA.editorial);
  });

  /**
   * FEAT-001c Block 2 (FR-01): el alta puede llevar una foto de portada opcional. Los siete
   * tests obligatorios del bloque, en el mismo orden en que la spec los enumera.
   */
  describe('con foto de portada (FEAT-001c Block 2, FR-01)', () => {
    it('sin adjuntar ninguna foto el alta sigue siendo válida (mitad de AC-01, regresión)', async () => {
      const resultado = await alta({ ...ALTA_VALIDA });

      expect(resultado).toEqual({ ok: true, mensaje: expect.stringMatching(/\S/u) });
      expect(titulosDelCatalogo()).toEqual(['El Aleph']);
    });

    it('con una foto válida crea el libro y guarda el archivo procesado en disco (otra mitad de AC-01)', async () => {
      const bytes = await imagenValida();

      const resultado = await alta({ ...ALTA_VALIDA, foto: archivo(bytes) });

      expect(resultado).toEqual({ ok: true, mensaje: expect.stringMatching(/\S/u) });

      const [libro] = buscarLibros('aleph', db);
      expect(libro).toBeDefined();
      expect(tienePortada(libro?.id ?? -1)).toBe(true);
    });

    it('con una foto de formato inválido y el título vacío devuelve los dos rechazos juntos, y no crea nada (AC-07)', async () => {
      const basura = Buffer.from('esto definitivamente no es una imagen', 'utf8');

      const resultado = await alta({ ...ALTA_VALIDA, titulo: '', foto: archivo(basura) });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      // Los dos rechazos juntos, no sólo uno (hallazgo del arch-auditor ya resuelto en Block 5).
      expect(Object.keys(resultado.mensajes).sort()).toEqual(['foto', 'titulo']);
      expect(resultado.mensajes.titulo).toMatch(/\S/u);
      expect(resultado.mensajes.foto).toMatch(/\S/u);
      expect(titulosDelCatalogo()).toEqual([]);
    });

    it('con una foto de más de 10 MB rechaza el campo foto y no crea el libro (AC-07)', async () => {
      const demasiadoGrande = Buffer.alloc(10 * 1024 * 1024 + 1);

      const resultado = await alta({ ...ALTA_VALIDA, foto: archivo(demasiadoGrande) });

      expect(resultado).toEqual({
        ok: false,
        mensajes: { foto: expect.stringMatching(/\S/u) },
      });
      expect(titulosDelCatalogo()).toEqual([]);
    });

    it('MENSAJES.foto.formato_no_admitido y MENSAJES.foto.demasiado_grande existen y no están vacíos', () => {
      const formatoNoAdmitido = mensajeDeCampo({ campo: 'foto', detalle: 'formato_no_admitido' });
      const demasiadoGrande = mensajeDeCampo({ campo: 'foto', detalle: 'demasiado_grande' });

      expect(formatoNoAdmitido).toMatch(/\S/u);
      expect(demasiadoGrande).toMatch(/\S/u);
      expect(formatoNoAdmitido).not.toBe(MENSAJE_CAMPO_INVALIDO);
      expect(demasiadoGrande).not.toBe(MENSAJE_CAMPO_INVALIDO);
    });

    // El fallo de infraestructura de crearLibro() con una foto en el medio es el mismo camino
    // que el test "ante un fallo de infraestructura devuelve un mensaje genérico sin texto de
    // SQLite" ya cubre (no cambia con la foto, que ni siquiera llega a escribirse porque
    // `crearLibro()` no tuvo éxito): se deja esta constancia en vez de duplicarlo.

    it('si falla al escribir la portada DESPUÉS de crear el libro, el alta redirige a éxito igual (riesgo A4) y no loguea el buffer', async () => {
      const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
      const bytes = await imagenValida();
      guardarPortadaProcesadaMock.mockImplementationOnce(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const resultado = await alta({ ...ALTA_VALIDA, foto: archivo(bytes) });

      // A4: el alta sigue siendo exitosa aunque la escritura de la foto haya fallado.
      expect(resultado).toEqual({ ok: true, mensaje: expect.stringMatching(/\S/u) });
      expect(titulosDelCatalogo()).toEqual(['El Aleph']);

      expect(registro).toHaveBeenCalled();
      const contieneElBuffer = registro.mock.calls
        .flat()
        .some(
          (valor) =>
            Buffer.isBuffer(valor) ||
            (Buffer.isBuffer(bytes) && String(valor).includes(bytes.toString('latin1'))),
        );
      expect(contieneElBuffer).toBe(false);
    });
  });
});

describe('app/page.tsx', () => {
  beforeEach(async () => {
    db = baseDePrueba();
    conexionRota = false;
    revalidar.mockClear();

    await alta({ titulo: 'Rayuela', editorial: 'Sudamericana', stock: '4', precio: '9500' });
    await alta({ titulo: 'El Principito', editorial: 'Emecé', stock: '0', precio: '3200' });
    await alta({ titulo: 'Aleph', editorial: 'Sur', stock: '7', precio: '1200' });
    await alta({ titulo: 'Zama', editorial: 'Sur', stock: '1', precio: '4100' });

    // La baja lógica es de otra feature, así que el archivado se fuerza por SQL: sin un
    // libro archivado, "una fila por cada libro **activo**" no se puede afirmar.
    db.prepare("UPDATE libros SET estado = 'archivado' WHERE titulo = ?").run('Zama');
  });

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('renderiza una fila por libro activo, en orden alfabético, con precio y stock (AC-06, AC-07)', async () => {
    const html = await renderizarPagina();

    expect(celdas(html, 'titulo')).toEqual(['Aleph', 'El Principito', 'Rayuela']);
    expect(celdas(html, 'editorial')).toEqual(['Sur', 'Emecé', 'Sudamericana']);
    expect(celdas(html, 'stock')).toEqual(['7', '0', '4']);
    expect(celdas(html, 'precio')).toEqual(['$ 1.200', '$ 3.200', '$ 9.500']);
    expect(html).not.toContain('Zama');
  });

  it('filtra el listado por el término de búsqueda de la query (AC-06)', async () => {
    const html = await renderizarPagina({ [PARAMETRO_BUSQUEDA]: 'sudamer' });

    expect(celdas(html, 'titulo')).toEqual(['Rayuela']);
  });

  it('colapsa un parámetro de búsqueda repetido en vez de ignorar la búsqueda', async () => {
    // `?q=a&q=b` llega como `string[]`. Silenciado con un `as string`, el array degrada a `''`
    // y la página devuelve el catálogo completo ignorando la búsqueda **sin fallar**.
    const html = await renderizarPagina({ [PARAMETRO_BUSQUEDA]: ['sudamer', 'emece'] });

    expect(celdas(html, 'titulo')).toEqual(['Rayuela']);
  });

  it('trata un parámetro de búsqueda ausente o vacío como catálogo completo (AC-07)', async () => {
    const completo = ['Aleph', 'El Principito', 'Rayuela'];

    expect(celdas(await renderizarPagina({}), 'titulo')).toEqual(completo);
    expect(celdas(await renderizarPagina({ [PARAMETRO_BUSQUEDA]: '' }), 'titulo')).toEqual(
      completo,
    );
    expect(celdas(await renderizarPagina({ [PARAMETRO_BUSQUEDA]: [] }), 'titulo')).toEqual(
      completo,
    );
  });

  it('escapa el título que cargó la usuaria en vez de interpretarlo como HTML', async () => {
    await alta({
      titulo: '<script>alert(1)</script>',
      editorial: '<img onerror="alert(2)">',
      stock: '1',
      precio: '100',
    });

    const html = await renderizarPagina();

    // React escapa por defecto; el que rompe esto es `dangerouslySetInnerHTML`
    // (mitigación 9), que además tiene su propio guardia sobre el código fuente.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img onerror=');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('componentes de la pantalla', () => {
  it('el listado avisa cuando no hay ningún libro', () => {
    const html = renderToStaticMarkup(createElement(ListadoLibros, { libros: [] }));

    expect(celdas(html, 'titulo')).toEqual([]);
    expect(html).toMatch(/no hay/iu);
  });

  it('el formulario declara los cuatro campos con sus cotas del lado del cliente', () => {
    const html = renderToStaticMarkup(createElement(FormularioAlta));

    // Comodidad para la usuaria, nunca la barrera: la validación real es la de `crearLibro()`
    // (mitigación 7). Igual tienen que estar los cuatro campos, con el nombre que lee el
    // Server Action.
    for (const campo of ['titulo', 'editorial', 'stock', 'precio']) {
      expect(html).toContain(`name="${campo}"`);
    }
    expect(html).toContain('min="0"');
    expect(html).toContain('max="1000000"');
    // React 19 sirve `maxLength` tal cual, sin bajarlo a `maxlength`; los atributos de HTML
    // son insensibles a mayúsculas, así que el navegador lo aplica igual. La aserción va
    // sobre lo que se sirve de verdad y no sobre lo que uno supone.
    expect(html).toContain('maxLength="300"');
  });

  it('el formulario muestra cada mensaje de rechazo y el aviso general', () => {
    // La otra mitad de AC-02: el Server Action devuelve un mensaje por campo y el formulario
    // los tiene que **mostrar**. Se renderiza la parte presentacional con el estado ya
    // rechazado, porque `useActionState` siempre arranca del estado inicial y por ese camino
    // no hay forma de ver los mensajes.
    const html = renderToStaticMarkup(
      createElement(CamposDeAlta, {
        estado: {
          ok: false,
          mensajes: { titulo: 'Falta el título.', precio: 'El precio no es un número.' },
          general: 'Algo salió mal.',
        },
        enviarAlta: () => undefined,
        enviando: false,
      }),
    );

    expect(html).toContain('Falta el título.');
    expect(html).toContain('El precio no es un número.');
    expect(html).toContain('Algo salió mal.');
  });

  it('el formulario avisa el éxito y bloquea el botón mientras envía', () => {
    const exito = renderToStaticMarkup(
      createElement(CamposDeAlta, {
        estado: { ok: true, mensaje: 'El libro quedó cargado.' },
        enviarAlta: () => undefined,
        enviando: false,
      }),
    );

    expect(exito).toContain('El libro quedó cargado.');

    // `null` es el estado antes del primer envío: el formulario no muestra ningún aviso.
    const enviando = renderToStaticMarkup(
      createElement(CamposDeAlta, {
        estado: null,
        enviarAlta: () => undefined,
        enviando: true,
      }),
    );

    // Sin esto, dos clicks seguidos son dos altas: la segunda rebota por duplicado, pero la
    // usuaria ve un error de título repetido que ella no provocó.
    expect(enviando).toContain('disabled=""');

    // Y con el estado en `null` el formulario no muestra **ningún** aviso: el párrafo del aviso
    // sale vacío y no hay un solo mensaje de campo con texto. Sin estas dos líneas, la rama del
    // estado inicial se ejecutaba sin que nada la afirmara.
    // El párrafo del aviso sale cerrado sobre sí mismo, y ninguno de los cuatro mensajes de
    // campo tiene contenido: la lookahead es la que distingue `></p>` —vacío— de un párrafo con
    // texto adentro. (Con `>\S` no alcanzaba: el `<` de `</p>` ya es un carácter que no es
    // espacio, así que esa versión se ponía roja contra un formulario perfectamente vacío.)
    expect(enviando).toContain('<p class="aviso error" aria-live="polite"></p>');
    expect(enviando).not.toMatch(/class="error-de-campo">(?!<\/p>)/u);
  });

  it('el buscador es un formulario GET que conserva el término', () => {
    const html = renderToStaticMarkup(createElement(Buscador, { termino: 'rayuela' }));

    expect(html).toContain('method="get"');
    expect(html).toContain(`name="${PARAMETRO_BUSQUEDA}"`);
    expect(html).toContain('value="rayuela"');
  });
});

describe('app/mensajes.ts', () => {
  /** Los once pares (campo, motivo) que `crearLibro()` puede devolver de verdad. */
  const RECHAZOS: ErrorCampo[] = [
    { campo: 'titulo', detalle: 'vacio' },
    { campo: 'titulo', detalle: 'demasiado_largo' },
    { campo: 'editorial', detalle: 'vacio' },
    { campo: 'editorial', detalle: 'demasiado_largo' },
    { campo: 'stock', detalle: 'no_entero' },
    { campo: 'stock', detalle: 'fuera_de_rango' },
    { campo: 'precio', detalle: 'ausente' },
    { campo: 'precio', detalle: 'no_numerico' },
    { campo: 'precio', detalle: 'decimal' },
    { campo: 'precio', detalle: 'separador_miles' },
    { campo: 'precio', detalle: 'fuera_de_rango' },
  ];

  it('traduce los once rechazos del repositorio a once textos distintos', () => {
    // `fuera_de_rango` llega para `stock` y para `precio` con el mismo nombre y significan
    // cosas distintas: si la traducción fuera por motivo y no por (campo, motivo), la usuaria
    // leería el mensaje del stock cuando el problema es el precio.
    const mensajes = RECHAZOS.map((rechazo) => mensajeDeCampo(rechazo));

    for (const mensaje of mensajes) {
      expect(mensaje).toMatch(/\S/u);
      expect(mensaje).not.toBe(MENSAJE_CAMPO_INVALIDO);
    }
    expect(new Set(mensajes).size).toBe(RECHAZOS.length);
  });

  it('ante un motivo que no le corresponde al campo devuelve un texto genérico', () => {
    // Un `precio` con motivo de texto no lo produce ningún camino de hoy, pero el día que
    // `lib/db/` agregue un motivo, la usuaria tiene que leer una frase y no `undefined`.
    expect(mensajeDeCampo({ campo: 'titulo', detalle: 'decimal' })).toBe(MENSAJE_CAMPO_INVALIDO);
  });
});

describe('app/error.tsx', () => {
  it('se dispara de verdad: la página propaga el fallo de la consulta en vez de tragarlo', async () => {
    // La otra mitad del límite de error, y la que ningún renderizado a mano cubre: `error.tsx`
    // sólo aparece si la página **deja pasar** la excepción. Si alguien envolviera
    // `buscarLibros()` en un `try/catch` que devuelve `[]`, la pantalla mostraría "no hay
    // libros" ante una base ilegible, el límite de error no se mostraría nunca y sin este test
    // nada fallaría.
    db = baseDePrueba();
    conexionRota = true;

    try {
      await expect(renderizarPagina()).rejects.toThrow(/SQLITE_CANTOPEN/u);
    } finally {
      conexionRota = false;
      db.close();
      db = undefined;
    }
  });

  it('muestra un mensaje genérico y no el error subyacente', () => {
    const error = Object.assign(new Error(ERROR_DE_INFRAESTRUCTURA), { digest: 'abc123' });

    const html = renderToStaticMarkup(
      createElement(ErrorDeRuta, { error, reset: () => undefined }),
    );

    expect(html).not.toContain('SQLITE_');
    expect(html).not.toContain(ERROR_DE_INFRAESTRUCTURA);
    expect(html).not.toContain('abc123');
    // Y dice algo: un límite de error que renderiza vacío deja la pantalla en blanco.
    expect(html).toMatch(/no se pudo/iu);
  });
});

describe('convenciones de app/', () => {
  /** Todos los archivos bajo `app/`, recursivo. */
  function archivosDeApp(directorio = path.join(process.cwd(), 'app')): string[] {
    return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const completo = path.join(directorio, entrada.name);
      return entrada.isDirectory() ? archivosDeApp(completo) : [completo];
    });
  }

  const archivos = archivosDeApp();

  it('recorre de verdad los archivos de app/, incluidos los de subdirectorios', () => {
    // Meta-guardia del recorrido: si `archivosDeApp()` devolviera una lista corta o vacía,
    // los guardias de abajo pasarían en silencio sin haber mirado nada.
    const nombres = archivos.map((archivo) => path.relative(process.cwd(), archivo));

    expect(nombres).toContain('app/page.tsx');
    expect(nombres).toContain('app/acciones.ts');
    expect(nombres).toContain('app/error.tsx');
    expect(nombres).toContain('app/mensajes.ts');
    expect(nombres).toContain('app/componentes/listado-libros.tsx');
    expect(nombres).toContain('app/componentes/formulario-alta.tsx');
    expect(nombres).toContain('app/componentes/buscador.tsx');
  });

  it('no importa better-sqlite3 ni escribe SQL en ningún archivo de app/', () => {
    // La separación de capas: `app/` llama al repositorio y no toca la base ni normaliza
    // títulos. Se comprueba sobre el fuente porque un test de comportamiento no la ve.
    //
    // Los tres primeros controles valen para **todo** archivo de `app/` y no tienen forma de
    // dar un falso positivo. Son, además, los que cierran el hueco de un guardia hecho sólo de
    // palabras SQL: se puede llegar a la base sin escribir ni una —importando el módulo de
    // conexión, o preparando una sentencia que viva en un identificador—.
    for (const archivo of archivos) {
      const fuente = fs.readFileSync(archivo, 'utf8');

      expect(fuente, archivo).not.toContain('better-sqlite3');
      expect(fuente, archivo).not.toContain('lib/db/conexion');
      expect(fuente, archivo).not.toContain('.prepare(');
    }

    // El barrido de DML, en cambio, se limita al código y pide **contexto en pares**, no
    // palabras sueltas. Dos motivos medidos, los dos de falsos positivos y no de agujeros:
    //
    // - Bajo la bandera `u` sin propiedades Unicode, `\w` es ASCII y una vocal acentuada cuenta
    //   como límite de palabra, así que `\balter\b` muerde `"se alteró el HTML"` y `"no lo
    //   alterás vos"` —el voseo es el estilo de la casa—.
    // - `archivos` incluye `app/globals.css`: el día que la pantalla estilice un `<select>`, un
    //   `\bselect\b` pondría rojo el guardia con un mensaje que habla de SQL.
    //
    // Pedir el par (`select … from`, `insert into`, `update … set`) no le saca dientes: una
    // sentencia sin su segunda mitad no es una sentencia. El par se busca **por línea**, porque
    // a lo largo del archivo cualquier `import … from` cerraría el par con un `select` que
    // estuviera en una prosa cualquiera.
    const PARES_DML = [
      /\bselect\b.*\bfrom\b/iu,
      /\binsert\s+into\b/iu,
      /\bupdate\b.*\bset\b/iu,
      /\bdelete\s+from\b/iu,
      /\bdrop\s+(table|index|view)\b/iu,
      /\balter\s+table\b/iu,
      /\btruncate\s+table\b/iu,
    ];
    const codigo = archivos.filter((archivo) => /\.tsx?$/u.test(archivo));

    expect(codigo.length).toBeGreaterThan(0);

    for (const archivo of codigo) {
      const lineas = fs.readFileSync(archivo, 'utf8').split('\n');

      for (const linea of lineas) {
        for (const par of PARES_DML) {
          expect(linea, archivo).not.toMatch(par);
        }
      }
    }
  });

  it('no inyecta HTML sin escapar en ningún archivo de app/', () => {
    // Mitigación 9: los títulos y las editoriales los carga la usuaria y React los escapa
    // solo. La propiedad de React que lo desactiva convierte un título en un vector de XSS,
    // y `innerHTML` y una URL `javascript:` son las otras dos formas de lo mismo. `innerHTML`
    // cubre además la propiedad de React por subcadena; va escrita aparte igual, para que
    // reducir una no deje la otra sin guardia.
    for (const archivo of archivos) {
      const fuente = fs.readFileSync(archivo, 'utf8');

      expect(fuente, archivo).not.toContain('dangerouslySetInnerHTML');
      expect(fuente, archivo).not.toMatch(/innerHTML/iu);
      expect(fuente, archivo).not.toMatch(/javascript:/iu);
    }
  });

  /**
   * Los módulos de `app/` que declaran la directiva de Server Actions **a nivel de módulo**.
   *
   * Se descubren leyendo el fuente y no por ruta fija: clavar el guardia en `app/acciones.ts`
   * dejaría sin vigilancia al primer archivo que estrene la directiva mañana. La directiva
   * suelta dentro de una función no cuenta, y es correcto que no cuente: la restricción de
   * exports es del módulo.
   *
   * Las comillas van en una clase y el punto y coma es opcional: la directiva vale igual
   * escrita `"use server"` o sin `;`, y un patrón que exigiera una sola de esas formas dejaría
   * al archivo **invisible para el guardia** —sus `export const` pasarían sin control— en vez
   * de fallar. Que `prettier` normalice las comillas no es una barrera de seguridad: es una
   * herramienta de formato que alguien puede no correr.
   */
  const DIRECTIVA_DE_SERVIDOR = /^\s*['"]use server['"];?/u;

  const modulosDeServidor = archivos.filter((archivo) =>
    DIRECTIVA_DE_SERVIDOR.test(fs.readFileSync(archivo, 'utf8')),
  );

  it('encuentra los módulos que declaran la directiva de Server Actions', () => {
    // Meta-guardia del filtro: sin esto, un `modulosDeServidor` vacío haría que el guardia de
    // abajo pase sin haber mirado ningún archivo.
    const nombres = modulosDeServidor.map((archivo) => path.relative(process.cwd(), archivo));

    expect(nombres).toContain('app/acciones.ts');
  });

  it('en un módulo "use server" sólo exporta funciones async y tipos', () => {
    // `AGENTS.md`, Code conventions: un archivo `'use server'` sólo puede exportar funciones
    // async, y con cualquier otra cosa la app falla al enviar el formulario. La regla se
    // escribe **en positivo** —una allowlist de formas admitidas— y no como una lista de
    // formas prohibidas: `export const` es apenas una de ellas, y una lista negra no ve
    // `export { X }`, `export * from`, `export default` ni una función sync.
    //
    // `export type` y `export interface` sí son legales: se borran al compilar y no llegan a
    // ser un export en tiempo de ejecución.
    const PERMITIDAS = [/^export async function \w/u, /^export type\b/u, /^export interface\b/u];

    expect(modulosDeServidor.length).toBeGreaterThan(0);

    for (const archivo of modulosDeServidor) {
      // Que el archivo abra con la directiva ya lo garantizó el filtro que armó esta lista:
      // repetirlo acá era peso muerto, y encima con la forma literal que el filtro dejó de
      // exigir.
      const fuente = fs.readFileSync(archivo, 'utf8');

      const exports = fuente
        .split('\n')
        .map((linea) => linea.trim())
        // Una línea de comentario nunca es un export; una de código nunca empieza con `*`.
        .filter((linea) => !linea.startsWith('//') && !linea.startsWith('*'))
        .filter((linea) => linea.startsWith('export'));

      expect(exports.length, archivo).toBeGreaterThan(0);
      for (const linea of exports) {
        expect(
          PERMITIDAS.some((permitida) => permitida.test(linea)),
          `${archivo}: export no admitido en un módulo 'use server' → ${linea}`,
        ).toBe(true);
      }
    }
  });
});

describe('umbrales de cobertura (AC-11, NFR-03)', () => {
  const raiz = process.cwd();

  /**
   * Los umbrales declarados en `vitest.config.ts`, leídos del módulo real y no de una copia.
   *
   * El `as` es el precio de que `coverage` sea una unión por proveedor en los tipos de
   * Vitest; no afloja el guardia: si la clave `thresholds` desapareciera, esto queda
   * `undefined` y las tres aserciones de abajo se ponen rojas.
   */
  interface Cobertura {
    provider?: string;
    include?: string[];
    thresholds?: { lines?: number; branches?: number; functions?: number };
  }

  async function cobertura(): Promise<Cobertura | undefined> {
    const configuracion = (await import('@/vitest.config')).default;
    return configuracion.test?.coverage as Cobertura | undefined;
  }

  it('declara los tres umbrales del 80 % sobre lib/ y app/', async () => {
    const medida = await cobertura();

    expect(medida?.provider).toBe('v8');
    expect(medida?.thresholds).toEqual({ lines: 80, branches: 80, functions: 80 });

    // Un umbral sobre un `include` que no abarca el código nuevo no mide nada.
    expect(medida?.include?.some((patron) => patron.startsWith('lib/'))).toBe(true);
    expect(medida?.include?.some((patron) => patron.startsWith('app/'))).toBe(true);
  });

  it('el script de test corre con cobertura, así que el umbral se aplica en npm test', () => {
    const scripts = (
      JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts;

    // `test` puede delegar en otro script; se sigue un nivel para no atarse a la redacción.
    const declarado = scripts.test ?? '';
    const referencia = /^npm run ([\w:-]+)$/u.exec(declarado);
    const comando = referencia === null ? declarado : (scripts[referencia[1]] ?? '');

    expect(comando).toContain('--coverage');
  });

  it('una corrida con esos mismos umbrales falla cuando la cobertura queda por debajo', async () => {
    // El umbral declarado no prueba nada por sí solo: lo que AC-11 pide es que la suite
    // **falle**. Se corre Vitest de verdad en un proyecto mínimo y aislado, con los umbrales
    // leídos del `vitest.config.ts` real y un archivo que ningún test ejercita. No se toca la
    // configuración del repo: si alguien le saca los umbrales, acá se inyecta `undefined`, la
    // corrida termina en 0 y este test se pone rojo.
    //
    // **El proyecto de prueba vive dentro del repo, en `.tmp-tests/`, y tiene que quedarse
    // ahí.** Desde `/tmp` la corrida hija no resuelve `vitest/config`: Node busca
    // `node_modules/` subiendo desde el directorio del archivo de configuración, y desde
    // `/tmp` no hay ningún `node_modules/` arriba. Moverlo "para no ensuciar el repo" rompe el
    // test; `.tmp-tests/` está en el `.gitignore` justo para esto.
    const umbrales = (await cobertura())?.thresholds;
    const directorio = path.join(DIRECTORIO_TEMPORAL, `umbrales-${process.pid}`);

    // Idempotente: un directorio rancio de una corrida interrumpida no debe cambiar el
    // resultado de ésta.
    fs.rmSync(directorio, { recursive: true, force: true });
    fs.mkdirSync(directorio, { recursive: true });

    try {
      fs.writeFileSync(
        path.join(directorio, 'vitest.config.ts'),
        [
          "import { defineConfig } from 'vitest/config';",
          '',
          'export default defineConfig({',
          '  test: {',
          "    environment: 'node',",
          "    include: ['humo.test.ts'],",
          '    coverage: {',
          "      provider: 'v8',",
          "      reporter: ['text'],",
          "      include: ['sin-cobertura.ts'],",
          `      thresholds: ${JSON.stringify(umbrales)},`,
          '    },',
          '  },',
          '});',
          '',
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(directorio, 'sin-cobertura.ts'),
        [
          'export function jamasLlamada(numero: number): number {',
          '  return numero > 0 ? numero : 0;',
          '}',
          '',
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(directorio, 'humo.test.ts'),
        [
          "import { expect, it } from 'vitest';",
          '',
          "it('no ejercita el módulo medido', () => {",
          '  expect(1).toBe(1);',
          '});',
          '',
        ].join('\n'),
      );

      // `timeout` y `killSignal` no son decoración: `spawnSync` bloquea el hilo, así que el
      // timeout del `it()` no puede rescatar nada —Vitest no interrumpe una llamada síncrona— y
      // un hijo colgado colgaría la suite entera para siempre y sin diagnóstico. `maxBuffer`
      // acota la salida: el reporte de cobertura de un proyecto grande puede pasarse del
      // default y hacer fallar la llamada con un error que no tiene nada que ver con el umbral.
      const corrida = spawnSync(
        process.execPath,
        [path.join(raiz, 'node_modules/vitest/vitest.mjs'), 'run', '--coverage', '--root', '.'],
        {
          cwd: directorio,
          encoding: 'utf8',
          timeout: 60_000,
          killSignal: 'SIGKILL',
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      const salida = `${corrida.stdout}${corrida.stderr}`;

      // Un cuelgue se lee como cuelgue: si el hijo murió por la señal del timeout, `status` es
      // `null` —y `not.toBe(0)` lo daría por bueno—, así que se descarta antes de mirar nada.
      expect(
        corrida.error,
        `la corrida hija no arrancó: ${corrida.error?.message}`,
      ).toBeUndefined();
      expect(corrida.signal, 'la corrida hija se colgó y hubo que matarla').toBeNull();

      // Los tests del proyecto de prueba pasan: lo que hace fallar la corrida es el umbral.
      expect(salida).toMatch(/Tests\s+1 passed/u);
      expect(corrida.status).not.toBe(0);
      // Y los tres umbrales muerden, no sólo uno.
      expect(salida).toMatch(/Coverage for lines \(0%\) does not meet global threshold \(80%\)/u);
      expect(salida).toMatch(
        /Coverage for branches \(0%\) does not meet global threshold \(80%\)/u,
      );
      expect(salida).toMatch(
        /Coverage for functions \(0%\) does not meet global threshold \(80%\)/u,
      );
    } finally {
      fs.rmSync(directorio, { recursive: true, force: true });
    }
  }, 120_000);
});
