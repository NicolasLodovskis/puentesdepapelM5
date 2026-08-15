import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { notFound } from 'next/navigation';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DetalleLibro } from '@/app/componentes/detalle-libro';
import { ListadoLibros } from '@/app/componentes/listado-libros';
import PaginaDetalle from '@/app/libros/[id]/page';
import {
  MENSAJE_COLISION_DE_IDENTIDAD,
  MENSAJE_ERROR_DE_PANTALLA,
  MENSAJE_LIBRO_INEXISTENTE,
} from '@/app/mensajes';
import NoEncontrado from '@/app/not-found';
import Pagina from '@/app/page';
import { aplicarPragmas } from '@/lib/db/conexion';
import { SQL_001_INICIAL } from '@/lib/db/migraciones/001-inicial';
import { migrar } from '@/lib/db/migrar';
import type { Libro } from '@/lib/db/tipos';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';

/**
 * La base `:memory:` del test en curso.
 *
 * `app/` no recibe la base por parámetro —la vista de detalle llama a `leerLibroPorId()` sin
 * pasarla, igual que la pantalla principal con `buscarLibros()`—, así que la única forma de que
 * la ruta opere contra una base de prueba es interceptar `obtenerDb()`. Es el mismo recurso que
 * usa `test/app/acciones.test.ts` y por el mismo motivo.
 */
let db: Database.Database | undefined;

/**
 * La base v1 sembrada que **no** puede migrar: al aplicar la 003 dos libros pasan a compartir
 * identidad. Mientras está puesta, `obtenerDb()` recorre el camino real —migrar al abrir— y
 * propaga el error tipado del recálculo, no un error fabricado a mano.
 */
let baseQueColisiona: Database.Database | undefined;

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

      if (baseQueColisiona !== undefined) {
        // El camino real de producción: `obtenerDb()` migra al abrir y el recálculo lanza.
        migrar(baseQueColisiona);
        throw new Error('El recálculo tenía que fallar con la base sembrada, y no falló.');
      }

      if (db === undefined) {
        throw new Error('El test no abrió su base de prueba.');
      }

      return db;
    },
  };
});

/**
 * Los ids con los que la ruta llamó a la lectura por id, en orden.
 *
 * Es lo que hace falsable «404 **sin consultar la base**» (M1): observar el 404 no distingue el
 * rechazo previo de una consulta que no encontró nada. Se registra con un envoltorio que delega
 * en la función real, y en un array y no en un `vi.fn()` para que ningún `restoreAllMocks` le
 * pueda borrar la implementación.
 */
const lecturasPorId = vi.hoisted(() => [] as unknown[]);

vi.mock('@/lib/db/consultas', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/db/consultas')>();

  const leerLibroPorId: typeof original.leerLibroPorId = (id, conexion) => {
    lecturasPorId.push(id);

    return original.leerLibroPorId(id, conexion);
  };

  return { ...original, leerLibroPorId };
});

/**
 * La señal con la que Next.js pide la respuesta 404, **preguntada a `notFound()`** en vez de
 * clavada como literal.
 *
 * No se intercepta `next/navigation`: con `notFound()` mockeado, el test pasaría igual si la
 * página devolviera una pantalla cualquiera, y lo que M1 pide es que la ruta **responda 404**.
 * Tampoco se escribe a mano `'NEXT_HTTP_ERROR_FALLBACK;404'`, que es un detalle interno de Next:
 * derivándolo, un cambio de formato del framework mueve a la vez lo esperado y lo observado, y el
 * test se sigue poniendo rojo si la ruta deja de responder 404 —que es la propiedad que vigila—.
 */
const RESPUESTA_404 = ((): string => {
  try {
    notFound();
  } catch (senal) {
    const mensaje = senal instanceof Error ? senal.message : '';

    // La mitad que faltaba, y la que degradaba en silencio: si Next pasara a lanzar algo sin
    // `message`, esto quedaba `undefined`, y `rejects.toThrow(undefined)` **acepta cualquier
    // error** —las seis aserciones de 404 se volverían "lanza algo"—. Con la cadena vacía
    // `toThrow` ya falla, pero un rojo que diga por qué vale más que uno por comparar contra ''.
    if (mensaje === '') {
      throw new Error(
        'notFound() de Next.js lanzó algo sin mensaje: la respuesta 404 ya no se puede afirmar.',
      );
    }

    return mensaje;
  }

  throw new Error('notFound() de Next.js dejó de lanzar: la respuesta 404 ya no se puede afirmar.');
})();

const FECHA = '2026-08-11T00:00:00.000Z';

const SQL_SEMBRAR = `
  INSERT INTO libros
    (titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
     stock, precio, estado, creado_en)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

interface Semilla {
  titulo: string;
  identidad: string;
  editorial: string;
  stock?: number;
  precio?: number;
  estado?: 'activo' | 'archivado';
}

function sembrar(base: Database.Database, semilla: Semilla): number {
  const insercion = base
    .prepare(SQL_SEMBRAR)
    .run(
      semilla.titulo,
      semilla.identidad,
      semilla.titulo.toLowerCase(),
      semilla.editorial,
      semilla.editorial.toLowerCase(),
      semilla.stock ?? 4,
      semilla.precio ?? 9500,
      semilla.estado ?? 'activo',
      FECHA,
    );

  return Number(insercion.lastInsertRowid);
}

/**
 * Base migrada sólo hasta la 001 y sembrada con dos libros que **hoy** tienen identidades
 * distintas y que con FR-10 pasan a compartirla. Es el escenario de AC-16 de punta a punta:
 * `migrar()` lanza la colisión de verdad, sin ningún error fabricado.
 */
function baseSembradaQueColisiona(): Database.Database {
  const base = new Database(':memory:');

  aplicarPragmas(base);
  base.exec(SQL_001_INICIAL);
  base.pragma('user_version = 1');
  sembrar(base, { titulo: 'Principito, El.', identidad: 'principito el', editorial: 'Emece' });
  sembrar(base, { titulo: 'El Principito', identidad: 'el principito', editorial: 'Sur' });

  return base;
}

/** La base del test en curso, sin `!`: si no está abierta es un error del test, no del código. */
function baseAbierta(): Database.Database {
  if (db === undefined) {
    throw new Error('El test no abrió su base de prueba.');
  }

  return db;
}

async function renderizarDetalle(id: string): Promise<string> {
  return renderToStaticMarkup(await PaginaDetalle({ params: Promise.resolve({ id }) }));
}

async function renderizarPagina(): Promise<string> {
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }));
}

/** El valor de un dato del detalle, marcado con `data-campo` igual que las celdas del listado. */
function dato(html: string, campo: string): string[] {
  const patron = new RegExp(`<dd[^>]*data-campo="${campo}"[^>]*>([^<]*)</dd>`, 'gu');

  return Array.from(html.matchAll(patron), (coincidencia) => coincidencia[1]);
}

/** Las operaciones que la vista declara ofrecer, por su marca. */
function operaciones(html: string): string[] {
  return Array.from(html.matchAll(/data-operacion="([^"]+)"/gu), (coincidencia) => coincidencia[1]);
}

/**
 * Los destinos de los enlaces **de la celda "Detalle"** de cada fila, en orden de aparición.
 *
 * El extractor está acotado a esa celda a propósito. Sin acotar, afirmaba "hay exactamente un ancla
 * a `/libros/…` en toda la fila", que es más de lo que FR-01 pide —"que el detalle sea alcanzable
 * desde su fila"— y de lo que el test que lo usa dice comprobar: con eso, el control de venta que
 * AC-17 exige en la misma fila ponía roja una aserción sobre otra cosa. Acotado, la afirmación es
 * exactamente la que el test enuncia, y sigue poniéndose roja si una fila deja de enlazar a su
 * detalle o si enlaza al del libro equivocado.
 */
function enlacesAlDetalle(html: string): string[] {
  return Array.from(
    html.matchAll(/<td[^>]*data-campo="detalle"[^>]*>([\s\S]*?)<\/td>/gu),
    (celda) => celda[1],
  ).flatMap((celda) =>
    Array.from(celda.matchAll(/href="(\/libros\/[^"]*)"/gu), (coincidencia) => coincidencia[1]),
  );
}

const LIBRO: Libro = {
  id: 7,
  titulo: 'Rayuela',
  tituloNormalizado: 'rayuela',
  tituloOrden: 'rayuela',
  editorial: 'Sudamericana',
  editorialNormalizada: 'sudamericana',
  stock: 4,
  precio: 9500,
  estado: 'activo',
  creadoEn: FECHA,
};

describe('app/libros/[id]/page.tsx', () => {
  beforeEach(() => {
    db = baseDePrueba();
    conexionRota = false;
    baseQueColisiona = undefined;
    lecturasPorId.length = 0;
  });

  afterEach(() => {
    db?.close();
    db = undefined;
    baseQueColisiona?.close();
    baseQueColisiona = undefined;
  });

  it('muestra el título, la editorial, el stock y el precio del libro (AC-01, FR-01)', async () => {
    const id = sembrar(baseAbierta(), {
      titulo: 'Rayuela',
      identidad: 'rayuela',
      editorial: 'Sudamericana',
    });

    const html = await renderizarDetalle(String(id));

    expect(dato(html, 'titulo')).toEqual(['Rayuela']);
    expect(dato(html, 'editorial')).toEqual(['Sudamericana']);
    expect(dato(html, 'stock')).toEqual(['4']);
    expect(dato(html, 'precio')).toEqual(['$ 9.500']);
  });

  it('ofrece desde la vista las operaciones de FR-03 a FR-06 (AC-01)', async () => {
    const id = sembrar(baseAbierta(), {
      titulo: 'Rayuela',
      identidad: 'rayuela',
      editorial: 'Sudamericana',
    });

    const html = await renderizarDetalle(String(id));

    // Los cuatro campos que FR-03 (precio), FR-04 (stock) y FR-05 (título y editorial) permiten
    // corregir desde acá; FR-06 es la regla que gobierna el cambio de título.
    expect(operaciones(html).sort()).toEqual(['editorial', 'precio', 'stock', 'titulo']);
  });

  it('responde 404 sin consultar la base ante un id que no es un entero positivo (M1, R1)', async () => {
    // Los cuatro casos que nombra la spec, más los dos que sólo se distinguen después de parsear:
    // un desbordamiento de dígitos —que `Number.isSafeInteger` rechaza— y el decimal.
    const invalidos = ['abc', '-1', '0', '9e99', '99999999999999999999', '1.0', '', ' 1'];

    // La base se cierra: cualquier consulta explotaría con otro error y no con el 404.
    db?.close();
    db = undefined;

    for (const invalido of invalidos) {
      await expect(renderizarDetalle(invalido), invalido).rejects.toThrow(RESPUESTA_404);
    }

    expect(lecturasPorId).toEqual([]);
  });

  it('responde 404 ante un id inexistente', async () => {
    const id = sembrar(baseAbierta(), {
      titulo: 'Rayuela',
      identidad: 'rayuela',
      editorial: 'Sudamericana',
    });

    await expect(renderizarDetalle(String(id + 1))).rejects.toThrow(RESPUESTA_404);

    // Y la base sí se consultó: acá el 404 sale de que no hay libro, no de la validación previa.
    expect(lecturasPorId).toEqual([id + 1]);
  });

  it('responde 404 ante un libro archivado, indistinguible de uno inexistente', async () => {
    const archivado = sembrar(baseAbierta(), {
      titulo: 'Zama',
      identidad: 'zama',
      editorial: 'Sur',
      estado: 'archivado',
    });

    await expect(renderizarDetalle(String(archivado))).rejects.toThrow(RESPUESTA_404);

    // El libro está en la base: lo que produce el 404 es el filtro de estado (M5).
    expect(baseAbierta().prepare('SELECT estado FROM libros WHERE id = ?').get(archivado)).toEqual({
      estado: 'archivado',
    });
  });

  it('muestra la pantalla del catálogo sin migrar en vez del error genérico (AC-16)', async () => {
    baseQueColisiona = baseSembradaQueColisiona();

    const html = await renderizarDetalle('1');

    expect(html).toContain(MENSAJE_COLISION_DE_IDENTIDAD);
    expect(html).not.toContain(MENSAJE_ERROR_DE_PANTALLA);
  });

  it('propaga un fallo de infraestructura al límite de error en vez de disfrazarlo', async () => {
    // La otra mitad del cableado: distinguir la colisión no puede convertirse en tragar
    // cualquier fallo. Un disco ilegible sigue siendo del límite de error existente.
    conexionRota = true;

    await expect(renderizarDetalle('1')).rejects.toThrow(/SQLITE_CANTOPEN/u);
  });
});

describe('la fila del listado lleva al detalle (FR-01)', () => {
  beforeEach(() => {
    db = baseDePrueba();
    conexionRota = false;
    baseQueColisiona = undefined;
  });

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('cada fila enlaza al detalle de su propio libro', async () => {
    const rayuela = sembrar(baseAbierta(), {
      titulo: 'Rayuela',
      identidad: 'rayuela',
      editorial: 'Sudamericana',
    });
    const aleph = sembrar(baseAbierta(), { titulo: 'Aleph', identidad: 'aleph', editorial: 'Sur' });

    const html = await renderizarPagina();

    // En orden alfabético por `titulo_orden`, que es como los devuelve el catálogo.
    expect(enlacesAlDetalle(html)).toEqual([`/libros/${aleph}`, `/libros/${rayuela}`]);

    // Y el enlace lleva de verdad a ese libro: se entra por donde la usuaria entraría.
    expect(dato(await renderizarDetalle(String(aleph)), 'titulo')).toEqual(['Aleph']);
  });

  it('no gana JavaScript de cliente por tener el enlace (M11, R11)', () => {
    // El bench mide el armado del HTML en Node, así que no vería la regresión: 2.000 filas con
    // un control con estado propio son 2.000 componentes cliente y NFR-01 de FEAT-001a se cae
    // sin nada rojo. Por eso la guardia mira el fuente.
    const fuente = fs.readFileSync(
      path.join(process.cwd(), 'app/componentes/listado-libros.tsx'),
      'utf8',
    );

    // La directiva propia es **una** de las dos formas de arrastrar cliente…
    expect(fuente).not.toMatch(/^\s*['"]use client['"]/mu);

    // …y ésta es la otra, que es la que de verdad estaba a un carácter de distancia:
    // `next/link` declara `'use client'` en su propio fuente
    // (`node_modules/next/dist/client/app-dir/link.js`), así que un `<Link>` por fila son 2.000
    // componentes cliente con prefetch —la regresión literal de NFR-01— sin una sola directiva en
    // este archivo. La guardia anterior no la veía y el bench tampoco.
    //
    // Que la fila use un `<a>` pelado es legal para el linter porque
    // `@next/next/no-html-link-for-pages` sólo mira las rutas **estáticas** conocidas: `/` la
    // rechaza, `/libros/{id}` no. Ese permiso es el que esta línea convierte en decisión escrita.
    expect(fuente).not.toMatch(/from\s+['"]next\/link['"]/u);
  });

  it('tampoco lo gana por la cadena de módulos que usa, a cualquier profundidad (M11)', () => {
    // La cadena indirecta: un componente de celda propio que importe `next/link`, usado por fila,
    // reintroduce los 2.000 componentes cliente con la guardia de arriba verde, el linter limpio y
    // el bench ciego por diseño. Exige un archivo nuevo deliberado, así que no es el camino de un
    // descuido —pero los bloques 4 y 5 le agregan a la fila el control de venta (AC-17), que es
    // exactamente el momento en que alguien extrae un componente de celda.
    //
    // El recorrido es **transitivo** y no de un nivel. Mirar un nivel dejaba pasar la cadena
    // `listado → celda → enlaces/index.ts → enlace-ver.tsx`: dos saltos y un barrel, con la suite
    // entera en verde —nada más en ella mira `next/link`— y el prefetch de vuelta en 2.000 filas.
    // Es un `while` con lista de pendientes alrededor de la misma resolución de antes, así que no
    // cuesta más que eso; los ciclos los corta `vistos`.
    const relativoDelListado = path.join('app', 'componentes', 'listado-libros.tsx');

    /**
     * Un especificador del proyecto resuelto a archivo; los paquetes externos quedan afuera.
     *
     * Se prueban también `index.ts` e `index.tsx`, porque un barrel es la forma en que la cadena se
     * alarga sin que aparezca un archivo nuevo en el `import` —el import dice `./enlaces` y el
     * `next/link` vive dos archivos más abajo—.
     */
    function resolver(especificador: string, desde: string): string[] {
      const base = especificador.startsWith('@/')
        ? path.join(process.cwd(), especificador.slice(2))
        : especificador.startsWith('.')
          ? path.join(process.cwd(), path.dirname(desde), especificador)
          : '';

      if (base === '') {
        return [];
      }

      return ['.tsx', '.ts', path.join(path.sep, 'index.tsx'), path.join(path.sep, 'index.ts')]
        .map((sufijo) => `${base}${sufijo}`)
        .filter((archivo) => fs.existsSync(archivo) && fs.statSync(archivo).isFile())
        .map((archivo) => path.relative(process.cwd(), archivo));
    }

    function importadosDe(relativo: string): string[] {
      const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');

      return Array.from(fuente.matchAll(/from\s+['"]([^'"]+)['"]/gu), (c) => c[1]).flatMap(
        (especificador) => resolver(especificador, relativo),
      );
    }

    const vistos = new Set<string>();
    const pendientes = [relativoDelListado];

    while (pendientes.length > 0) {
      const actual = pendientes.pop() as string;

      if (!vistos.has(actual)) {
        vistos.add(actual);
        pendientes.push(...importadosDe(actual));
      }
    }

    const alcanzados = [...vistos];

    // Meta-guardia de la resolución: con la lista vacía este test no mira nada, y con un recorrido
    // de un solo nivel sólo llegaría a `app/mensajes.ts` y al tipo `Libro`. Los otros dos están a
    // dos y a tres saltos (`mensajes → lib/db/errores → lib/dominio/parsear-precio`), así que
    // exigirlos es lo que hace falsable que el recorrido sea transitivo de verdad.
    expect(alcanzados).toContain(path.join('app', 'mensajes.ts'));
    expect(alcanzados).toContain(path.join('lib', 'db', 'errores.ts'));
    expect(alcanzados).toContain(path.join('lib', 'dominio', 'parsear-precio.ts'));

    for (const alcanzado of alcanzados) {
      const dependencia = fs.readFileSync(path.join(process.cwd(), alcanzado), 'utf8');

      expect(dependencia, alcanzado).not.toMatch(/from\s+['"]next\/link['"]/u);
      expect(dependencia, alcanzado).not.toMatch(/^\s*['"]use client['"]/mu);
    }
  });
});

describe('app/not-found.tsx', () => {
  it('dice que el libro no está y no filtra ningún dato del catálogo (M8)', () => {
    const html = renderToStaticMarkup(createElement(NoEncontrado));

    expect(html).toContain(MENSAJE_LIBRO_INEXISTENTE);
    expect(MENSAJE_LIBRO_INEXISTENTE).toMatch(/\S/u);
    // Un 404 no distingue "no existe" de "no es un id" de "está archivado", así que tampoco
    // puede decir nada de la base: ni cuántos libros hay, ni texto del motor.
    expect(html).not.toMatch(/SQLITE_/u);
    expect(html).not.toMatch(/\.db\b/u);
  });
});

describe('el precio se formatea en un solo lugar', () => {
  /** Las celdas de un campo del listado, con el mismo anclaje que usan sus tests. */
  function celdas(html: string, campo: string): string[] {
    const patron = new RegExp(`<td[^>]*data-campo="${campo}"[^>]*>([^<]*)</td>`, 'gu');

    return Array.from(html.matchAll(patron), (coincidencia) => coincidencia[1]);
  }

  it('el listado y el detalle muestran el mismo texto para el mismo precio', () => {
    // Dos pantallas que formatean el precio por su cuenta divergen sin que nada se ponga rojo:
    // los tests de cada una fijan su propio literal y los dos siguen verdes con `$ 9.500` acá y
    // `$9500` allá. Ésta es la aserción que ata las dos.
    const listado = renderToStaticMarkup(createElement(ListadoLibros, { libros: [LIBRO] }));
    const detalle = renderToStaticMarkup(createElement(DetalleLibro, { libro: LIBRO }));

    expect(celdas(listado, 'precio')).toEqual(dato(detalle, 'precio'));
    // Y dice algo: dos vacíos también serían iguales.
    expect(celdas(listado, 'precio')).toEqual(['$ 9.500']);
  });

  it('ninguna pantalla construye su propio formateador de precio', () => {
    // La aserción de comportamiento de arriba compara **una** salida; ésta cierra la puerta por
    // la que volvería la divergencia. Es la misma razón por la que existe el módulo de derivación
    // del Block 1, un piso más arriba: dos copias de una regla de presentación son dos reglas.
    for (const relativo of [
      path.join('app', 'componentes', 'listado-libros.tsx'),
      path.join('app', 'componentes', 'detalle-libro.tsx'),
    ]) {
      const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');

      expect(fuente, relativo).not.toContain('new Intl.NumberFormat');
      expect(fuente, relativo).toContain('formatearPrecio');
    }
  });
});

describe('app/componentes/detalle-libro.tsx', () => {
  it('escapa el título y la editorial en vez de interpretarlos como HTML', () => {
    const html = renderToStaticMarkup(
      createElement(DetalleLibro, {
        libro: { ...LIBRO, titulo: '<script>alert(1)</script>', editorial: '<img onerror="x">' },
      }),
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img onerror=');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('cableado de la pantalla del catálogo sin migrar (AC-16)', () => {
  afterEach(() => {
    db?.close();
    db = undefined;
    baseQueColisiona?.close();
    baseQueColisiona = undefined;
    conexionRota = false;
  });

  it('la pantalla principal muestra el texto curado y no el genérico de error.tsx', async () => {
    // De punta a punta y por el camino real: base v1 sembrada → `obtenerDb()` migra → el
    // recálculo encuentra la colisión → la ruta lo distingue y renderiza su pantalla. Renderizar
    // el componente suelto no cubre esto: el componente existe desde el Block 2 y la usuaria
    // seguía viendo el mensaje genérico.
    baseQueColisiona = baseSembradaQueColisiona();

    const html = await renderizarPagina();

    expect(html).toContain(MENSAJE_COLISION_DE_IDENTIDAD);
    expect(html).not.toContain(MENSAJE_ERROR_DE_PANTALLA);
    // Y no llegó a mostrar catálogo ninguno: la colisión aborta la pantalla entera.
    expect(html).not.toContain('Principito');
  });

  it('un fallo de infraestructura sigue subiendo al límite de error', async () => {
    db = baseDePrueba();
    conexionRota = true;

    await expect(renderizarPagina()).rejects.toThrow(/SQLITE_CANTOPEN/u);
  });
});

describe('las guardias recursivas de app/ alcanzan la ruta nueva (M9, R12)', () => {
  /** El mismo recorrido recursivo que usan las guardias de `test/app/acciones.test.ts`. */
  function archivosDeApp(directorio = path.join(process.cwd(), 'app')): string[] {
    return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const completo = path.join(directorio, entrada.name);
      return entrada.isDirectory() ? archivosDeApp(completo) : [completo];
    });
  }

  const archivos = archivosDeApp().map((archivo) => path.relative(process.cwd(), archivo));

  /**
   * Los archivos de la ruta nueva, **derivados del recorrido** y no escritos a mano.
   *
   * Una lista en positivo dejaría fuera de la vigilancia al segundo archivo que alguien ponga
   * bajo `app/libros/` —el Block 4 tiene la confirmación de venta y el 5 el formulario—, que es
   * exactamente el modo de falla que este ticket ya corrigió dos veces.
   */
  const DIRECTORIO_DE_LA_RUTA = path.join('app', 'libros');

  const archivosDeLaRutaNueva = archivos.filter((archivo) =>
    archivo.startsWith(`${DIRECTORIO_DE_LA_RUTA}${path.sep}`),
  );

  /** Los de la ruta nueva más los dos archivos sueltos que estrena el bloque. */
  const NUEVOS = [
    ...archivosDeLaRutaNueva,
    path.join('app', 'not-found.tsx'),
    path.join('app', 'componentes', 'detalle-libro.tsx'),
  ];

  it('el recorrido recursivo llega hasta app/libros/[id]/', () => {
    // Cardinalidad contra el recorrido: si el filtro del directorio devolviera vacío, las
    // aserciones de abajo pasarían sin haber mirado la ruta nueva.
    expect(archivosDeLaRutaNueva.length).toBeGreaterThan(0);
    expect(archivos).toContain(path.join(DIRECTORIO_DE_LA_RUTA, '[id]', 'page.tsx'));

    // R12 es "las guardias no alcanzan la ruta nueva": el directorio del segmento dinámico está
    // un nivel más abajo que todo lo que había, y suponer que el recorrido llega es exactamente
    // lo que M9 pide no suponer.
    for (const nuevo of NUEVOS) {
      expect(archivos).toContain(nuevo);
    }
  });

  it('ninguno de los archivos nuevos abre la base ni inyecta HTML sin escapar', () => {
    // Las mismas afirmaciones que las guardias recursivas hacen sobre todo `app/`, escritas acá
    // sobre los archivos nuevos por su nombre: así el bloque queda cubierto aunque el recorrido
    // de la otra guardia cambie, y esta lista se pone roja si un archivo se renombra.
    for (const nuevo of NUEVOS) {
      const fuente = fs.readFileSync(path.join(process.cwd(), nuevo), 'utf8');

      expect(fuente, nuevo).not.toContain('better-sqlite3');
      expect(fuente, nuevo).not.toContain('lib/db/conexion');
      expect(fuente, nuevo).not.toContain('.prepare(');
      expect(fuente, nuevo).not.toContain('dangerouslySetInnerHTML');
      expect(fuente, nuevo).not.toMatch(/innerHTML/iu);
      expect(fuente, nuevo).not.toMatch(/javascript:/iu);
    }
  });
});

describe('ninguna pantalla puede tocar la base sin manejar el fallo del catálogo (AC-16, M9)', () => {
  /** El mismo recorrido recursivo de `app/`, otra vez derivado y no escrito a mano. */
  function archivosDeApp(directorio = path.join(process.cwd(), 'app')): string[] {
    return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const completo = path.join(directorio, entrada.name);
      return entrada.isDirectory() ? archivosDeApp(completo) : [completo];
    });
  }

  /** Todo módulo `.ts` bajo `lib/db/`, recursivo, relativo a la raíz. */
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
   * Los módulos de `lib/db/` que **abren la base**, derivados de su propio `server-only`.
   *
   * La condición correcta no es "importa `@/lib/db/consultas`", que era la de la ronda anterior y
   * dejaba fuera dos formas de leer la base verificadas: una ruta que lea por otro módulo del
   * repositorio —hoy `libros.ts`, en el Block 4 `ventas.ts`— y la misma `consultas.ts` importada
   * por ruta relativa, que nada en el proyecto prohíbe.
   *
   * **La colisión no la lanza `consultas.ts`: la lanza `migrar()` dentro de `obtenerDb()`.** Así
   * que la condición que se corresponde con el modo de falla es tocar la base, y quién la toca lo
   * dice `import 'server-only'` —la marca que sólo llevan los módulos que la abren—. `errores.ts`
   * y `tipos.ts` son las dos excepciones documentadas y quedan fuera solas, sin lista a mano: no
   * abren nada, y una pantalla que sólo importe el tipo `Libro` no puede recibir la colisión.
   *
   * La marca se comprueba como **el primer import del archivo**, que es la forma que ya usa
   * `test/db/migrar.test.ts`, y no con un `includes()`: el docstring de `errores.ts` **nombra la
   * directiva en prosa** —"no lleva `import 'server-only'` a propósito"— así que la búsqueda por
   * subcadena lo clasificaba como módulo que abre la base. Es el rojo que puso esta guardia
   * mientras se escribía.
   *
   * Se toma el **primer segmento** de la ruta relativa, así que `lib/db/migraciones` y
   * `lib/db/migraciones/001-inicial` se ven igual, escritos con `@/` o con ruta relativa.
   */
  const NOMBRES_QUE_ABREN_LA_BASE = Array.from(
    new Set(
      modulosDeDb()
        .filter(
          (relativo) =>
            fs
              .readFileSync(path.join(process.cwd(), relativo), 'utf8')
              .match(/^import .*$/mu)?.[0] === "import 'server-only';",
        )
        .map(
          (relativo) =>
            relativo
              .replace(/\\/gu, '/')
              .replace(/^lib\/db\//u, '')
              .split('/')[0],
        )
        .map((nombre) => nombre.replace(/\.ts$/u, '')),
    ),
  );

  const TOCA_LA_BASE = new RegExp(`lib/db/(?:${NOMBRES_QUE_ABREN_LA_BASE.join('|')})\\b`, 'u');

  /** Donde vive el manejo compartido. De acá sale el nombre que se le exige a las pantallas. */
  const MODULO_DEL_MANEJO = path.join('app', 'estado-del-catalogo.tsx');
  const NOMBRE_DEL_MANEJO = 'resolverFalloDelCatalogo';

  /**
   * El manejo, exigido **en posición de import** y no en el fuente entero.
   *
   * Con la búsqueda sobre el fuente, una ruta que no maneja nada y escribe
   * `// Pendiente: envolver esto con resolverFalloDelCatalogo cuando haya tiempo` pasaba verde.
   * Pedir la forma del import —llaves, el nombre adentro, y un `from` que apunte al módulo del
   * manejo— no se satisface con una mención en prosa. Cruza saltos de línea a propósito: Prettier
   * parte un import largo en varias líneas.
   *
   * Límite conocido y aceptado: un comentario que reproduzca **una sentencia de import completa**
   * la satisfaría. No se despejan comentarios acá porque el disfraz ya dejó de ser un descuido y
   * pasó a ser deliberado.
   */
  const IMPORTA_EL_MANEJO = new RegExp(
    `import\\s*\\{[^}]*\\b${NOMBRE_DEL_MANEJO}\\b[^}]*\\}\\s*from\\s*['"][^'"]*estado-del-catalogo['"]`,
    'u',
  );

  /**
   * Las pantallas vigiladas: los módulos con JSX de `app/` que tocan la base, menos el que
   * **define** el manejo.
   *
   * Se filtra por `.tsx` porque lo que se exige es renderizar una pantalla, y eso un módulo de
   * Server Actions no puede hacerlo: `app/acciones.ts` toca la base y devuelve un resultado
   * serializable, así que su camino ante un fallo es el mensaje genérico que ya tiene. Es la misma
   * razón por la que el threat model dice que desde un Server Action `error.tsx` ni se alcanza.
   */
  const pantallas = archivosDeApp()
    .filter((archivo) => /\.tsx$/u.test(archivo))
    .map((archivo) => path.relative(process.cwd(), archivo))
    .filter((relativo) => relativo !== MODULO_DEL_MANEJO)
    .filter((relativo) =>
      TOCA_LA_BASE.test(
        fs.readFileSync(path.join(process.cwd(), relativo), 'utf8').replace(/\\/gu, '/'),
      ),
    );

  it('deriva de server-only qué módulos de lib/db abren la base', () => {
    // Meta-guardia de la condición: con la lista vacía el patrón no matchearía nada y ninguna
    // pantalla quedaría vigilada. Los dos que importan hoy están, y las dos excepciones
    // documentadas de `lib/db/` quedan fuera **por su propio fuente**, no por una lista.
    expect(NOMBRES_QUE_ABREN_LA_BASE).toContain('consultas');
    expect(NOMBRES_QUE_ABREN_LA_BASE).toContain('libros');
    expect(NOMBRES_QUE_ABREN_LA_BASE).not.toContain('errores');
    expect(NOMBRES_QUE_ABREN_LA_BASE).not.toContain('tipos');

    // Y el patrón ve las dos formas de escribir el import, que es el agujero que cerró: nada en
    // el proyecto obliga la forma `@/`.
    expect(TOCA_LA_BASE.test("from '@/lib/db/consultas'")).toBe(true);
    expect(TOCA_LA_BASE.test("from '../../lib/db/consultas'")).toBe(true);
    expect(TOCA_LA_BASE.test("from '@/lib/db/libros'")).toBe(true);
    expect(TOCA_LA_BASE.test("from '@/lib/db/tipos'")).toBe(false);
    expect(TOCA_LA_BASE.test("from '@/lib/db/errores'")).toBe(false);
  });

  it('el módulo del manejo define el nombre que la guardia exige', () => {
    // Sin esto, renombrar el helper dejaría a `IMPORTA_EL_MANEJO` buscando un nombre que ya no
    // existe: la guardia se pondría roja en todas las pantallas con un mensaje que no explica por
    // qué. Acá el rojo dice la verdad —el nombre se movió— y en un solo lugar.
    const fuente = fs.readFileSync(path.join(process.cwd(), MODULO_DEL_MANEJO), 'utf8');

    expect(fuente).toContain(`export function ${NOMBRE_DEL_MANEJO}(`);
  });

  it('encuentra las pantallas de app/ que tocan la base', () => {
    // Meta-guardia del filtro: con la lista vacía, la guardia de abajo no miraría ningún archivo
    // y una pantalla sin manejo pasaría en silencio. Son dos hoy; los bloques 4 y 5 estrenan
    // superficies que leen la base y entran solas, incluso si lo hacen por `ventas.ts`.
    expect(pantallas).toContain(path.join('app', 'page.tsx'));
    expect(pantallas).toContain(path.join('app', 'libros', '[id]', 'page.tsx'));
  });

  it('toda pantalla que toca la base importa el manejo compartido', () => {
    // El agujero que esto cierra: ante la colisión, una pantalla sin el manejo deja subir el error
    // al límite de error, que muestra la constante genérica —"no se pudo mostrar el catálogo"— en
    // vez del texto curado de AC-16. Es exactamente el bug que este bloque vino a cerrar,
    // reapareciendo **en silencio** en la primera superficie nueva que toque la base.
    for (const pantalla of pantallas) {
      const fuente = fs.readFileSync(path.join(process.cwd(), pantalla), 'utf8');

      expect(fuente, `${pantalla} toca la base y no importa ${NOMBRE_DEL_MANEJO}`).toMatch(
        IMPORTA_EL_MANEJO,
      );
    }
  });
});
