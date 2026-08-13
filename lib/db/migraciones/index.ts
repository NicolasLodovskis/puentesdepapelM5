import 'server-only';

import type Database from 'better-sqlite3';

import { SQL_001_INICIAL } from './001-inicial';
import { SQL_002_VENTAS } from './002-ventas';
import { aplicar003Identidad } from './003-identidad';

/** Número de versión que queda en `PRAGMA user_version` al aplicar una migración. */
interface Numerada {
  numero: number;
}

/**
 * Una migración: **o** un SQL de esquema, **o** un paso de lógica. Nunca las dos mitades.
 *
 * Es una unión discriminada y no un objeto con `sql` opcional y `aplicar` opcional a
 * propósito: con los dos campos opcionales existirían dos combinaciones que no significan
 * nada —ninguna mitad, o las dos a la vez—, y `migrar.ts` tendría que decidir qué hacer con
 * ellas.
 *
 * **Cada miembro prohíbe explícitamente la mitad del otro con `?: never`, y esa parte no es
 * decoración.** Una unión de dos objetos sin esa prohibición no rechaza el literal con las dos
 * mitades: el excess property check admite toda propiedad que exista en *algún* miembro de la
 * unión, así que `{ numero, sql, aplicar }` compilaba, el runner entraba por la rama del `sql` y
 * el paso de lógica no corría nunca —con `user_version` avanzando igual y sin nada rojo—. Con
 * `?: never` ese literal ya no tipa.
 *
 * El tipo cubre lo que se escribe a mano en este archivo. Lo que llega por un `as`, desde
 * JavaScript o desde un mock de test no lo ve nadie en compilación: para eso está
 * `llevaUnaSolaMitad()`, que es la misma garantía en tiempo de ejecución.
 *
 * `aplicar` recibe la conexión y corre **dentro de la transacción del runner**: no abre la
 * suya ni hace COMMIT, igual que el SQL de esquema.
 */
export type Migracion =
  | (Numerada & { sql: string; aplicar?: never })
  | (Numerada & { aplicar: (db: Database.Database) => void; sql?: never });

/**
 * ¿La migración lleva **exactamente una** de las dos mitades?
 *
 * Es la garantía del tipo, comprobada en tiempo de ejecución, y existe porque el modo de falla
 * de la forma degenerada es silencioso: una migración con las dos mitades se aplicaría por la
 * rama del SQL y su paso de lógica no correría, y una sin ninguna avanzaría `user_version` sin
 * hacer nada. Las dos dejarían la base declarando una versión que no tiene.
 *
 * La comprueba `migrar()` antes de aplicar cada migración, y por eso vive acá y no en el
 * runner: es una propiedad de la forma de una migración, no del recorrido de la lista.
 */
export function llevaUnaSolaMitad(migracion: Migracion): boolean {
  // Se mira el valor y no sólo la presencia de la clave: `{ sql: undefined }` es una clave
  // presente y ninguna mitad.
  const conSql = migracion.sql !== undefined;
  const conAplicar = migracion.aplicar !== undefined;

  return conSql !== conAplicar;
}

/**
 * Lista **estática** de migraciones (mitigación 4, riesgo R3).
 *
 * No hay `readdir`, ni ruta configurable, ni lectura del sistema de archivos: el SQL
 * llega por `import` estático, así que el empaquetador lo traza y el contenido no
 * depende del directorio desde el que se arranque el proceso. Cada migración se agrega
 * acá, a mano, con su número.
 */
export const MIGRACIONES: readonly Migracion[] = [
  { numero: 1, sql: SQL_001_INICIAL },
  { numero: 2, sql: SQL_002_VENTAS },
  // El recálculo va **después** de la 002 y como migración aparte: dos pasos con su propio
  // número no pueden quedar aplicados a medias, y `user_version` dice cuál de los dos corrió.
  { numero: 3, aplicar: aplicar003Identidad },
];
