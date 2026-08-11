import { PLEGADO_DE_DIACRITICOS } from './constantes';

/**
 * Pliega un texto para compararlo y ordenarlo: recorta, baja a minúsculas y quita
 * únicamente los diacríticos de `á é í ó ú` y `ü`, **preservando la `ñ`**.
 *
 * Alimenta `titulo_orden`, `editorial_normalizada` y el término de búsqueda: es lo que
 * hace que buscar `"avila"` encuentre `"Ávila"` (AC-06).
 *
 * No lanza nunca y no colapsa los espacios internos: eso es asunto de
 * `normalizarTitulo()`, que trabaja sobre la identidad y no sobre el orden.
 */
export function plegarTexto(texto: string): string {
  // `NFC` compone en un único carácter los acentos que llegan como letra + marca
  // combinante, que es la forma que busca el mapa; sin este paso, un "Á" pegado en forma
  // descompuesta no plegaría. Componer no descarta ninguna marca, así que la `ñ` sale
  // intacta: es justamente lo contrario de `NFD` + borrado de combining marks.
  const preparado = texto.normalize('NFC').trim().toLowerCase();

  // Se recorre carácter por carácter, en vez de una expresión regular con la lista de
  // acentos repetida: así el mapa de `constantes.ts` es la única fuente de verdad y no
  // hay dos listas que puedan desincronizarse.
  return Array.from(preparado, (caracter) => PLEGADO_DE_DIACRITICOS[caracter] ?? caracter).join('');
}
