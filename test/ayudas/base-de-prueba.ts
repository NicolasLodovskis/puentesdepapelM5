import path from 'node:path';

import Database from 'better-sqlite3';

import { aplicarPragmas } from '@/lib/db/conexion';
import { migrar } from '@/lib/db/migrar';

/**
 * Directorio de trabajo de los tests. Vive FUERA de `data/`, que es donde está la base
 * de producción: un test que se olvide de fijar `PUENTES_DB_PATH` no debe poder escribir
 * sobre `data/puentes.db`.
 */
export const DIRECTORIO_TEMPORAL = path.join(process.cwd(), '.tmp-tests');

export function rutaTemporal(nombre: string): string {
  return path.join(
    DIRECTORIO_TEMPORAL,
    `${nombre}-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
}

/**
 * Abre una base SQLite en memoria, con los mismos pragmas que la conexión real y el
 * esquema migrado desde cero. Los tests JAMÁS tocan `data/puentes.db`.
 */
export function baseDePrueba(): Database.Database {
  const db = new Database(':memory:');
  aplicarPragmas(db);
  migrar(db);
  return db;
}
