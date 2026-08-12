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
 * La cola de caracteres que no son ni letra ni dígito: puntuación, comillas **y espacios**.
 *
 * Incluye el espacio a propósito. `plegarTexto()` recorta los extremos pero no colapsa los
 * espacios internos, así que `"Principito, El ."` llega acá con el espacio todavía entre el
 * artículo y el punto: un recorte de sólo puntuación dejaría `"principito, el "` y el patrón
 * anclado en `$` seguiría sin ver el artículo. Es el caso vecino del que cierra AC-13, y
 * arreglar uno sin el otro es la trampa (spec-FEAT-001b Block 1).
 *
 * Sin la bandera `g`: se usa con `replace` una sola vez y el patrón ya está anclado al final.
 * Sin cuantificadores anidados (riesgo R12): el `+` recorre la cola una vez.
 */
const COLA_SIN_LETRAS_NI_DIGITOS = /[^\p{L}\p{N}]+$/u;

/**
 * Calcula la **identidad** de un libro: su título normalizado, que es la clave `UNIQUE`
 * del catálogo (FR-02, FR-08).
 *
 * El orden de los pasos no es negociable: plegar → **recortar la cola sin letras ni
 * dígitos** → mover el artículo pospuesto al frente → quitar puntuación → colapsar
 * espacios. La detección del artículo pospuesto necesita la coma, así que la puntuación
 * interna se quita **después**; la del final, en cambio, tiene que irse **antes**, porque es
 * justamente lo que separaba al artículo del `$` que el patrón exige.
 *
 * Consecuencia deliberada: `"Principito, El"` y `"El Principito"` normalizan los dos a
 * `"el principito"` y son el mismo libro (AC-03); `"El Aleph"` y `"Aleph"` normalizan a
 * `"el aleph"` y `"aleph"` y son libros distintos. El artículo se **mueve**, no se borra.
 *
 * **La puntuación final no es parte de la identidad** (FR-10, AC-13). Los tres casos que
 * FEAT-001a dejaba entrar como libros distintos hoy son el mismo:
 *
 * ```
 * "Principito, El"    → "el principito"
 * "Principito, El."   → "el principito"
 * '"Principito, El"'  → "el principito"     ← el pegado de Excel
 * "Principito, El ."  → "el principito"     ← con espacio antes del punto
 * ```
 *
 * **El recorte no autoriza a desanclar el patrón.** Sacarle el `$` a `ARTICULO_POSPUESTO`
 * cerraría AC-13 por el camino equivocado: `"Casa, La de Bernarda"` pasaría a reordenarse y
 * quedaría como `"la casa de bernarda"`, o sea la misma identidad que un libro distinto. El
 * `$` se queda; lo que cambia es qué hay antes de él.
 *
 * No lanza: sobre una cadena vacía devuelve cadena vacía, que rechazan el `CHECK` del
 * esquema y la validación del repositorio. Una función pura que lanza obliga a envolverla
 * en `try` y el motivo del rechazo se pierde por el camino.
 */
export function normalizarTitulo(titulo: string): string {
  const plegado = plegarTexto(titulo).replace(COLA_SIN_LETRAS_NI_DIGITOS, '');

  const pospuesto = ARTICULO_POSPUESTO.exec(plegado);
  const conArticuloAlFrente =
    pospuesto === null ? plegado : `${pospuesto[1]} ${plegado.slice(0, pospuesto.index)}`;

  return conArticuloAlFrente.replace(PUNTUACION, ' ').replace(ESPACIOS, ' ').trim();
}
