import path from 'node:path';

/**
 * Aislamiento del entorno de test (Regla #0).
 *
 * Antes de que se importe un solo archivo de test, se apunta `PUENTES_DB_PATH` a un
 * directorio temporal fuera de `data/`. Así, un test que abra la conexión sin fijar la
 * variable escribe en `.tmp-tests/`, no sobre la base de producción `data/puentes.db`.
 */
process.env.PUENTES_DB_PATH = path.join(
  '.tmp-tests',
  `suite-${process.pid}`,
  'puentes-de-prueba.db',
);
