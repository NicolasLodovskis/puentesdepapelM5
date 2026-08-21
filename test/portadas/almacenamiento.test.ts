import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  guardarPortada,
  guardarPortadaProcesada,
  leerPortada,
  procesarPortada,
  quitarPortada,
  tienePortada,
} from '@/lib/portadas/almacenamiento';
import { rutaDeArchivo } from '@/lib/portadas/ruta';

/**
 * `sharp` se envuelve con `vi.fn()` alrededor de su implementación real: todas las
 * llamadas siguen decodificando/redimensionando de verdad (los tests de contenido lo
 * necesitan), pero además quedan registradas para el único test que afirma que **no** se
 * invocó (mitigación M18: el límite de tamaño se aplica antes de tocar `sharp`). Vitest
 * hoista este `vi.mock()` por encima de los imports de arriba, así que el orden en el fuente
 * no importa: `sharp` ya llega envuelto la primera vez que algo lo importa.
 */
vi.mock('sharp', async (importarOriginal) => {
  const original = await importarOriginal<{ default: (...argumentos: unknown[]) => unknown }>();

  return { default: vi.fn(original.default) };
});

/** Un id numérico distinto por test, para no pisarse escribiendo sobre el mismo archivo real. */
let proximoId = 900001;
function idDePrueba(): number {
  proximoId += 1;
  return proximoId;
}

async function imagenValida(ancho = 800, alto = 600): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

async function imagenConExif(): Promise<Buffer> {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 0, b: 0 } },
  })
    .jpeg()
    .withMetadata({
      exif: {
        IFD0: { Copyright: 'Puentes de Papel' },
        // IFD3 es la convención de libvips/EXIF para el GPS IFD (R18: geolocalización).
        IFD3: { GPSLatitude: '40/1,0/1,0/1', GPSLongitude: '3/1,0/1,0/1' },
      },
    })
    .toBuffer();
}

beforeEach(() => {
  vi.mocked(sharp).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  // `vi.restoreAllMocks()` no toca el mock de `sharp` (no es un spy, es un módulo
  // reemplazado), pero por las dudas se reafirma la implementación real acá.
});

describe('procesarPortada()', () => {
  it('con un JPEG válido devuelve { ok: true } con un buffer de ≤ 96 px de lado mayor', async () => {
    const original = await imagenValida(800, 600);

    const resultado = await procesarPortada(original);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const metadatos = await sharp(resultado.valor).metadata();
    expect(Math.max(metadatos.width ?? 0, metadatos.height ?? 0)).toBeLessThanOrEqual(96);
  });

  it('con bytes que no son una imagen decodificable devuelve formato_no_admitido y nunca lanza', async () => {
    const basura = Buffer.from('esto definitivamente no es una imagen', 'utf8');

    const resultado = await procesarPortada(basura);

    expect(resultado).toEqual({
      ok: false,
      error: { campo: 'foto', detalle: 'formato_no_admitido' },
    });
  });

  it('con un archivo de más de 10 MB devuelve demasiado_grande sin invocar sharp', async () => {
    const demasiadoGrande = Buffer.alloc(10 * 1024 * 1024 + 1);
    vi.mocked(sharp).mockClear();

    const resultado = await procesarPortada(demasiadoGrande);

    expect(resultado).toEqual({ ok: false, error: { campo: 'foto', detalle: 'demasiado_grande' } });
    expect(sharp).not.toHaveBeenCalled();
  });

  it('sobre una imagen con EXIF (GPS incluido) produce un buffer sin esos metadatos (M17)', async () => {
    const conExif = await imagenConExif();
    const metadatosOriginal = await sharp(conExif).metadata();
    expect(metadatosOriginal.exif).toBeDefined();

    const resultado = await procesarPortada(conExif);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const metadatosDeSalida = await sharp(resultado.valor).metadata();
    expect(metadatosDeSalida.exif).toBeUndefined();
  });
});

describe('guardarPortadaProcesada()', () => {
  it('reemplaza el archivo cuando se llama dos veces seguidas para el mismo id', () => {
    const id = idDePrueba();

    guardarPortadaProcesada(id, Buffer.from('contenido-uno'));
    guardarPortadaProcesada(id, Buffer.from('contenido-dos'));

    expect(fs.readFileSync(rutaDeArchivo(id))).toEqual(Buffer.from('contenido-dos'));
  });

  it('usa un nombre de archivo temporal distinto en cada llamada (mitigación M15)', () => {
    const id = idDePrueba();
    const nombresTemporales: string[] = [];
    const espia = vi.spyOn(fs, 'renameSync').mockImplementation((origen, destino) => {
      nombresTemporales.push(String(origen));
      fs.writeFileSync(destino, fs.readFileSync(origen));
      fs.rmSync(origen, { force: true });
    });

    guardarPortadaProcesada(id, Buffer.from('a'));
    guardarPortadaProcesada(id, Buffer.from('b'));

    espia.mockRestore();

    expect(nombresTemporales).toHaveLength(2);
    expect(nombresTemporales[0]).not.toBe(nombresTemporales[1]);
  });

  it('propaga sin capturar un fallo de infraestructura al escribir (fs.renameSync mockeado)', () => {
    const id = idDePrueba();
    const espia = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    expect(() => guardarPortadaProcesada(id, Buffer.from('x'))).toThrow(/ENOSPC/);

    espia.mockRestore();
  });
});

describe('guardarPortada()', () => {
  it('con una foto válida escribe el archivo procesado y devuelve { ok: true }', async () => {
    const id = idDePrueba();
    const original = await imagenValida();

    const resultado = await guardarPortada(id, original);

    expect(resultado.ok).toBe(true);
    expect(tienePortada(id)).toBe(true);
  });

  it('con una foto inválida no escribe nada y devuelve el error', async () => {
    const id = idDePrueba();

    const resultado = await guardarPortada(id, Buffer.from('no es una imagen'));

    expect(resultado).toEqual({
      ok: false,
      error: { campo: 'foto', detalle: 'formato_no_admitido' },
    });
    expect(tienePortada(id)).toBe(false);
  });
});

describe('quitarPortada()', () => {
  it('sobre un id sin portada no lanza (ENOENT ignorado)', () => {
    const id = idDePrueba();

    expect(() => quitarPortada(id)).not.toThrow();
  });

  it('propaga sin capturar un fallo de infraestructura que no sea ENOENT (fs.rmSync mockeado)', () => {
    const id = idDePrueba();
    const error = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const espia = vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw error;
    });

    expect(() => quitarPortada(id)).toThrow(/EACCES/);

    espia.mockRestore();
  });
});

describe('tienePortada()', () => {
  it('es false antes de guardar, true después, y vuelve a false después de quitarPortada()', () => {
    const id = idDePrueba();

    expect(tienePortada(id)).toBe(false);

    guardarPortadaProcesada(id, Buffer.from('contenido'));
    expect(tienePortada(id)).toBe(true);

    quitarPortada(id);
    expect(tienePortada(id)).toBe(false);
  });
});

describe('leerPortada()', () => {
  it('sobre un id sin portada devuelve undefined, nunca lanza', () => {
    const id = idDePrueba();

    expect(() => leerPortada(id)).not.toThrow();
    expect(leerPortada(id)).toBeUndefined();
  });

  it('ante un fallo de lectura que no sea "no existe" también devuelve undefined, nunca lanza', () => {
    const id = idDePrueba();
    guardarPortadaProcesada(id, Buffer.from('contenido'));

    const error = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const espia = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw error;
    });

    expect(() => leerPortada(id)).not.toThrow();
    expect(leerPortada(id)).toBeUndefined();

    espia.mockRestore();
  });
});

/**
 * Guardias de convención (F-04 por construcción, y el mismo criterio de `test/db/libros.test.ts`
 * y `test/db/consultas.test.ts` para `import 'server-only'`): se recorre `lib/portadas/` de
 * verdad, sin enumerar sus archivos a mano, para que uno nuevo no pueda nacer sin las dos
 * garantías.
 */
describe('convenciones de lib/portadas/', () => {
  function archivosTs(directorio: string): string[] {
    return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const completo = path.join(directorio, entrada.name);

      if (entrada.isDirectory()) {
        return archivosTs(completo);
      }

      return entrada.name.endsWith('.ts') ? [completo] : [];
    });
  }

  const ARCHIVOS = archivosTs(path.join(process.cwd(), 'lib', 'portadas')).map((absoluto) =>
    path.relative(process.cwd(), absoluto),
  );

  it('encuentra al menos los dos módulos de Block 1', () => {
    // Meta-guardia del recorrido: con la lista vacía, las dos exigencias de abajo pasarían
    // sin haber mirado ningún archivo.
    expect(ARCHIVOS).toContain(path.join('lib', 'portadas', 'ruta.ts'));
    expect(ARCHIVOS).toContain(path.join('lib', 'portadas', 'almacenamiento.ts'));
  });

  it.each(ARCHIVOS)(
    '%s no importa better-sqlite3 ni ningún módulo de lib/db/ (FR-04)',
    (relativo) => {
      const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');

      expect(fuente, relativo).not.toContain('better-sqlite3');
      expect(fuente, relativo).not.toMatch(/from\s+['"][^'"]*lib\/db[^'"]*['"]/u);
      expect(fuente, relativo).not.toMatch(/from\s+['"]\.\.?\/(?:\.\.\/)*db\//u);
    },
  );

  it.each(ARCHIVOS)("%s marca 'server-only' antes que ningún otro import", (relativo) => {
    const fuente = fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');

    expect(fuente.match(/^import .*$/mu)?.[0], relativo).toBe("import 'server-only';");
  });
});
