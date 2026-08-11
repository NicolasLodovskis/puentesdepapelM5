import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { rutaDb } from '@/lib/db/ruta';

const ORIGINAL = process.env.PUENTES_DB_PATH;
const RUTA_DE_PRODUCCION = path.join(process.cwd(), 'data', 'puentes.db');

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.PUENTES_DB_PATH;
  } else {
    process.env.PUENTES_DB_PATH = ORIGINAL;
  }
});

describe('rutaDb()', () => {
  it('sin PUENTES_DB_PATH devuelve data/puentes.db bajo la raíz del proyecto', () => {
    delete process.env.PUENTES_DB_PATH;

    expect(rutaDb()).toBe(RUTA_DE_PRODUCCION);
  });

  it('rechaza una ruta que se escapa de la raíz del proyecto (mitigación 5)', () => {
    process.env.PUENTES_DB_PATH = '../../etc/passwd';

    expect(() => rutaDb()).toThrow(/fuera de la raíz del proyecto/i);
  });

  it('rechaza una ruta absoluta fuera de la raíz del proyecto', () => {
    process.env.PUENTES_DB_PATH = '/etc/passwd';

    expect(() => rutaDb()).toThrow(/fuera de la raíz del proyecto/i);
  });

  it('acepta una ruta absoluta que cae dentro de la raíz del proyecto', () => {
    const dentro = path.join(process.cwd(), '.tmp-tests', 'absoluta', 'puentes.db');
    process.env.PUENTES_DB_PATH = dentro;

    expect(rutaDb()).toBe(dentro);
  });

  it('rechaza un directorio hermano con el mismo prefijo que la raíz', () => {
    process.env.PUENTES_DB_PATH = `${process.cwd()}-malo/puentes.db`;

    expect(() => rutaDb()).toThrow(/fuera de la raíz del proyecto/i);
  });

  it('trata la cadena vacía y los espacios como ausencia de configuración', () => {
    process.env.PUENTES_DB_PATH = '';
    expect(rutaDb()).toBe(RUTA_DE_PRODUCCION);

    process.env.PUENTES_DB_PATH = '   ';
    expect(rutaDb()).toBe(RUTA_DE_PRODUCCION);
  });

  it('rechaza la raíz del proyecto a secas: la base es un archivo, no el directorio', () => {
    process.env.PUENTES_DB_PATH = '.';

    expect(() => rutaDb()).toThrow(/fuera de la raíz del proyecto/i);
  });
});

describe('aislamiento del entorno de test (Regla #0)', () => {
  it('la suite nunca resuelve a la base de producción por defecto', () => {
    expect(process.env.PUENTES_DB_PATH).toBeDefined();
    expect(rutaDb()).not.toBe(RUTA_DE_PRODUCCION);
    expect(rutaDb()).toContain(`${path.sep}.tmp-tests${path.sep}`);
  });
});
