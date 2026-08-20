import 'server-only';

import path from 'node:path';

import { resolverRutaConfinada } from '@/lib/rutas-confinadas';

/** Directorio por defecto de las portadas, relativo a la raíz del proyecto. */
const RUTA_POR_DEFECTO = path.join('data', 'portadas');

/**
 * Resuelve la ruta absoluta del directorio de portadas.
 *
 * Por defecto `data/portadas` bajo la raíz del proyecto. `PUENTES_PORTADAS_PATH` permite
 * moverlo, con el mismo criterio de confinamiento que `rutaDb()` (mitigación M12 de
 * FEAT-001c, riesgo R13): la ruta resultante debe quedar dentro de la raíz del proyecto.
 */
export function rutaDirectorioPortadas(): string {
  return resolverRutaConfinada(process.env.PUENTES_PORTADAS_PATH, RUTA_POR_DEFECTO);
}

/**
 * Ruta absoluta del archivo de portada de un libro.
 *
 * El nombre es siempre `identificadorDeLibro(id)` (ya validado por quien llama, ver Bloques
 * 2-4) convertido a `${id}.jpg` — nunca deriva del nombre original subido ni de ningún otro
 * dato de la request (mitigación M20).
 */
export function rutaDeArchivo(id: number): string {
  return path.join(rutaDirectorioPortadas(), `${id}.jpg`);
}
