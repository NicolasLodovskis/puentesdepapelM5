'use client';

import { useActionState } from 'react';

import { altaDeLibro } from '../acciones';
import type { MensajesPorCampo, ResultadoAlta } from '../mensajes';

import { Boton } from './ui/boton';
import { CampoTexto } from './ui/campo-texto';
import { Feedback } from './ui/feedback';

/**
 * Formulario de alta manual de un libro (FR-01).
 *
 * Es el **único** Client Component con estado de la pantalla, y lo es por una razón concreta:
 * sin `useActionState` no habría dónde mostrar los mensajes de rechazo, y una recarga completa
 * borraría lo que la usuaria escribió. Los campos son no controlados —React no les fija
 * `value`—, así que ante un rechazo el navegador conserva el texto tal como quedó y el
 * formulario no se vacía.
 *
 * Los atributos `required`, `maxLength`, `min` y `max` son **comodidad, nunca la barrera**
 * (mitigación 7): la validación que cuenta es la de servidor, en `crearLibro()`, porque el
 * HTML lo puede alterar cualquiera.
 */

/** Cota de los dos campos de texto, la misma que el esquema. */
const LARGO_MAXIMO_TEXTO = 300;

const STOCK_MINIMO = 0;
const STOCK_MAXIMO = 1000000;

/**
 * `null` es el estado del hook antes del primer envío, no un resultado del alta: por eso la
 * ausencia se modela acá y no como una variante de `ResultadoAlta`.
 */
function mensajesDe(estado: ResultadoAlta | null): MensajesPorCampo {
  return estado !== null && !estado.ok ? estado.mensajes : {};
}

/** El aviso de arriba del formulario: el éxito, o el fallo que no es de ningún campo. */
function avisoDe(estado: ResultadoAlta | null): string {
  if (estado === null) {
    return '';
  }

  return estado.ok ? estado.mensaje : (estado.general ?? '');
}

interface PropsCampos {
  estado: ResultadoAlta | null;
  enviarAlta: (datos: FormData) => void;
  enviando: boolean;
}

/**
 * El marcado del formulario, sin estado propio.
 *
 * Está separado del componente que llama al hook para poder renderizarlo con un estado ya
 * rechazado: `useActionState` siempre arranca del estado inicial, así que por el camino del
 * hook no hay forma de comprobar que los mensajes por campo se **muestran** —que es la mitad
 * de AC-02 que vive en la pantalla y no en el repositorio—.
 */
export function CamposDeAlta({ estado, enviarAlta, enviando }: PropsCampos) {
  const mensajes = mensajesDe(estado);
  const aviso = avisoDe(estado);

  return (
    <form action={enviarAlta} className="alta">
      <h2 className="text-lg font-semibold text-texto">Cargar un libro</h2>

      <Feedback
        estado={
          enviando
            ? 'cargando'
            : estado?.ok === true
              ? 'exito'
              : estado?.ok === false
                ? 'error'
                : 'inactivo'
        }
        mensaje={aviso}
      />

      <CampoTexto
        id="titulo"
        label="Título"
        name="titulo"
        type="text"
        required
        maxLength={LARGO_MAXIMO_TEXTO}
      />
      <p className="error-de-campo">{mensajes.titulo}</p>

      <CampoTexto
        id="editorial"
        label="Editorial"
        name="editorial"
        type="text"
        required
        maxLength={LARGO_MAXIMO_TEXTO}
      />
      <p className="error-de-campo">{mensajes.editorial}</p>

      <CampoTexto
        id="stock"
        label="Stock"
        name="stock"
        type="number"
        required
        min={STOCK_MINIMO}
        max={STOCK_MAXIMO}
        step={1}
      />
      <p className="error-de-campo">{mensajes.stock}</p>

      {/*
        `text` y no `number`: el precio se escribe como en la vida real —`1234`, `1234,00`—
        y un campo numérico del navegador rechazaría la coma antes de que el servidor pueda
        explicar el motivo del rechazo, que es justo lo que AC-05 pide informar.
      */}
      <CampoTexto
        id="precio"
        label="Precio"
        name="precio"
        type="text"
        inputMode="decimal"
        required
      />
      <p className="error-de-campo">{mensajes.precio}</p>

      {/*
        Sin `required` (FR-01: el alta sin foto sigue siendo válida). Al llevar un `<input
        type="file">`, el navegador envía el formulario como `multipart/form-data`
        automáticamente, sin que haga falta fijar `encType` a mano.
      */}
      <CampoTexto id="foto" label="Foto de portada" name="foto" type="file" accept="image/*" />
      <p className="error-de-campo">{mensajes.foto}</p>

      {/*
        Bloqueado mientras el alta viaja: dos clicks seguidos serían dos altas, y la segunda
        rebotaría por título duplicado con un error que la usuaria no provocó.
      */}
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Dar de alta'}
      </Boton>
    </form>
  );
}

export function FormularioAlta() {
  // El estado arranca en `null` —nadie envió nada todavía— y de ahí en más es el resultado del
  // último alta. Así el tipo del Server Action no tiene que declarar un caso que no existe.
  const [estado, enviarAlta, enviando] = useActionState<ResultadoAlta | null, FormData>(
    altaDeLibro,
    null,
  );

  return <CamposDeAlta estado={estado} enviarAlta={enviarAlta} enviando={enviando} />;
}
