'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';

import type { ResultadoVender } from '@/lib/db/errores';
import { venderEjemplar } from '@/lib/db/ventas';

import { identificadorDeLibro, MENSAJE_ERROR_DE_VENTA, rutaDelDetalle } from './mensajes';

/**
 * Server Actions de un libro: la venta (FR-02) y, con el bloque siguiente, la edición.
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
