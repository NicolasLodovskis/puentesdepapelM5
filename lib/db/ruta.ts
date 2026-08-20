import 'server-only';

import path from 'node:path';

import { resolverRutaConfinada } from '@/lib/rutas-confinadas';

/** Ruta por defecto del archivo SQLite, relativa a la raíz del proyecto. */
const RUTA_POR_DEFECTO = path.join('data', 'puentes.db');

/**
 * Resuelve la ruta absoluta del archivo `.db`.
 *
 * Por defecto `data/puentes.db` bajo la raíz del proyecto. `PUENTES_DB_PATH` permite
 * moverla, pero la ruta resultante **debe quedar dentro de la raíz del proyecto**
 * (mitigación 5, riesgo R4): una variable de entorno sin validar apuntaría a cualquier
 * archivo del sistema. Ante una ruta que se escapa, se falla cerrado.
 *
 * La validación de confinamiento vive en `lib/rutas-confinadas.ts` (mitigación M12 de
 * FEAT-001c): `lib/portadas/ruta.ts` la reusa para `data/portadas/` en vez de reimplementarla.
 */
export function rutaDb(): string {
  return resolverRutaConfinada(process.env.PUENTES_DB_PATH, RUTA_POR_DEFECTO);
}
