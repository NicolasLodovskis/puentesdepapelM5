'use client';

interface PropsFeedback {
  estado: 'inactivo' | 'cargando' | 'exito' | 'error';
  mensaje?: string;
}

/**
 * Client Component controlado enteramente por props (ADR-001): no llama a los hooks
 * `useActionState`/`useFormStatus` de React acá adentro — eso lo decide quien lo use
 * (FEAT-002b/FEAT-002c), sin imponerle a ese sub-ticket una estructura de formulario particular.
 *
 * `mensaje` es siempre texto curado por quien llama a este componente, nunca el error crudo de
 * infraestructura (mitigación 3 del threat model FEAT-002a), y se renderiza como children de
 * JSX — texto plano, nunca insertado como marcado (mitigación 1). La prohibición se escribe sin
 * nombrar la propiedad de React, mismo criterio que `ListadoLibros`: el guardia de
 * `test/app/acciones.test.ts` (y el test puntual de este bloque) buscan ese nombre en el fuente
 * crudo, comentarios incluidos.
 */
export function Feedback({ estado, mensaje }: PropsFeedback) {
  if (estado === 'inactivo') {
    // Sin estado que anunciar, no hay nada que renderizar: no existe un "inactivo" visible.
    return null;
  }

  return (
    <p role="status" aria-live="polite" data-estado={estado} className="text-texto">
      {mensaje}
    </p>
  );
}
