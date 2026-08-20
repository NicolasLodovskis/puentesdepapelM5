import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolverRutaConfinada } from '@/lib/rutas-confinadas';

/**
 * `resolverRutaConfinada()` es la lógica de confinamiento a la raíz del proyecto (mitigación 5 de
 * FEAT-001a / M12 de FEAT-001c), extraída de `lib/db/ruta.ts` para que `lib/portadas/ruta.ts` la
 * reuse sin reimplementarla. Replica, de forma parametrizada, los casos que ya vivían sólo en
 * `test/db/ruta.test.ts`.
 *
 * No lee `process.env`: recibe el valor ya leído por quien llama (`string | undefined`) y la
 * ruta relativa por defecto, y sólo calcula un `path` contra `process.cwd()`.
 */

const RAIZ = process.cwd();
const POR_DEFECTO = path.join('data', 'recurso-de-prueba.dat');

describe('resolverRutaConfinada()', () => {
  it('sin valor configurado, devuelve la ruta por defecto bajo la raíz del proyecto', () => {
    expect(resolverRutaConfinada(undefined, POR_DEFECTO)).toBe(path.join(RAIZ, POR_DEFECTO));
  });

  it('trata la cadena vacía y los espacios como ausencia de configuración', () => {
    expect(resolverRutaConfinada('', POR_DEFECTO)).toBe(path.join(RAIZ, POR_DEFECTO));
    expect(resolverRutaConfinada('   ', POR_DEFECTO)).toBe(path.join(RAIZ, POR_DEFECTO));
  });

  it('acepta una ruta absoluta que cae dentro de la raíz del proyecto', () => {
    const dentro = path.join(RAIZ, '.tmp-tests', 'absoluta', 'recurso.dat');

    expect(resolverRutaConfinada(dentro, POR_DEFECTO)).toBe(dentro);
  });

  it.each([
    ['una ruta relativa que se escapa de la raíz', '../../etc/passwd'],
    ['una ruta absoluta fuera de la raíz', '/etc/passwd'],
    ['un directorio hermano con el mismo prefijo que la raíz', `${RAIZ}-malo/recurso.dat`],
    ['la raíz del proyecto a secas: el recurso es un archivo, no el directorio', '.'],
  ])('rechaza %s', (_descripcion, configurada) => {
    expect(() => resolverRutaConfinada(configurada, POR_DEFECTO)).toThrow(
      /fuera de la raíz del proyecto/i,
    );
  });
});
