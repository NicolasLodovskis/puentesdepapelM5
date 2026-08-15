import type { MotivoPrecio } from '@/lib/dominio/parsear-precio';

import type { Libro, Venta } from './tipos';

/**
 * Tipos de resultado del repositorio.
 *
 * **No lleva `import 'server-only'` a propósito.** Es una de las **dos** excepciones de
 * `lib/db/`, y las dos lo son por lo mismo: `app/` las importa. Este archivo, porque
 * `app/mensajes.ts` necesita los motivos para traducirlos a un mensaje; y `lib/db/tipos.ts`,
 * porque de ahí sale `Libro`, que la pantalla recibe y muestra. Marcarlos como server-only
 * obligaría a que esos archivos de presentación fueran también de servidor sin ninguna razón. La
 * barrera está donde importa: en `libros.ts` y en `consultas.ts`, que sí abren la base.
 *
 * Lo que sostiene la excepción es que **acá no se importa ningún valor**: todos los `import` son
 * `import type` y el compilador los borra, así que este módulo no puede arrastrar nada de
 * servidor al cliente por más que lo importe una pantalla. Eso dejó de ser una propiedad
 * evidente cuando apareció `esColisionDeIdentidad()` —hay código ejecutable acá—, así que ahora
 * lo afirma una guardia: «lib/db/errores.ts no importa ningún valor» en `test/db/migrar.test.ts`.
 * Esa función está acá y no en la migración que produce el error por la misma razón que los
 * tipos: es la presentación la que necesita distinguir esa falla, y los módulos donde ocurre son
 * server-only. Es pura y no toca la base.
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

/**
 * Resultado de una venta: unión discriminada de tres variantes (FR-02, AC-02, AC-03).
 *
 * `venderEjemplar()` **no lanza por una condición de negocio**, igual que el alta: el stock 0 y el
 * libro que no está son valores de retorno. Sólo se propaga un fallo de infraestructura, que la
 * Server Action traduce a un mensaje genérico (M8).
 *
 * Los dos rechazos **no llevan payload**: no hace falta ninguno. `sin_stock` lo explica la pantalla
 * a partir del stock vigente —que ya muestra—, y `libro_inexistente` se responde con un 404
 * indistinguible del de un id que no es un id, que es la decisión escrita del Block 3 (riesgo R2).
 */
export type ResultadoVender =
  | { ok: true; venta: Venta }
  | { ok: false; motivo: 'sin_stock' }
  | { ok: false; motivo: 'libro_inexistente' };

/**
 * El error del recálculo de identidad cuando dos o más libros pasan a compartirla (FR-11).
 *
 * **Es un error y no un valor de retorno**, al revés que los rechazos del alta: ocurre dentro
 * de la transacción del runner de migraciones, y lo que tiene que pasar es exactamente lo que
 * hace una excepción ahí adentro —`ROLLBACK` de todo y `user_version` sin avanzar (AC-16)—.
 * Devolver un valor obligaría al runner a decidir si revierte, que es justo lo que no debe
 * quedar a criterio de nadie.
 *
 * **No lleva payload**: ni títulos, ni ids, ni cuántos son. AC-16 pide informar que hay
 * colisiones y no cuáles, y un canal de error que las enumere es un canal que lista el
 * inventario (mitigaciones 7 y 8). Los pares se recuperan con una consulta manual sobre
 * `titulo_normalizado`.
 */
export interface ErrorDeColisionDeIdentidad extends Error {
  readonly colisionDeIdentidad: true;
}

/**
 * ¿Es la colisión de identidad del recálculo, y no un fallo de infraestructura?
 *
 * La **marca** se comprueba por duck typing y no con una clase propia comparada por
 * `instanceof`, por las dos razones que ya llevaron a `esViolacionDeUnique()` a hacer lo mismo:
 * no hace falta importar ninguna clase como valor, y una clase deja de reconocer a su propia
 * instancia cuando el módulo se reevalúa —lo que hacen los tests que recortan la lista de
 * migraciones con `vi.resetModules()`—.
 *
 * El `instanceof Error`, en cambio, **sí** va, y no contradice lo anterior: `Error` es un global
 * y no se duplica al reevaluar un módulo. Está porque el tipo que este predicado afirma extiende
 * `Error`, y sin la comprobación un `{ colisionDeIdentidad: true }` pelado pasaría tipado como
 * tal: quien después leyera su `.message` recibiría `undefined`.
 */
export function esColisionDeIdentidad(error: unknown): error is ErrorDeColisionDeIdentidad {
  if (!(error instanceof Error) || !('colisionDeIdentidad' in error)) {
    return false;
  }

  return error.colisionDeIdentidad === true;
}
