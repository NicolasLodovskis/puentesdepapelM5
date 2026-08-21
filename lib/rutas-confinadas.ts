import path from 'node:path';

/**
 * Confina una ruta configurable a la raíz del proyecto.
 *
 * Extraída de `lib/db/ruta.ts` (mitigación 5 de FEAT-001a) para que `lib/portadas/ruta.ts` la
 * reuse en vez de reimplementar la validación (mitigación M12 de FEAT-001c, riesgo R13).
 *
 * **No lee `process.env` ni toca ningún recurso.** Recibe el valor ya leído por quien llama
 * (`string | undefined`, el resultado de leer una variable de entorno) y la ruta relativa por
 * defecto, y sólo calcula un `path` contra `process.cwd()`. Por eso este módulo no lleva
 * `import 'server-only'` propio: lo hereda quien lo llama.
 *
 * Cadena vacía o sólo espacios se trata como "sin configurar" (usa `porDefecto`). Cualquier
 * otro valor se resuelve contra la raíz del proyecto y **debe** quedar dentro de ella: ante una
 * ruta relativa que se escapa (`../`), una ruta absoluta fuera, un directorio hermano con el
 * mismo prefijo de texto, o la raíz a secas (sin nombre de archivo), se falla cerrado con una
 * excepción.
 */
export function resolverRutaConfinada(configurada: string | undefined, porDefecto: string): string {
  const raiz = process.cwd();

  // `turbopackIgnore` sólo apaga el análisis estático del empaquetador, no el chequeo de más
  // abajo. Al extraer esta lógica a una función reusable con `porDefecto` como parámetro,
  // Turbopack deja de poder probar en tiempo de build que ese valor es un literal confinado
  // — algo que sí podía cuando la cuenta vivía inline en `rutaDb()` con la constante puesta a
  // mano— y traza el proyecto entero hacia la salida del servidor (código fuente y `public/`
  // incluidos) "por las dudas". Acá no se está resolviendo ningún módulo a empaquetar: se
  // calcula la ruta de un recurso de datos en tiempo de ejecución, y el confinamiento a la
  // raíz sigue vigente sin este análisis.
  if (configurada === undefined || configurada.trim() === '') {
    return path.join(/* turbopackIgnore: true */ raiz, porDefecto);
  }

  const resuelta = path.resolve(/* turbopackIgnore: true */ raiz, configurada);
  const relativa = path.relative(raiz, resuelta);

  if (relativa === '' || relativa.startsWith('..') || path.isAbsolute(relativa)) {
    throw new Error(
      `La ruta configurada apunta fuera de la raíz del proyecto: ${resuelta}. ` +
        'Sólo puede vivir dentro del proyecto.',
    );
  }

  return resuelta;
}
