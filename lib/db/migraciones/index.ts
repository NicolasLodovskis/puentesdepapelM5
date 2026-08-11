import 'server-only';

import { SQL_001_INICIAL } from './001-inicial';

export interface Migracion {
  /** Número de versión que queda en `PRAGMA user_version` al aplicarla. */
  numero: number;
  sql: string;
}

/**
 * Lista **estática** de migraciones (mitigación 4, riesgo R3).
 *
 * No hay `readdir`, ni ruta configurable, ni lectura del sistema de archivos: el SQL
 * llega por `import` estático, así que el empaquetador lo traza y el contenido no
 * depende del directorio desde el que se arranque el proceso. Cada migración se agrega
 * acá, a mano, con su número.
 */
export const MIGRACIONES: readonly Migracion[] = [{ numero: 1, sql: SQL_001_INICIAL }];
