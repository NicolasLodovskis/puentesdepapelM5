import { ARTICULOS } from './constantes';
import { plegarTexto } from './plegar-texto';

/**
 * Artículo pospuesto: `, <artículo>` al final del título.
 *
 * Se arma una sola vez desde `ARTICULOS`, que es una lista estática y sin metacaracteres.
 * No lleva la bandera `g`: un `RegExp` global recuerda su `lastIndex` entre llamadas y,
 * reutilizado a nivel de módulo, dejaría de reconocer el artículo cada dos títulos.
 *
 * El anclaje en `$` es lo que hace que la alternancia no se equivoque: para `", los"` la
 * rama `lo` coincidiría, pero al no llegar al final del texto el motor sigue probando y
 * toma `los`. Tampoco hay cuantificadores anidados (riesgo R12): el costo es lineal.
 */
const ARTICULO_POSPUESTO = new RegExp(`,\\s*(${ARTICULOS.join('|')})$`, 'u');

/**
 * Todo lo que no sea letra ni dígito ni espacio. `\p{L}` conserva la `ñ` y cualquier otra
 * letra Unicode. Se reemplaza por un espacio en vez de borrarse, para no pegar palabras:
 * `"Jekyll&Hyde"` y `"Jekyll & Hyde"` tienen que ser el mismo libro.
 */
const PUNTUACION = /[^\p{L}\p{N}\s]/gu;

/** Rachas de espacios, para colapsarlas en uno solo. */
const ESPACIOS = /\s+/gu;

/**
 * Calcula la **identidad** de un libro: su título normalizado, que es la clave `UNIQUE`
 * del catálogo (FR-02, FR-08).
 *
 * El orden de los pasos no es negociable: plegar → mover el artículo pospuesto al frente
 * → quitar puntuación → colapsar espacios. La detección del artículo pospuesto necesita
 * la coma, así que la puntuación se quita **después**.
 *
 * Consecuencia deliberada: `"Principito, El"` y `"El Principito"` normalizan los dos a
 * `"el principito"` y son el mismo libro (AC-03); `"El Aleph"` y `"Aleph"` normalizan a
 * `"el aleph"` y `"aleph"` y son libros distintos. El artículo se **mueve**, no se borra.
 *
 * **Límite conocido del reordenamiento.** El patrón exige que el artículo sea lo último del
 * texto (`$`), y la puntuación se quita *después*: si algo separa al artículo del final, el
 * reordenamiento no ocurre y el título entra con otra identidad.
 *
 * ```
 * "Principito, El"    → "el principito"
 * "Principito, El."   → "principito el"     ← otra identidad, mismo libro
 * '"Principito, El"'  → "principito el"     ← típico de un pegado de Excel
 * ```
 *
 * Es el único caso en el que el `UNIQUE` de `titulo_normalizado` no protege: son dos claves
 * distintas, así que el mismo libro se puede dar de alta dos veces. El patrón se deja
 * anclado en `$` porque la spec lo especifica así (`, <artículo>` **al final** del título);
 * cambiarlo es una decisión de producto, no de implementación.
 *
 * Quien consuma esta identidad son los dos flujos de Excel de FEAT-001b —actualización de
 * precios y alta masiva—, que es donde el pegado sucio llega en volumen: si el caso se
 * vuelve un problema real, se resuelve ahí o enmendando la spec, no silenciosamente acá.
 *
 * No lanza: sobre una cadena vacía devuelve cadena vacía, que rechazan el `CHECK` del
 * esquema y la validación del repositorio. Una función pura que lanza obliga a envolverla
 * en `try` y el motivo del rechazo se pierde por el camino.
 */
export function normalizarTitulo(titulo: string): string {
  const plegado = plegarTexto(titulo);

  const pospuesto = ARTICULO_POSPUESTO.exec(plegado);
  const conArticuloAlFrente =
    pospuesto === null ? plegado : `${pospuesto[1]} ${plegado.slice(0, pospuesto.index)}`;

  return conArticuloAlFrente.replace(PUNTUACION, ' ').replace(ESPACIOS, ' ').trim();
}
