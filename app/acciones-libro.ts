'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';

import { editarLibro } from '@/lib/db/edicion';
import type { ResultadoEditar, ResultadoVender } from '@/lib/db/errores';
import { venderEjemplar } from '@/lib/db/ventas';

import {
  identificadorDeLibro,
  MENSAJE_ERROR_DE_EDICION,
  MENSAJE_ERROR_DE_VENTA,
  type MensajesPorCampo,
  mensajeDeCampo,
  mensajeDeConflicto,
  type ResultadoEdicion,
  rutaDelDetalle,
} from './mensajes';

/**
 * Server Actions de un libro: la venta (FR-02) y la edición (FR-03 a FR-06).
 *
 * **Este módulo exporta únicamente funciones async.** Un archivo `'use server'` no puede exportar
 * constantes: si lo hace, la aplicación falla al invocar el formulario desde el click del botón
 * (`AGENTS.md`, Code conventions). Los literales, las rutas y la validación del identificador viven
 * en `./mensajes`, que es el módulo que puede importar cualquier superficie de `app/`. `export type`
 * sería legal —se borra al compilar—, pero acá no hace falta ninguno, igual que en `./acciones`.
 *
 * Esto **es** una superficie HTTP: Next.js despacha el Server Action como un `POST` identificado por
 * el header `Next-Action`, sin pasar por la pantalla. Lo que el formulario no manda, un `POST` a mano
 * sí puede mandarlo, y lo que la pantalla impide —vender un libro sin ejemplares— lo tiene que
 * impedir el servidor por su cuenta: acá no se confía en un solo campo del `FormData` más que en el
 * identificador, y ése se valida. No hay autenticación, por decisión de producto (PRD-001 §6): los
 * controles que la reemplazan son el bind a `127.0.0.1` y la validación de `Origin` que Next.js
 * aplica por defecto y que este proyecto no relaja (mitigaciones 1 y 6 de FEAT-001a).
 */

/**
 * Confirma la venta de un ejemplar del libro (FR-02, FR-07, FR-08, AC-02).
 *
 * **Termina siempre en una señal de navegación, nunca devolviendo un valor.** Eso es la mitigación
 * M3 (riesgo R4): después de un `POST` que escribe, la respuesta es una redirección, así que el
 * reenvío del navegador —F5, el botón atrás, el doble click— no puede repetir la venta. Una venta
 * repetida no se puede deshacer (riesgo aceptado A3), y por eso el control de la fila del listado
 * tampoco escribe: sólo lleva al detalle, donde vive esta confirmación (AC-17).
 *
 * Del `FormData` se lee **un solo campo**, el identificador, y se lo valida con la misma función que
 * usa la ruta del detalle (M1). Todo lo demás que la venta necesita —el precio y el stock vigentes—
 * sale de la base dentro de la transacción (M2, M4): los campos de más se ignoran, así que un `POST`
 * armado a mano no puede fijar a qué precio se vendió.
 */
export async function ventaDeLibro(datos: FormData): Promise<void> {
  const id = identificadorDeLibro(datos.get('id'));

  if (id === undefined) {
    // 404 sin tocar la base, y el mismo 404 que un libro que no existe: la respuesta no distingue
    // "no es un id" de "no está" (riesgo R2).
    notFound();
  }

  let resultado: ResultadoVender;

  try {
    resultado = venderEjemplar(id);
  } catch (error) {
    // Fallo de infraestructura, no una condición de negocio. Se registra —si no, nadie se
    // enteraría— pero **sin el contenido del formulario**: un `console.error(…, datos)` es el
    // `POST` copiado al disco, y `String(formData)` no lo delata (lo vigila el test de M8).
    //
    // Lo que sube es un texto curado y no el error del motor, que nombra tablas, columnas y la
    // ruta del archivo de la base (M8, riesgo R7). La usuaria ve el límite de error de la ruta:
    // el texto curado alimenta el log y el digest, no la pantalla —ver el docstring de
    // `MENSAJE_ERROR_DE_VENTA`—.
    console.error('Falló una venta por un problema de infraestructura.', error);

    throw new Error(MENSAJE_ERROR_DE_VENTA);
  }

  if (!resultado.ok) {
    if (resultado.motivo === 'libro_inexistente') {
      notFound();
    }

    // Stock 0: no se escribió nada (AC-03) y se vuelve al detalle, que es donde está el motivo. El
    // mensaje lo deriva la pantalla del stock vigente y no de un parámetro de la URL, así que no se
    // puede fabricar desde el navegador ni queda pegado en un enlace compartido.
    //
    // **Sin `revalidatePath` a propósito**, y no por olvido: este camino no escribió nada, así que
    // no hay nada que invalidar. La única forma de que el detalle se sirviera de caché con el stock
    // anterior —y volviera a ofrecer el botón que el servidor acaba de rechazar— sería que el stock
    // hubiese llegado a 0 por un camino que **sí** revalida las dos rutas (la venta de más abajo), o
    // por una escritura hecha fuera de la aplicación. Revalidar acá taparía ese caso marginal a
    // cambio de que `revalidatePath` deje de significar "esto escribió", que es lo que hace legible
    // el rastro cuando aparezcan más operaciones.
    //
    // > **Compromiso para todo escritor de stock que venga después** —empezando por la edición
    // > manual del bloque siguiente—: **revalidar las dos rutas, `/` y la del detalle.** Este
    // > razonamiento se apoya en que todos lo hagan. Un escritor nuevo que revalide una sola —la
    // > cicatriz que dejó el alta— crea el caso marginal que hoy no existe: el detalle servido de
    // > caché con stock viejo, ofreciendo un botón que el servidor rechaza, y este comentario
    // > pasaría a ser falso sin que nada se ponga rojo.
    redirect(rutaDelDetalle(id));
  }

  // Sin esto, la venta se registra y las dos pantallas siguen mostrando el stock anterior. Van las
  // **dos** rutas: el alta ya dejó la cicatriz de revalidar una sola.
  revalidatePath('/');
  revalidatePath(rutaDelDetalle(id));

  redirect(rutaDelDetalle(id));
}

/**
 * Edita título, editorial, stock y precio de un libro (FR-03 a FR-06, FR-09).
 *
 * Firma de `useActionState` —`(estadoPrevio, datos) => ResultadoEdicion`—, igual que
 * `altaDeLibro()`: el formulario de edición necesita mostrar el motivo exacto por campo sin perder
 * lo que la usuaria escribió, y eso exige el hook. `estadoPrevio` no se lee, por la misma razón que
 * en el alta: el resultado de una edición no depende de la anterior.
 *
 * **Tras el éxito, la acción redirige (M3), igual que la venta**, y no vuelve un `ResultadoEdicion`
 * de éxito: `redirect()` interrumpe la ejecución antes de que hubiera algo que devolver, así que el
 * reenvío del navegador no puede repetir la edición.
 *
 * El identificador viaja en un campo oculto del formulario y se valida con la misma función que la
 * venta y la ruta del detalle (M1). Los otros cuatro campos los valida `editarLibro()`, que es quien
 * conoce las reglas: acá sólo se traduce su rechazo estructurado a un mensaje para la usuaria.
 */
export async function edicionDeLibro(
  estadoPrevio: ResultadoEdicion | null,
  datos: FormData,
): Promise<ResultadoEdicion> {
  const id = identificadorDeLibro(datos.get('id'));

  if (id === undefined) {
    notFound();
  }

  let resultado: ResultadoEditar;

  try {
    resultado = editarLibro(id, {
      titulo: datos.get('titulo'),
      editorial: datos.get('editorial'),
      stock: datos.get('stock'),
      precio: datos.get('precio'),
    });
  } catch (error) {
    // Fallo de infraestructura, no una condición de negocio. Se registra —sin el contenido del
    // formulario, mismo criterio que la venta (M8)— y se devuelve el mensaje genérico: acá no se
    // redirige, porque el formulario sigue en pantalla y es donde tiene que verse el aviso.
    console.error('Falló una edición por un problema de infraestructura.', error);

    return { ok: false, mensajes: {}, general: MENSAJE_ERROR_DE_EDICION };
  }

  if (!resultado.ok) {
    if (resultado.motivo === 'libro_inexistente') {
      notFound();
    }

    if (resultado.motivo === 'titulo_duplicado') {
      // El conflicto es de identidad del título, así que el mensaje va al lado de ese campo
      // (AC-09, AC-14), igual que en el alta.
      return { ok: false, mensajes: { titulo: mensajeDeConflicto(resultado.conflicto) } };
    }

    const mensajes: MensajesPorCampo = {};

    for (const error of resultado.errores) {
      mensajes[error.campo] = mensajeDeCampo(error);
    }

    return { ok: false, mensajes };
  }

  // Sin esto, la edición se guarda y las dos pantallas siguen mostrando los datos anteriores.
  revalidatePath('/');
  revalidatePath(rutaDelDetalle(id));

  redirect(rutaDelDetalle(id));
}
