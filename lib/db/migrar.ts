import 'server-only';

import type Database from 'better-sqlite3';

import { MIGRACIONES } from './migraciones';

/**
 * Aplica las migraciones pendientes según `PRAGMA user_version`.
 *
 * Leer la versión, aplicar y escribirla ocurre todo dentro de un `BEGIN IMMEDIATE`:
 * fuera de la transacción sería un check-then-act y dos procesos podrían aplicar la
 * misma migración dos veces. Si una migración falla a mitad de camino, el `ROLLBACK`
 * revierte también el DDL —en SQLite es transaccional— y `user_version` queda en el
 * valor anterior. El error se propaga: una base a medio migrar no debe atenderse.
 */
export function migrar(db: Database.Database): void {
  db.exec('BEGIN IMMEDIATE');

  try {
    const versionActual = db.pragma('user_version', { simple: true }) as number;
    const pendientes = [...MIGRACIONES]
      .sort((a, b) => a.numero - b.numero)
      .filter((migracion) => migracion.numero > versionActual);

    let versionNueva = versionActual;
    for (const migracion of pendientes) {
      db.exec(migracion.sql);
      versionNueva = migracion.numero;
    }

    if (versionNueva !== versionActual) {
      // `PRAGMA user_version` no admite parámetros, así que el valor se interpola.
      // Sale de la lista estática de migraciones, nunca de una entrada externa, y aun
      // así se comprueba que sea un entero antes de escribirlo.
      if (!Number.isInteger(versionNueva)) {
        throw new Error(`Número de migración inválido: ${String(versionNueva)}`);
      }
      db.exec(`PRAGMA user_version = ${versionNueva}`);
    }

    db.exec('COMMIT');
  } catch (error) {
    // Ante disco lleno, error de E/S o SQLITE_BUSY, SQLite ya revirtió por su cuenta y
    // la transacción no está activa: un ROLLBACK ahí lanza y reemplazaría el error real,
    // que es justo el que hace falta para diagnosticar el arranque.
    if (db.inTransaction) {
      db.exec('ROLLBACK');
    }
    throw error;
  }
}
