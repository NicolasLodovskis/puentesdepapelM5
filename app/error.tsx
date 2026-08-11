'use client';

import { useEffect } from 'react';

import { MENSAJE_ERROR_DE_PANTALLA } from './mensajes';

/**
 * Límite de error de la ruta.
 *
 * Lo que llega acá es un fallo de infraestructura —típicamente `buscarLibros()` cuando la base
 * no se puede leer—, y el mensaje del motor nombra tablas, columnas y códigos. **No se muestra
 * nada de eso** (mitigación 8, riesgo R10): la pantalla dice qué pasó en castellano y el
 * detalle va al log del navegador, donde lo lee quien mantiene la instalación y no la usuaria.
 */

interface PropsError {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorDeRuta({ error, reset }: PropsError) {
  useEffect(() => {
    // En un efecto y no en el cuerpo del renderizado: durante el renderizado del servidor no
    // corre, así que el detalle no se escribe dos veces ni se filtra al HTML que se sirve.
    console.error('Falló el renderizado del catálogo.', error);
  }, [error]);

  return (
    <main className="pantalla">
      <h1>{MENSAJE_ERROR_DE_PANTALLA}</h1>
      <p>
        Volvé a intentar. Si el problema sigue, hay que revisar la instalación y el archivo de la
        base de datos.
      </p>
      <button type="button" onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
