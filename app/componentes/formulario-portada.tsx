'use client';

import { useActionState } from 'react';

import { asignarFoto, quitarFoto } from '../acciones-libro';
import type { MensajesPorCampo, ResultadoAsignarFoto } from '../mensajes';
import { TEXTO_CAMBIAR_FOTO, TEXTO_QUITAR_FOTO, TITULO_PORTADA } from '../mensajes';

/**
 * Gestión de la foto de portada desde el detalle de un libro (FR-02, FR-03).
 *
 * Mismo patrón que `formulario-edicion.tsx`: un Client Component con `useActionState` para el
 * formulario que puede rechazar por campo (`asignarFoto`). El segundo formulario —quitar la
 * foto— no lleva el hook: `quitarFoto()` no valida ningún campo más que el id, así que es una
 * operación binaria, igual que la venta (`ventaDeLibro()` en el detalle).
 *
 * El botón "Quitar foto" sólo se renderiza cuando `tienePortada` es `true`: quitar una foto que
 * no existe no tiene sentido para la usuaria y evita un viaje al servidor que sólo puede
 * terminar en no-op.
 */

/** `null` es el estado antes del primer envío, no un rechazo. */
function mensajesDe(estado: ResultadoAsignarFoto | null): MensajesPorCampo {
  return estado !== null ? estado.mensajes : {};
}

/** El aviso de arriba del formulario: el fallo que no es de ningún campo (infraestructura). */
function avisoDe(estado: ResultadoAsignarFoto | null): string {
  return estado !== null ? (estado.general ?? '') : '';
}

interface PropsFormularioPortada {
  id: number;
  tienePortada: boolean;
}

export function FormularioPortada({ id, tienePortada }: PropsFormularioPortada) {
  // El estado arranca en `null`: nadie envió nada todavía. De ahí en más sólo puede ser un
  // rechazo, porque el éxito redirige (M3) antes de que hubiera algo que devolver.
  const [estado, enviarFoto, enviando] = useActionState<ResultadoAsignarFoto | null, FormData>(
    asignarFoto,
    null,
  );
  const mensajes = mensajesDe(estado);
  const aviso = avisoDe(estado);

  return (
    <section data-operacion="portada" aria-labelledby="portada">
      <h2 id="portada">{TITULO_PORTADA}</h2>

      <form action={enviarFoto} className="asignar-portada">
        {/* El identificador viaja oculto, validado igual que el de la venta y la edición (M1/M19). */}
        <input type="hidden" name="id" value={String(id)} />

        <p className="aviso error" aria-live="polite">
          {aviso}
        </p>

        <input type="file" name="foto" accept="image/*" />
        <p className="error-de-campo">{mensajes.foto}</p>

        {/* Bloqueado mientras la foto viaja: dos clicks seguidos serían dos asignaciones. */}
        <button type="submit" data-portada="cambiar" disabled={enviando}>
          {enviando ? 'Guardando…' : TEXTO_CAMBIAR_FOTO}
        </button>
      </form>

      {tienePortada ? (
        <form action={quitarFoto}>
          <input type="hidden" name="id" value={String(id)} />
          <button type="submit" data-portada="quitar">
            {TEXTO_QUITAR_FOTO}
          </button>
        </form>
      ) : null}
    </section>
  );
}
