import 'server-only';

import path from 'node:path';

/** Ruta por defecto del archivo SQLite, relativa a la raíz del proyecto. */
const RUTA_POR_DEFECTO = path.join('data', 'puentes.db');

/** Raíz del proyecto. Los scripts de npm siempre se ejecutan desde acá. */
function raizDelProyecto(): string {
  return process.cwd();
}

/**
 * Resuelve la ruta absoluta del archivo `.db`.
 *
 * Por defecto `data/puentes.db` bajo la raíz del proyecto. `PUENTES_DB_PATH` permite
 * moverla, pero la ruta resultante **debe quedar dentro de la raíz del proyecto**
 * (mitigación 5, riesgo R4): una variable de entorno sin validar apuntaría a cualquier
 * archivo del sistema. Ante una ruta que se escapa, se falla cerrado.
 */
export function rutaDb(): string {
  const raiz = raizDelProyecto();
  const configurada = process.env.PUENTES_DB_PATH;

  if (configurada === undefined || configurada.trim() === '') {
    return path.join(raiz, RUTA_POR_DEFECTO);
  }

  // `turbopackIgnore` sólo apaga el análisis estático del empaquetador, no el chequeo de
  // abajo. Turbopack ve un `path.resolve` con una parte dinámica y, por las dudas, traza
  // el proyecto entero hacia la salida del servidor (código fuente y `public/` incluidos).
  // Acá no se está resolviendo ningún módulo a empaquetar: se calcula la ruta de un
  // archivo de datos en tiempo de ejecución, y el confinamiento a la raíz sigue vigente.
  const resuelta = path.resolve(/* turbopackIgnore: true */ raiz, configurada);
  const relativa = path.relative(raiz, resuelta);

  if (relativa === '' || relativa.startsWith('..') || path.isAbsolute(relativa)) {
    throw new Error(
      `PUENTES_DB_PATH apunta fuera de la raíz del proyecto: ${resuelta}. ` +
        'La base de datos sólo puede vivir dentro del proyecto.',
    );
  }

  return resuelta;
}
