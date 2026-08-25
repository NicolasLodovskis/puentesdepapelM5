'use client';

import { useActionState } from 'react';

import { asignarFoto, quitarFoto } from '../acciones-libro';
import type { MensajesPorCampo, ResultadoAsignarFoto } from '../mensajes';
import { TEXTO_CAMBIAR_FOTO, TEXTO_QUITAR_FOTO, TITULO_PORTADA } from '../mensajes';
import { BotonEnvio } from './ui/boton-envio';
import { Feedback } from './ui/feedback';

/**
 * Gestión de la foto de portada desde el detalle de un libro (FR-02, FR-03).
 *
 * Mismo patrón que `formulario-edicion.tsx`: un Client Component con `useActionState` para el
 * formulario que puede rechazar por campo (`asignarFoto`). El segundo formulario —quitar la
 * foto— no lleva el hook: `quitarFoto()` no valida ningún campo más que el id, así que es una
 * operación binaria, igual que la venta (`ventaDeLibro()` en el detalle). Por eso usa `BotonEnvio`
 * (FEAT-002b Block 1/5): es la única forma de mostrar estado de carga en un formulario cuya
 * acción es `Promise<void>` sin `useActionState`.
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

interface PropsCamposDePortada {
  id: number;
  tienePortada: boolean;
  estado: ResultadoAsignarFoto | null;
  enviarFoto: (datos: FormData) => void;
  enviando: boolean;
}

/**
 * El marcado de los dos formularios, sin estado propio.
 *
 * Separado del componente que llama al hook por la misma razón que `CamposDeEdicion`
 * (`formulario-edicion.tsx`, Block 4): poder renderizarlo con un `estado` ya fijado, sin invocar
 * `asignarFoto()` de verdad — así se puede testear el mapeo a `Feedback` en aislamiento.
 */
export function CamposDePortada({
  id,
  tienePortada,
  estado,
  enviarFoto,
  enviando,
}: PropsCamposDePortada) {
  const mensajes = mensajesDe(estado);
  const aviso = avisoDe(estado);

  return (
    <section data-operacion="portada" aria-labelledby="portada">
      <h2 id="portada" className="mb-2 text-lg font-semibold text-texto">
        {TITULO_PORTADA}
      </h2>

      <form action={enviarFoto} className="asignar-portada flex flex-col gap-3">
        {/* El identificador viaja oculto, validado igual que el de la venta y la edición (M1/M19). */}
        <input type="hidden" name="id" value={String(id)} />

        <Feedback
          estado={enviando ? 'cargando' : estado?.ok === false ? 'error' : 'inactivo'}
          mensaje={aviso}
        />

        <input
          type="file"
          name="foto"
          accept="image/*"
          className="text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        />
        <p className="error-de-campo">{mensajes.foto}</p>

        {/* Bloqueado mientras la foto viaja: dos clicks seguidos serían dos asignaciones. */}
        <button
          type="submit"
          data-portada="cambiar"
          disabled={enviando}
          className="inline-block rounded bg-texto px-4 py-2 text-center font-medium text-fondo hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        >
          {enviando ? 'Guardando…' : TEXTO_CAMBIAR_FOTO}
        </button>
      </form>

      {tienePortada ? (
        <form action={quitarFoto} className="quitar-portada mt-3">
          <input type="hidden" name="id" value={String(id)} />
          <BotonEnvio
            type="submit"
            data-portada="quitar"
            textoEnviando="Quitando…"
            className="inline-block rounded border border-borde bg-fondo px-4 py-2 text-center font-medium text-texto hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
          >
            {TEXTO_QUITAR_FOTO}
          </BotonEnvio>
        </form>
      ) : null}
    </section>
  );
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

  return (
    <CamposDePortada
      id={id}
      tienePortada={tienePortada}
      estado={estado}
      enviarFoto={enviarFoto}
      enviando={enviando}
    />
  );
}
