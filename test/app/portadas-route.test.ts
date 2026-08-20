import fs from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { altaDeLibro } from '@/app/acciones';
import { ListadoLibros } from '@/app/componentes/listado-libros';
import { GET } from '@/app/portadas/[id]/route';
import { buscarLibros } from '@/lib/db/consultas';
import type { Libro } from '@/lib/db/tipos';
import { guardarPortadaProcesada, resolverRutaMostrable } from '@/lib/portadas/almacenamiento';
import { rutaDeArchivo } from '@/lib/portadas/ruta';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';

/**
 * Tests de comportamiento funcional del Route Handler (Block 4: FR-05, FR-06, FR-07, NFR-01).
 *
 * **No es un test de rendimiento.** El presupuesto de NFR-01 lo mide
 * `test/rendimiento/portadas-route.bench.test.ts`; acá se afirma el contrato: qué bytes, qué
 * cabeceras y qué invariante sostiene M20.
 */

/** Un id numérico distinto por test, en un rango que no se pisa con `test/portadas/almacenamiento.test.ts`
 * (900001+) ni con los libros que la propia base de prueba asigna (1, 2, 3…). */
let proximoId = 700001;
function idDePrueba(): number {
  proximoId += 1;
  return proximoId;
}

async function imagenComoBuffer(ancho = 40, alto = 30): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 5, g: 6, b: 7 } },
  })
    .jpeg()
    .toBuffer();
}

function pedido(id: string): Request {
  return new Request(`http://localhost/portadas/${id}`);
}

function contexto(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** El mismo asset que sirve `respuestaDelLogo()` dentro del Route Handler. */
const RUTA_LOGO = path.join(process.cwd(), 'public', 'logo-puentes-de-papel-96.jpg');

/**
 * Espía de `leerPortada()` y de `rutaDeArchivo()`: delega en la implementación real —todos los
 * tests de contenido la necesitan de verdad— y además registra cada argumento recibido, para el
 * único test que afirma la invariante de M20 (nunca reciben nada que no sea el `number` que
 * devuelve `identificadorDeLibro()`).
 */
const leerPortadaEspiada = vi.hoisted(() => vi.fn());
const rutaDeArchivoEspiada = vi.hoisted(() => vi.fn());

vi.mock('@/lib/portadas/almacenamiento', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/portadas/almacenamiento')>();

  leerPortadaEspiada.mockImplementation(original.leerPortada);

  return { ...original, leerPortada: leerPortadaEspiada };
});

vi.mock('@/lib/portadas/ruta', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/portadas/ruta')>();

  rutaDeArchivoEspiada.mockImplementation(original.rutaDeArchivo);

  return { ...original, rutaDeArchivo: rutaDeArchivoEspiada };
});

/** La base `:memory:` del único test de integración de este archivo. */
let db: Database.Database | undefined;

vi.mock('@/lib/db/conexion', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@/lib/db/conexion')>();

  return {
    ...original,
    obtenerDb: (): Database.Database => {
      if (db === undefined) {
        throw new Error('El test no abrió su base de prueba.');
      }

      return db;
    },
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

afterEach(() => {
  leerPortadaEspiada.mockClear();
  rutaDeArchivoEspiada.mockClear();
});

describe('GET /portadas/[id] (Block 4: FR-05, FR-06, FR-07, NFR-01)', () => {
  it('con un id con portada devuelve exactamente esos bytes, con Content-Type: image/jpeg (AC-02)', async () => {
    const id = idDePrueba();
    const bytesOriginales = await imagenComoBuffer();
    guardarPortadaProcesada(id, bytesOriginales);

    const respuesta = await GET(pedido(String(id)), contexto(String(id)));
    const bytesServidos = Buffer.from(await respuesta.arrayBuffer());

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('Content-Type')).toBe('image/jpeg');
    expect(bytesServidos).toEqual(bytesOriginales);
  });

  it('con un id sin portada devuelve los bytes del logo optimizado (AC-03)', async () => {
    const id = idDePrueba();
    const logoEsperado = fs.readFileSync(RUTA_LOGO);

    const respuesta = await GET(pedido(String(id)), contexto(String(id)));
    const bytesServidos = Buffer.from(await respuesta.arrayBuffer());

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('Content-Type')).toBe('image/jpeg');
    expect(bytesServidos).toEqual(logoEsperado);
  });

  it('cuando leerPortada(id) falla al leer (no por ausencia) devuelve el logo igual (AC-04)', async () => {
    const id = idDePrueba();
    guardarPortadaProcesada(id, await imagenComoBuffer());
    const rutaReal = rutaDeArchivo(id);
    const logoEsperado = fs.readFileSync(RUTA_LOGO);

    const lecturaReal = fs.readFileSync;
    const error = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const espia = vi
      .spyOn(fs, 'readFileSync')
      .mockImplementation((ruta: fs.PathOrFileDescriptor, ...resto: unknown[]) => {
        if (ruta === rutaReal) {
          throw error;
        }

        // @ts-expect-error -- delega en la implementación real para cualquier otra ruta
        // (incluida la del logo), preservando su firma sobrecargada.
        return lecturaReal(ruta, ...resto);
      });

    const respuesta = await GET(pedido(String(id)), contexto(String(id)));
    const bytesServidos = Buffer.from(await respuesta.arrayBuffer());

    espia.mockRestore();

    expect(respuesta.status).toBe(200);
    expect(bytesServidos).toEqual(logoEsperado);
  });

  it('cuando fs.statSync() sobre el archivo del libro lanza (borrado o reemplazado justo después de leerPortada()) devuelve el logo igual, nunca un 500 (AC-04, mismo criterio que un fallo de lectura)', async () => {
    const id = idDePrueba();
    guardarPortadaProcesada(id, await imagenComoBuffer());
    const rutaReal = rutaDeArchivo(id);
    const logoEsperado = fs.readFileSync(RUTA_LOGO);

    const statSincronicoReal = fs.statSync;
    const error = Object.assign(new Error('ENOENT: no such file or directory'), {
      code: 'ENOENT',
    });
    const espia = vi
      .spyOn(fs, 'statSync')
      .mockImplementation((ruta: fs.PathLike, ...resto: unknown[]) => {
        if (ruta === rutaReal) {
          throw error;
        }

        // @ts-expect-error -- delega en la implementación real para cualquier otra ruta
        // (incluida la del logo), preservando su firma sobrecargada.
        return statSincronicoReal(ruta, ...resto);
      });

    const respuesta = await GET(pedido(String(id)), contexto(String(id)));
    const bytesServidos = Buffer.from(await respuesta.arrayBuffer());

    espia.mockRestore();

    expect(respuesta.status).toBe(200);
    expect(bytesServidos).toEqual(logoEsperado);
  });

  it.each(['abc', '-1', '9e99'])(
    'con id = %s (no numérico o fuera de rango) devuelve el logo, nunca un error',
    async (idInvalido) => {
      const logoEsperado = fs.readFileSync(RUTA_LOGO);

      const respuesta = await GET(pedido(idInvalido), contexto(idInvalido));
      const bytesServidos = Buffer.from(await respuesta.arrayBuffer());

      expect(respuesta.status).toBe(200);
      expect(bytesServidos).toEqual(logoEsperado);
    },
  );

  it('lleva X-Content-Type-Options: nosniff, con y sin portada (mitigación M21)', async () => {
    const idConFoto = idDePrueba();
    guardarPortadaProcesada(idConFoto, await imagenComoBuffer());
    const idSinFoto = idDePrueba();

    const conFoto = await GET(pedido(String(idConFoto)), contexto(String(idConFoto)));
    const sinFoto = await GET(pedido(String(idSinFoto)), contexto(String(idSinFoto)));

    expect(conFoto.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(sinFoto.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('Last-Modified y ETag cambian después de reemplazar la portada de un libro', async () => {
    const id = idDePrueba();

    guardarPortadaProcesada(id, Buffer.from('x'.repeat(50)));
    // Se fija un mtime lejano y determinista para el primer contenido: así la comparación no
    // depende de la resolución del reloj del filesystem entre dos escrituras seguidas.
    const fechaVieja = new Date(2000, 0, 1);
    fs.utimesSync(rutaDeArchivo(id), fechaVieja, fechaVieja);

    const primera = await GET(pedido(String(id)), contexto(String(id)));
    const etagPrevio = primera.headers.get('ETag');
    const lastModifiedPrevio = primera.headers.get('Last-Modified');

    guardarPortadaProcesada(id, Buffer.from('y'.repeat(80)));

    const segunda = await GET(pedido(String(id)), contexto(String(id)));
    const etagNuevo = segunda.headers.get('ETag');
    const lastModifiedNuevo = segunda.headers.get('Last-Modified');

    expect(etagPrevio).not.toBeNull();
    expect(etagNuevo).not.toBeNull();
    expect(etagNuevo).not.toBe(etagPrevio);
    expect(lastModifiedNuevo).not.toBe(lastModifiedPrevio);
  });

  describe('mitigación M20 — el archivo servido nace siempre de identificadorDeLibro(), nunca de otro dato de la request', () => {
    it('leerPortada() y rutaDeArchivo() sólo se llaman con un number, en casos válidos e inválidos', async () => {
      const idConFoto = idDePrueba();
      guardarPortadaProcesada(idConFoto, await imagenComoBuffer());
      const idSinFoto = idDePrueba();

      leerPortadaEspiada.mockClear();
      rutaDeArchivoEspiada.mockClear();

      for (const id of [
        String(idConFoto),
        String(idSinFoto),
        'abc',
        '-1',
        '9e99',
        '1;DROP TABLE libros',
        '../../etc/passwd',
      ]) {
        await GET(pedido(id), contexto(id));
      }

      const llamadas = [...leerPortadaEspiada.mock.calls, ...rutaDeArchivoEspiada.mock.calls];

      // Meta-guardia: si nada quedara registrado, las aserciones de abajo pasarían sin haber
      // mirado ninguna llamada real.
      expect(llamadas.length).toBeGreaterThan(0);

      for (const llamada of llamadas) {
        expect(llamada).toHaveLength(1);
        expect(typeof llamada[0]).toBe('number');
      }

      // Y nunca se llamó con el texto crudo de la URL ni con ningún payload de la request.
      expect(leerPortadaEspiada).not.toHaveBeenCalledWith('abc');
      expect(leerPortadaEspiada).not.toHaveBeenCalledWith('1;DROP TABLE libros');
      expect(leerPortadaEspiada).not.toHaveBeenCalledWith('../../etc/passwd');
      expect(rutaDeArchivoEspiada).not.toHaveBeenCalledWith('abc');
      expect(rutaDeArchivoEspiada).not.toHaveBeenCalledWith('../../etc/passwd');
    });
  });
});

describe('integración: alta con foto → buscarLibros() → GET /portadas/[id] (AC-01 de punta a punta)', () => {
  beforeEach(() => {
    db = baseDePrueba();
  });

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  function formulario(campos: Record<string, string | File>): FormData {
    const datos = new FormData();

    for (const [campo, valor] of Object.entries(campos)) {
      datos.set(campo, valor);
    }

    return datos;
  }

  function archivo(bytes: Buffer, nombre = 'portada.jpg', tipo = 'image/jpeg'): File {
    return new File([new Uint8Array(bytes)], nombre, { type: tipo });
  }

  it('el libro dado de alta con foto aparece con /portadas/{id} y ese id sirve bytes reales', async () => {
    const bytesOriginales = await imagenComoBuffer(120, 90);

    const resultado = await altaDeLibro(
      null,
      formulario({
        titulo: 'Rayuela',
        editorial: 'Sudamericana',
        stock: '2',
        precio: '5000',
        foto: archivo(bytesOriginales),
      }),
    );

    expect(resultado.ok).toBe(true);

    const libros: Libro[] = buscarLibros(null, db);
    const libro = libros.find((candidato) => candidato.titulo === 'Rayuela');
    expect(libro).toBeDefined();
    if (libro === undefined) return;

    expect(resolverRutaMostrable(libro.id)).toBe(`/portadas/${String(libro.id)}`);

    const respuesta = await GET(pedido(String(libro.id)), contexto(String(libro.id)));
    const bytesServidos = Buffer.from(await respuesta.arrayBuffer());
    const bytesEnDisco = fs.readFileSync(rutaDeArchivo(libro.id));

    expect(bytesServidos).toEqual(bytesEnDisco);
    expect(respuesta.headers.get('Content-Type')).toBe('image/jpeg');
  });
});

describe('ListadoLibros — columna Portada (Block 4: FR-05)', () => {
  const LIBRO: Libro = {
    id: 42,
    titulo: 'Ficciones',
    tituloNormalizado: 'ficciones',
    tituloOrden: 'ficciones',
    editorial: 'Emecé',
    editorialNormalizada: 'emece',
    stock: 5,
    precio: 3000,
    estado: 'activo',
    creadoEn: '2026-01-01T00:00:00.000Z',
  };

  function celdaDePortada(html: string): string {
    const patron = /<td[^>]*data-campo="portada"[^>]*>([\s\S]*?)<\/td>/u;
    const encontrado = patron.exec(html);

    if (encontrado === null) {
      throw new Error('No se encontró ninguna celda con data-campo="portada".');
    }

    return encontrado[1];
  }

  it('renderiza data-campo="portada" con el src de fila.rutaPortada, nunca con datos derivados del título/editorial', () => {
    const filaConFoto = { ...LIBRO, rutaPortada: `/portadas/${String(LIBRO.id)}` };
    const filaSinFoto = {
      ...LIBRO,
      id: 43,
      titulo: '<script>alert(1)</script>',
      rutaPortada: '/logo-puentes-de-papel-96.jpg',
    };

    const html = renderToStaticMarkup(
      createElement(ListadoLibros, { libros: [filaConFoto, filaSinFoto] }),
    );

    const celdas = Array.from(html.matchAll(/<td[^>]*data-campo="portada"[^>]*>[\s\S]*?<\/td>/gu));
    expect(celdas).toHaveLength(2);

    expect(celdaDePortada(celdas[0][0])).toContain(`src="${filaConFoto.rutaPortada}"`);
    expect(celdaDePortada(celdas[1][0])).toContain(`src="${filaSinFoto.rutaPortada}"`);

    // El src nunca se arma con el título: ni escapado, ni sin escapar.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toMatch(/src="[^"]*alert/u);
  });
});
