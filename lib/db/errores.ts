import type { MotivoPrecio } from '@/lib/dominio/parsear-precio';

import type { Libro } from './tipos';

/**
 * Tipos de resultado del repositorio.
 *
 * **No lleva `import 'server-only'` a propósito, y es el único módulo de `lib/db/` que no
 * lo lleva:** acá no hay una sola línea de código que se ejecute —son puros tipos, que el
 * compilador borra— y `app/mensajes.ts` necesita importarlos para traducir cada motivo a
 * un mensaje. Marcarlo como server-only obligaría a que ese archivo de presentación fuera
 * también de servidor sin ninguna razón. La barrera está donde importa: en `libros.ts`,
 * que sí abre la base.
 *
 * Los errores salen **estructurados por campo** y no como texto: la traducción a mensajes
 * para la usuaria es del Bloque 5. `lib/db/` no se queda con presentación adentro.
 */

/** Los cuatro campos que acepta un alta de libro. */
export type CampoLibro = 'titulo' | 'editorial' | 'stock' | 'precio';

/** Por qué se rechazó un campo de texto: `titulo` y `editorial`. */
export type DetalleTexto = 'vacio' | 'demasiado_largo';

/** Por qué se rechazó `stock`. */
export type DetalleEntero = 'no_entero' | 'fuera_de_rango';

/**
 * Motivo de rechazo de un campo cualquiera.
 *
 * Para `precio` es exactamente el `MotivoPrecio` que devuelve `parsearPrecio()`, sin
 * traducir ni reagrupar: perder el motivo exacto es lo que hace que la usuaria no sepa si
 * le rechazaron el precio por decimal, por separador de miles o por no ser numérico.
 */
export type DetalleCampo = DetalleTexto | DetalleEntero | MotivoPrecio;

/** Un campo rechazado, con el motivo. Uno por campo, nunca dos del mismo. */
export interface ErrorCampo {
  campo: CampoLibro;
  detalle: DetalleCampo;
}

/**
 * El libro que ya ocupa la identidad. AC-03 exige nombrarlo, así que viajan su `titulo`
 * y su `editorial` tal como están almacenados, no el título normalizado.
 */
export interface LibroEnConflicto {
  id: number;
  titulo: string;
  editorial: string;
}

/**
 * Resultado de un alta: unión discriminada de tres variantes.
 *
 * `crearLibro()` **no lanza por una condición de negocio**: el campo inválido y el título
 * duplicado son valores de retorno. Sólo se propaga un fallo de infraestructura.
 */
export type ResultadoCrearLibro =
  | { ok: true; libro: Libro }
  | { ok: false; motivo: 'campos_invalidos'; errores: ErrorCampo[] }
  | { ok: false; motivo: 'titulo_duplicado'; conflicto: LibroEnConflicto };
