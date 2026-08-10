import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { migrar } from './migrar';
import { rutaDb } from './ruta';

declare global {
  var __puentesDePapelDb: Database.Database | undefined;
}

/**
 * Fija los pragmas de toda conexión a la base. Vive acá y se usa también desde el
 * ayudante de tests, para que la base de prueba no sea una conexión distinta de la real.
 *
 * `foreign_keys = ON` es obligatorio: SQLite lo trae **apagado** por conexión, así que
 * sin esto las claves foráneas del DDL serían decorativas.
 *
 * `busy_timeout` va **antes** de `journal_mode = WAL`: el cambio a WAL toma un lock
 * exclusivo momentáneo y, con el timeout todavía en 0, un proceso concurrente recibiría
 * `SQLITE_BUSY` en vez de esperar.
 */
export function aplicarPragmas(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
}

/**
 * Devuelve la conexión única a la base, creándola la primera vez.
 *
 * La instancia se cachea en `globalThis`, no en una `const` de módulo: el HMR de
 * `next dev` reevalúa los módulos y una `const` filtraría un handle nuevo por cada
 * recarga en caliente.
 *
 * Al abrir fija `foreign_keys = ON` —SQLite lo trae **apagado** por conexión, así que
 * sin esto las claves foráneas del DDL serían decorativas—, `journal_mode = WAL` y
 * `busy_timeout = 5000`, y deja el esquema migrado.
 *
 * Un fallo al abrir el archivo se propaga sin capturar: es un fallo de instalación,
 * no una condición de negocio.
 */
export function obtenerDb(): Database.Database {
  const cacheada = globalThis.__puentesDePapelDb;
  if (cacheada !== undefined) {
    return cacheada;
  }

  const ruta = rutaDb();
  fs.mkdirSync(path.dirname(ruta), { recursive: true });

  const db = new Database(ruta);
  aplicarPragmas(db);
  migrar(db);

  globalThis.__puentesDePapelDb = db;
  return db;
}

/** Cierra la conexión cacheada, si la hay. Deja `obtenerDb()` en condiciones de reabrir. */
export function cerrarDb(): void {
  const db = globalThis.__puentesDePapelDb;
  if (db === undefined) {
    return;
  }

  globalThis.__puentesDePapelDb = undefined;
  db.close();
}
