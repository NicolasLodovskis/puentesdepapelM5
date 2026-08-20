'use client';

import { useActionState } from 'react';

import type { Libro } from '@/lib/db/tipos';

import { edicionDeLibro } from '../acciones-libro';
import type { MensajesPorCampo, ResultadoEdicion } from '../mensajes';
import { TEXTO_GUARDAR_EDICION, TITULO_EDICION } from '../mensajes';

/**
 * Formulario de edición de un libro (FR-03 a FR-06), en la vista de detalle.
 *
 * Mismo patrón que `formulario-alta.tsx`: un Client Component con `useActionState`, campos no
 * controlados y un mensaje por campo que no se pierde entre envíos. La diferencia es que acá los
 * campos **arrancan con el valor vigente del libro** (`defaultValue`), porque se está corrigiendo
 * un dato que ya existe y no cargando uno nuevo.
 *
 * `required`, `maxLength`, `min` y `max` son comodidad, nunca la barrera (mitigación 7): la
 * validación que cuenta es la del repositorio de edición, porque el HTML lo puede alterar
 * cualquiera.
 *
 * Cada campo va envuelto en su propio `data-operacion`, el mismo anclaje que usaba el `<li>`
 * estático que este formulario reemplaza: así AC-01 —«el detalle ofrece las operaciones de FR-03 a
 * FR-06»— queda anclado a un control real y no a una lista decorativa.
 */

const LARGO_MAXIMO_TEXTO = 300;

const STOCK_MINIMO = 0;
const STOCK_MAXIMO = 1000000;

/** `null` es el estado antes del primer envío, no un rechazo: por eso se modela acá y no en el tipo. */
function mensajesDe(estado: ResultadoEdicion | null): MensajesPorCampo {
  return estado !== null ? estado.mensajes : {};
}

/** El aviso de arriba del formulario: el fallo que no es de ningún campo (infraestructura). */
function avisoDe(estado: ResultadoEdicion | null): string {
  return estado !== null ? (estado.general ?? '') : '';
}

interface PropsCamposDeEdicion {
  libro: Libro;
  estado: ResultadoEdicion | null;
  enviarEdicion: (datos: FormData) => void;
  enviando: boolean;
}

/**
 * El marcado del formulario, sin estado propio.
 *
 * Separado del componente que llama al hook por la misma razón que `CamposDeAlta`: poder
 * renderizarlo con un estado ya rechazado, que es la mitad de AC-05/AC-08/AC-09 que vive en la
 * pantalla y no en el repositorio.
 */
export function CamposDeEdicion({ libro, estado, enviarEdicion, enviando }: PropsCamposDeEdicion) {
  const mensajes = mensajesDe(estado);
  const aviso = avisoDe(estado);

  return (
    <form action={enviarEdicion} className="edicion">
      <h2>{TITULO_EDICION}</h2>

      {/* El identificador viaja oculto, validado igual que el de la venta (M1). */}
      <input type="hidden" name="id" value={String(libro.id)} />

      <p className="aviso error" aria-live="polite">
        {aviso}
      </p>

      <div data-operacion="titulo">
        <label htmlFor="edicion-titulo">Título</label>
        <input
          id="edicion-titulo"
          name="titulo"
          type="text"
          defaultValue={libro.titulo}
          required
          maxLength={LARGO_MAXIMO_TEXTO}
        />
        <p className="error-de-campo">{mensajes.titulo}</p>
      </div>

      <div data-operacion="editorial">
        <label htmlFor="edicion-editorial">Editorial</label>
        <input
          id="edicion-editorial"
          name="editorial"
          type="text"
          defaultValue={libro.editorial}
          required
          maxLength={LARGO_MAXIMO_TEXTO}
        />
        <p className="error-de-campo">{mensajes.editorial}</p>
      </div>

      <div data-operacion="stock">
        <label htmlFor="edicion-stock">Stock</label>
        <input
          id="edicion-stock"
          name="stock"
          type="number"
          defaultValue={libro.stock}
          required
          min={STOCK_MINIMO}
          max={STOCK_MAXIMO}
          step={1}
        />
        <p className="error-de-campo">{mensajes.stock}</p>
      </div>

      <div data-operacion="precio">
        <label htmlFor="edicion-precio">Precio</label>
        {/* `text` y no `number`, mismo motivo que el alta: el precio se escribe como en la vida
            real y un campo numérico del navegador rechazaría la coma antes de que el servidor
            pueda explicar el motivo (AC-05). */}
        <input
          id="edicion-precio"
          name="precio"
          type="text"
          inputMode="decimal"
          defaultValue={String(libro.precio)}
          required
        />
        <p className="error-de-campo">{mensajes.precio}</p>
      </div>

      {/* Bloqueado mientras la edición viaja: dos clicks seguidos serían dos ediciones. */}
      <button type="submit" data-edicion="guardar" disabled={enviando}>
        {enviando ? 'Guardando…' : TEXTO_GUARDAR_EDICION}
      </button>
    </form>
  );
}

interface PropsFormularioEdicion {
  libro: Libro;
}

export function FormularioEdicion({ libro }: PropsFormularioEdicion) {
  // El estado arranca en `null`: nadie envió nada todavía. De ahí en más sólo puede ser un
  // rechazo, porque el éxito redirige (M3) antes de que hubiera algo que devolver.
  const [estado, enviarEdicion, enviando] = useActionState<ResultadoEdicion | null, FormData>(
    edicionDeLibro,
    null,
  );

  return (
    <CamposDeEdicion
      libro={libro}
      estado={estado}
      enviarEdicion={enviarEdicion}
      enviando={enviando}
    />
  );
}
