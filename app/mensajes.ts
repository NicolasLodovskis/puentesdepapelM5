import type { CampoLibro, DetalleCampo, ErrorCampo, LibroEnConflicto } from '@/lib/db/errores';

/**
 * Lo que las pantallas y los Server Actions comparten: textos, rutas y la validación del
 * identificador que llega del navegador.
 *
 * **Vive en un módulo aparte de `app/acciones.ts` a propósito**: un archivo `'use server'`
 * sólo puede exportar funciones async, así que un `export const` ahí adentro hace que la
 * aplicación falle al enviar el formulario (`AGENTS.md`, Code conventions). Acá no hay
 * directiva, así que las constantes son legales y el mismo módulo lo pueden importar los dos
 * Server Actions, las pantallas y el formulario de alta, que es un Client Component.
 *
 * Hoy contiene cuatro cosas, y conviene que estén escritas para que nadie agregue una quinta sin
 * decidirlo:
 *
 * 1. **La traducción de los rechazos del repositorio a frases.** `lib/db/` devuelve los errores
 *    estructurados por campo y sin una palabra de presentación adentro; éste es el único lugar
 *    donde esos motivos se vuelven texto (`mensajeDeCampo`, `mensajeDeConflicto`).
 * 2. **Los textos fijos de las pantallas** —el 404, el catálogo sin migrar, la venta—, juntos y no
 *    repartidos por los componentes que los pintan: dos lugares donde buscar el texto de una
 *    pantalla es cómo se termina con dos textos para lo mismo.
 * 3. **El formato de los números** (`formatearPrecio`, `formatearCantidad`), con una única
 *    instancia de `Intl.NumberFormat` para toda la interfaz.
 * 4. **La ruta del detalle y la validación del identificador de un libro** (`rutaDelDetalle`,
 *    `identificadorDeLibro`), que la fila del listado, la ruta del detalle y el Server Action de
 *    venta necesitan **compartir**: son la clase de regla que, copiada, se afloja en una copia y
 *    se queda con el test en la otra.
 *
 * Los puntos 3 y 4 ya no son "traducción de rechazos", y por eso este encabezado dejó de
 * describirlos como tal. El módulo está en el límite de lo que un archivo puede declarar como
 * contrato: partirlo —los textos por un lado, las rutas y la validación de entrada por otro— está
 * anotado como trabajo previo al bloque de edición, no como estética.
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

/**
 * Encabezado de la respuesta 404.
 *
 * Vive acá, junto a sus hermanos exactos —el texto del límite de error y los dos de la pantalla
 * del catálogo sin migrar—, y no en el componente que lo pinta: dos lugares donde buscar el texto
 * de una pantalla es cómo se termina con dos textos para lo mismo.
 *
 * Es el mismo mensaje para los **tres** motivos que producen un 404 —el id no es un entero
 * positivo, el libro no existe, el libro está archivado— a propósito: distinguirlos convertiría
 * la respuesta en un canal para averiguar cuántos libros hay y cuáles fueron archivados
 * (riesgo R2, mitigación 8).
 */
export const MENSAJE_LIBRO_INEXISTENTE = 'Este libro no está en el catálogo.';

/** Texto del control de venta de la fila del listado (FR-02, AC-17). */
export const TEXTO_VENDER = 'Vender';

/** Encabezado de la sección de venta de la vista de detalle. */
export const TITULO_VENTA = 'Vender un ejemplar';

/**
 * Texto del control que **ejecuta** la venta, ya en el detalle (FR-02).
 *
 * Dice qué va a pasar y cuánto: la venta descuenta 1 y no se puede deshacer (riesgo aceptado A3
 * del threat model), así que el control no puede decir sólo "Aceptar".
 */
export const TEXTO_CONFIRMAR_VENTA = 'Confirmar la venta de 1 ejemplar';

/**
 * Por qué no se puede vender un libro sin ejemplares (AC-03).
 *
 * Lo muestra la vista de detalle a partir del **stock vigente**, no de un parámetro de la URL: así
 * el mismo texto cubre las dos formas de llegar —abrir el detalle de un libro en 0, y que el
 * servidor rechace la confirmación— sin un canal que se pueda fabricar desde el navegador.
 */
export const MENSAJE_VENTA_SIN_STOCK =
  'Este libro no tiene ejemplares en stock, así que no se puede vender. ' +
  'Si entraron ejemplares nuevos, primero hay que corregir la cantidad en stock.';

/**
 * El texto con el que la venta **falla**, cuando falla por infraestructura.
 *
 * **No lo lee la usuaria, y conviene no prometerlo.** Se lanza como `Error` desde un Server Action:
 * la pantalla que se muestra es el límite de error de la ruta (`app/error.tsx`, que renderiza
 * `MENSAJE_ERROR_DE_PANTALLA`), y en producción React ni siquiera transporta este texto al
 * navegador —manda el digest—. O sea que su público real son el **log del servidor** y el digest
 * con el que se rastrea el incidente.
 *
 * Existe igual, y no se relanza el error del motor, porque es lo que sale de la acción hacia el
 * cliente: en desarrollo React sí transporta el mensaje, y el del motor nombra tablas, columnas y
 * la ruta del archivo de la base (M8, riesgo R7).
 *
 * **Por qué no se muestra por el camino de `sin_stock`** —redirigir al detalle con el aviso
 * derivado del servidor—: ese camino no sirve para este caso. Si la venta falló porque la base no
 * responde, el detalle al que redirigiríamos hace su propia lectura contra la misma base y falla
 * igual; la redirección produciría un segundo fallo en vez de un mensaje. Un aviso que sobreviva a
 * la base caída necesita un canal que este bloque no tiene, y el PRD no lo pide.
 */
export const MENSAJE_ERROR_DE_VENTA =
  'No se pudo registrar la venta por un problema del sistema. No se descontó ningún ejemplar. ' +
  'Volvé a intentar; si sigue fallando, hay que revisar la instalación.';

/**
 * Resultado de una edición, tal como lo devuelve el Server Action (FEAT-001b Block 5).
 *
 * **Una sola variante, y no dos como `ResultadoAlta`.** Tras el éxito la acción **redirige** (M3,
 * igual que la venta): el `ok: true` de `lib/db/edicion.ts` nunca llega a convertirse en este
 * estado porque `redirect()` interrumpe la ejecución antes del `return`. Lo único que
 * `useActionState` puede recibir de vuelta es un rechazo —campo inválido o título duplicado—, así
 * que agregar una variante `ok: true` sería modelar un caso que ningún camino produce, la misma
 * razón por la que `ResultadoAlta` no lleva "todavía no se envió nada" como variante propia.
 */
export type ResultadoEdicion = { ok: false; mensajes: MensajesPorCampo; general?: string };

/** Encabezado de la sección de edición de la vista de detalle (FR-03 a FR-06). */
export const TITULO_EDICION = 'Editar los datos del libro';

/** Texto del control que guarda los cambios del formulario de edición. */
export const TEXTO_GUARDAR_EDICION = 'Guardar los cambios';

/**
 * El texto con el que la edición **falla**, cuando falla por infraestructura.
 *
 * Mismo criterio que `MENSAJE_ERROR_DE_VENTA`: no es el error del motor, y su público real es el
 * log del servidor y el digest del límite de error, no la usuaria (M8, riesgo R7).
 */
export const MENSAJE_ERROR_DE_EDICION =
  'No se pudo guardar la edición por un problema del sistema. No se modificó nada. ' +
  'Volvé a intentar; si sigue fallando, hay que revisar la instalación.';

/**
 * La ruta de la vista de detalle de un libro.
 *
 * Vive acá, junto a los textos de la interfaz, y no repetida en cada pantalla: la escriben el
 * control de la fila del listado, la redirección de la venta y los tests. Tres copias de una ruta
 * son tres lugares donde arreglar un cambio de `app/libros/[id]/`, y las dos primeras dejarían de
 * apuntar al mismo lugar sin que nada se ponga rojo.
 */
export function rutaDelDetalle(id: number): string {
  return `/libros/${String(id)}`;
}

/**
 * Sólo dígitos. Sin signo, sin punto, sin notación exponencial y sin espacios: `Number()` acepta
 * `' 1'`, `'1e3'` y `'0x10'`, así que parsear primero y validar después dejaría entrar tres formas
 * de escribir un id que la usuaria nunca escribe. Sin cuantificadores anidados (riesgo R12).
 */
const SOLO_DIGITOS = /^\d+$/u;

/**
 * El identificador de un libro que llega del navegador, validado **antes de tocar la base** (M1,
 * riesgo R1). Devuelve `undefined` cuando no es uno: quién decide qué se responde es cada
 * superficie —la ruta responde 404, el Server Action también—.
 *
 * `Number.isSafeInteger` es la segunda mitad y no es redundante con el patrón: una tira de veinte
 * dígitos pasa el patrón y `Number()` la redondea al entero representable más cercano, con lo que
 * la consulta buscaría un id que la usuaria no pidió. El `> 0` cierra el `0`, que `AUTOINCREMENT`
 * no asigna nunca.
 *
 * **Es una sola implementación para las dos superficies que reciben un id**: el segmento `[id]` de
 * la ruta del detalle y el campo del formulario de venta. Dos copias de la misma regla es cómo una
 * de ellas se afloja —admitir `' 1'`, admitir el `0`— y la otra se queda con el test que lo
 * vigilaba. Vive en este módulo porque es el único de `app/` que puede importar cualquier
 * superficie: un archivo `'use server'` no puede exportar más que funciones async, así que la
 * validación no puede vivir con el Server Action.
 *
 * Acepta `unknown` porque de un `FormData` sale `null` o un `File` tan fácilmente como un `string`,
 * y convertirlo con `String()` sería inventar el dato que falta (Principio II).
 */
export function identificadorDeLibro(valor: unknown): number | undefined {
  if (typeof valor !== 'string' || !SOLO_DIGITOS.test(valor)) {
    return undefined;
  }

  const id = Number(valor);

  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/**
 * Formato de miles en castellano. **Una sola instancia para toda la interfaz**: construir un
 * `Intl.NumberFormat` dentro de un `map` serían 2.000 construcciones por renderizado del
 * catálogo.
 */
const MILES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/**
 * El precio, como lo lee la usuaria.
 *
 * Está acá y no en cada pantalla porque el listado y el detalle muestran **el mismo** precio del
 * **mismo** libro: con una copia por pantalla, la divergencia —`$ 9.500` en una y `$9500` en la
 * otra— deja verdes los tests de las dos, que fijan su propio literal por separado. Es la misma
 * razón por la que la identidad de un libro la produce una sola función (Block 1), un piso más
 * arriba.
 *
 * Los precios son enteros por invariante del esquema (`CHECK (precio > 0)` sobre una columna
 * INTEGER), así que no hay decimales que mostrar ni que redondear.
 */
export function formatearPrecio(precio: number): string {
  return `$ ${MILES.format(precio)}`;
}

/** Una cantidad de cosas —libros, ejemplares—, con el mismo separador de miles y sin el signo. */
export function formatearCantidad(cantidad: number): string {
  return MILES.format(cantidad);
}

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
  // FEAT-001c Block 2 (FR-01): la foto es opcional, pero si se adjunta se valida igual que
  // cualquier otro campo. Ninguno de los dos motivos nombra `sharp`/`libvips` (mitigación M16).
  foto: {
    formato_no_admitido:
      'Ese archivo no se pudo abrir como una imagen. Probá con otra foto, en un formato ' +
      'más común (JPEG, PNG).',
    demasiado_grande: 'La foto pesa más de 10 MB. Subí una versión más liviana.',
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
