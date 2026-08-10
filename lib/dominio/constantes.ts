/**
 * Constantes del dominio.
 *
 * Viven en un módulo aparte de las funciones a propósito: un archivo `'use server'` sólo
 * puede exportar funciones async, así que si Block 5 necesitara un literal de acá y éste
 * viviera dentro de un módulo de Server Actions, la app fallaría al enviar el formulario
 * (`AGENTS.md`, Code conventions).
 */

/**
 * Diacríticos que se pliegan, con su equivalente sin acento.
 *
 * **La `ñ` no está en el mapa, y no debe estar**: no es una letra acentuada, es otra
 * letra. Plancharla haría que `"El sueño"` y `"El sueno"` fueran el mismo libro. Por eso
 * el plegado usa este mapa explícito y no `NFD` + descarte de las combining marks: ese
 * atajo se llevaría la tilde de la eñe junto con los acentos.
 *
 * **La cobertura es deliberadamente sólo español.** Los diacríticos de otros idiomas no
 * están y por lo tanto no se pliegan: hoy `"Père Goriot"` queda en `"père goriot"` y
 * `"Camões"` en `"camões"`, así que AC-06 se cumple en castellano y no en
 * `è ê ë ï î ô ç ã õ à â ä ö û`. Si entran títulos en otros idiomas, la corrección es
 * ampliar **este** mapa y nada más: es la única fuente de verdad del plegado.
 *
 * Las claves están en minúscula porque `plegarTexto()` baja a minúsculas antes de mapear.
 */
export const PLEGADO_DE_DIACRITICOS: Readonly<Record<string, string | undefined>> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ü: 'u',
};

/**
 * Los nueve artículos del español, y **sólo** esos.
 *
 * Se usan para reconocer el artículo pospuesto (`"Principito, El"`) y moverlo al frente.
 * Nada de otros idiomas entra acá: `"Hobbit, The"` no se reordena, porque acertar en un
 * idioma y equivocarse en otro es peor que no tocar nada (Principio II).
 */
export const ARTICULOS = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo'] as const;

/**
 * Precio mínimo admitido.
 *
 * El esquema exige `precio > 0` y la columna es `INTEGER` (`lib/db/migraciones/001-inicial.ts`),
 * así que sobre enteros `> 0` equivale a `>= 1`. Ése es el paso que hace válido este `1`, y
 * es también el que deja de valer si algún día se admiten precios con decimales.
 */
export const PRECIO_MINIMO = 1;

/**
 * Precio máximo admitido.
 *
 * El esquema no fija un techo de negocio, pero sí existe un techo de representación: por
 * encima de `MAX_SAFE_INTEGER` un entero deja de ser exacto en JavaScript, y devolver
 * `ok` con un valor que perdió precisión sería inventar un precio (Principio II). Se
 * reporta `fuera_de_rango`, que es la verdad.
 */
export const PRECIO_MAXIMO = Number.MAX_SAFE_INTEGER;
