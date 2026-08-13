import type { CampoLibro, DetalleCampo, ErrorCampo, LibroEnConflicto } from '@/lib/db/errores';

/**
 * Traducción de los rechazos del repositorio a texto para la usuaria.
 *
 * **Vive en un módulo aparte de `app/acciones.ts` a propósito**: un archivo `'use server'`
 * sólo puede exportar funciones async, así que un `export const` ahí adentro hace que la
 * aplicación falle al enviar el formulario (`AGENTS.md`, Code conventions). Acá no hay
 * directiva, así que las constantes son legales y el mismo módulo lo pueden importar el
 * Server Action y el formulario, que es un Client Component.
 *
 * `lib/db/` devuelve los errores **estructurados por campo** y sin una palabra de
 * presentación adentro; este archivo es el único lugar donde esos motivos se vuelven
 * frases.
 */

/** Un mensaje por campo rechazado. Los campos que pasaron no aparecen. */
export type MensajesPorCampo = Partial<Record<CampoLibro, string>>;

/**
 * Resultado de un alta, tal como lo devuelve el Server Action.
 *
 * Son **dos** variantes y ninguna más: son exactamente las dos que `altaDeLibro()` puede
 * devolver. "Todavía no se envió nada" no es un resultado del alta y por eso no está acá —
 * vive donde de verdad pasa, en el estado del hook, como `ResultadoAlta | null`—. Una tercera
 * variante que ningún camino produce ensancharía el contrato de una superficie HTTP pública y
 * obligaría a cada consumidor a manejar un caso imposible.
 */
export type ResultadoAlta =
  { ok: true; mensaje: string } | { ok: false; mensajes: MensajesPorCampo; general?: string };

export const MENSAJE_ALTA_EXITOSA = 'El libro quedó cargado en el catálogo.';

/**
 * El único texto de un fallo de infraestructura.
 *
 * Es genérico y no nombra tablas, columnas ni códigos del motor: el error de SQLite no llega
 * nunca a la pantalla (mitigación 8, riesgo R10). El detalle va al log del servidor.
 */
export const MENSAJE_ERROR_INESPERADO =
  'No se pudo dar de alta el libro por un problema del sistema. ' +
  'Volvé a intentar; si sigue fallando, hay que revisar la instalación.';

/** Texto de la página de error de la ruta. Tampoco dice nada del error real. */
export const MENSAJE_ERROR_DE_PANTALLA = 'No se pudo mostrar el catálogo.';

/** Encabezado de la pantalla del catálogo que no se pudo migrar. */
export const TITULO_CATALOGO_SIN_MIGRAR = 'El catálogo no se pudo abrir.';

/**
 * Aviso de que el recálculo de identidad encontró colisiones (AC-16).
 *
 * **No enumera los libros en conflicto**: ni títulos, ni ids, ni cuántos son, ni el texto del
 * motor, ni la ruta del archivo de la base (mitigaciones 7 y 8). Que el sistema informe que hay
 * colisiones y no cuáles es una decisión escrita de la usuaria, con su riesgo aceptado: los
 * pares se recuperan a mano sobre la columna de identidad, y el recálculo corre antes de que
 * entre el inventario real.
 *
 * Dice además las dos cosas que la usuaria necesita para decidir qué hacer: que no se modificó
 * nada, y que el catálogo no va a abrir hasta que los títulos repetidos queden en uno solo.
 */
export const MENSAJE_COLISION_DE_IDENTIDAD =
  'Al unificar los títulos que se diferencian sólo por la puntuación del final, dos o más ' +
  'libros quedaron con la misma identidad. No se modificó ningún libro ni ninguna entrada de ' +
  'historial. Hay que revisar los títulos repetidos y dejar uno solo para poder abrir el catálogo.';

/**
 * Salida de emergencia de la traducción.
 *
 * Se usa cuando llega una combinación de campo y motivo que hoy ningún camino produce. No es
 * decoración: `lib/db/` puede agregar un motivo mañana, y sin este texto la usuaria leería
 * `undefined` al lado del campo.
 */
export const MENSAJE_CAMPO_INVALIDO = 'El valor de este campo no es válido.';

const LARGO_MAXIMO_TEXTO = 300;

/**
 * Los textos, indexados por **campo y motivo**, no sólo por motivo.
 *
 * `fuera_de_rango` llega para `stock` y para `precio` con el mismo nombre y significan cosas
 * distintas, así que una tabla plana por motivo mostraría el mensaje del stock cuando el
 * problema es el precio. Cada campo tiene su columna.
 *
 * El tipo es `Partial` porque ningún campo admite los nueve motivos: `titulo` no puede ser
 * `decimal` ni `precio` puede ser `demasiado_largo`. Lo que cubre los huecos es
 * `MENSAJE_CAMPO_INVALIDO`.
 */
const MENSAJES: Record<CampoLibro, Partial<Record<DetalleCampo, string>>> = {
  titulo: {
    vacio: 'Hay que escribir el título del libro.',
    demasiado_largo: `El título no puede pasar de ${LARGO_MAXIMO_TEXTO} caracteres.`,
  },
  editorial: {
    vacio: 'Hay que escribir la editorial.',
    demasiado_largo: `La editorial no puede pasar de ${LARGO_MAXIMO_TEXTO} caracteres.`,
  },
  stock: {
    no_entero: 'El stock tiene que ser un número entero de ejemplares, sin decimales.',
    fuera_de_rango: 'El stock tiene que estar entre 0 y 1.000.000 ejemplares.',
  },
  precio: {
    ausente: 'Falta el precio.',
    no_numerico: 'El precio no es un número.',
    // Los dos motivos que el PRD exige distinguir, y por qué no se adivina (RF-31e,
    // Principio II): no se redondea el decimal ni se decide qué separa el punto.
    decimal:
      'El precio tiene centavos distintos de cero. Se cargan sólo precios enteros: ' +
      '1234, 1234,00 o 1234.0. No se redondea por vos.',
    separador_miles:
      'El precio trae separador de miles y no se puede saber si el punto separa miles ' +
      'o decimales. Escribilo sin puntos: 1234.',
    fuera_de_rango: 'El precio tiene que ser mayor que 0.',
  },
};

/** Traduce un rechazo de campo. Nunca devuelve `undefined`: ver `MENSAJE_CAMPO_INVALIDO`. */
export function mensajeDeCampo(error: ErrorCampo): string {
  return MENSAJES[error.campo][error.detalle] ?? MENSAJE_CAMPO_INVALIDO;
}

/**
 * Mensaje del título duplicado. **Nombra el libro en conflicto y su editorial** (AC-03): sin
 * eso la usuaria no sabe cuál de sus libros es el que ya está cargado.
 *
 * El título y la editorial se interpolan como texto y los pinta React, que escapa por
 * defecto: acá no se arma HTML.
 */
export function mensajeDeConflicto(conflicto: LibroEnConflicto): string {
  return (
    `Ya hay un libro con ese título: «${conflicto.titulo}», de ${conflicto.editorial}. ` +
    'La editorial no forma parte de la identidad del libro, así que no se puede cargar dos veces.'
  );
}
