'use server';

import { revalidatePath } from 'next/cache';

import type { ResultadoCrearLibro } from '@/lib/db/errores';
import { crearLibro } from '@/lib/db/libros';

import {
  MENSAJE_ALTA_EXITOSA,
  MENSAJE_ERROR_INESPERADO,
  mensajeDeCampo,
  mensajeDeConflicto,
  type MensajesPorCampo,
  type ResultadoAlta,
} from './mensajes';

/**
 * Server Actions de la pantalla principal.
 *
 * **Este módulo exporta únicamente funciones async.** Un archivo `'use server'` no puede
 * exportar constantes: si lo hace, la aplicación falla al invocar el formulario desde el
 * click del botón (`AGENTS.md`, Code conventions). Los literales viven en `./mensajes`.
 * `export type` y `export interface` sí serían legales —se borran al compilar—, pero acá no
 * hace falta ninguno: los tipos también salen de `./mensajes`.
 *
 * Aunque no haya un archivo de ruta, esto **es** una superficie HTTP: Next.js despacha el
 * Server Action como un `POST /` identificado por el header `Next-Action`. No hay
 * autenticación, por decisión de producto (PRD-001 §6): los controles que la reemplazan son
 * el bind a `127.0.0.1` y la validación de `Origin` que Next.js aplica por defecto y que este
 * proyecto no relaja (mitigaciones 1 y 6).
 */

/**
 * Da de alta un libro con lo que vino del formulario.
 *
 * El `FormData` llega del navegador y **no es confiable**: la usuaria puede alterar el HTML.
 * Esta función no valida por su cuenta y no completa nada —un campo ausente se pasa tal cual,
 * `null`, y se rechaza como vacío (Principio II)—: la barrera es la allowlist de tipo,
 * longitud y rango de `crearLibro()` (mitigación 7). Los campos de más se ignoran.
 *
 * `estadoPrevio` es el estado que `useActionState` arrastra entre envíos, y es `null` hasta el
 * primer envío. No se lee: el resultado de un alta no depende del alta anterior, y confiar en
 * él sería confiar en un valor que también viaja por la red.
 */
export async function altaDeLibro(
  estadoPrevio: ResultadoAlta | null,
  datos: FormData,
): Promise<ResultadoAlta> {
  let resultado: ResultadoCrearLibro;

  try {
    resultado = crearLibro({
      titulo: datos.get('titulo'),
      editorial: datos.get('editorial'),
      stock: datos.get('stock'),
      precio: datos.get('precio'),
    });
  } catch (error) {
    // Fallo de infraestructura, no una condición de negocio. Se registra —si no, nadie se
    // enteraría— pero **sin el contenido del formulario**: un log con el título y la
    // editorial es el formulario copiado al disco.
    console.error('Falló el alta de un libro por un problema de infraestructura.', error);

    return { ok: false, mensajes: {}, general: MENSAJE_ERROR_INESPERADO };
  }

  if (resultado.ok) {
    // Sin esto el libro queda cargado y la pantalla sigue mostrando el catálogo anterior.
    revalidatePath('/');

    return { ok: true, mensaje: MENSAJE_ALTA_EXITOSA };
  }

  if (resultado.motivo === 'titulo_duplicado') {
    // El conflicto es de identidad del título, así que el mensaje va al lado de ese campo
    // (AC-03). Nombra el libro que ya ocupa la identidad, con su editorial.
    return { ok: false, mensajes: { titulo: mensajeDeConflicto(resultado.conflicto) } };
  }

  // La mitad de AC-02 que el repositorio no puede cubrir: los mensajes por campo son
  // presentación, y `lib/db/` devuelve motivos.
  const mensajes: MensajesPorCampo = {};

  for (const error of resultado.errores) {
    mensajes[error.campo] = mensajeDeCampo(error);
  }

  return { ok: false, mensajes };
}
