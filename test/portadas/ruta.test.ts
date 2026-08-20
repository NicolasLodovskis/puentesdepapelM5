import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { rutaDeArchivo, rutaDirectorioPortadas } from '@/lib/portadas/ruta';

/**
 * Espejo reducido de `test/db/ruta.test.ts`: sólo los dos casos que le dan a
 * `rutaDirectorioPortadas()` su propia cobertura de integración sobre
 * `resolverRutaConfinada()` (`test/rutas-confinadas.test.ts` ya cubre el resto de la lógica de
 * confinamiento de forma parametrizada) — y el aislamiento de entorno de test (Regla #0)
 * explícito para portadas.
 */

const ORIGINAL = process.env.PUENTES_PORTADAS_PATH;
const RUTA_DE_PRODUCCION = path.join(process.cwd(), 'data', 'portadas');

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.PUENTES_PORTADAS_PATH;
  } else {
    process.env.PUENTES_PORTADAS_PATH = ORIGINAL;
  }
});

describe('rutaDirectorioPortadas()', () => {
  it('sin PUENTES_PORTADAS_PATH devuelve data/portadas bajo la raíz del proyecto', () => {
    delete process.env.PUENTES_PORTADAS_PATH;

    expect(rutaDirectorioPortadas()).toBe(RUTA_DE_PRODUCCION);
  });

  it('con la variable fijada fuera de la raíz del proyecto, lanza', () => {
    process.env.PUENTES_PORTADAS_PATH = '/etc/portadas';

    expect(() => rutaDirectorioPortadas()).toThrow(/fuera de la raíz del proyecto/i);
  });
});

describe('rutaDeArchivo()', () => {
  it('devuelve el directorio de portadas más el id, con extensión .jpg', () => {
    expect(rutaDeArchivo(42)).toBe(path.join(rutaDirectorioPortadas(), '42.jpg'));
  });
});

describe('aislamiento del entorno de test (Regla #0)', () => {
  it('la suite nunca resuelve al directorio de producción por defecto', () => {
    expect(process.env.PUENTES_PORTADAS_PATH).toBeDefined();
    expect(rutaDirectorioPortadas()).not.toBe(RUTA_DE_PRODUCCION);
    expect(rutaDirectorioPortadas()).toContain(`${path.sep}.tmp-tests${path.sep}`);
  });
});
