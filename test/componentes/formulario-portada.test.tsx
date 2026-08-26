// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CamposDePortada, FormularioPortada } from '@/app/componentes/formulario-portada';
import type { ResultadoAsignarFoto } from '@/app/mensajes';

/**
 * `quitarFoto()` es `Promise<void>` sin `useActionState` (spec Block 5, mismo criterio que
 * `ventaDeLibro()` en `boton-envio.test.tsx`/`page.tsx`, Block 2): para testear "en contexto" el
 * botón real de `FormularioPortada` sin depender de infraestructura ni de una foto real, se
 * reemplaza el módulo entero de Server Actions por una versión controlada por el test. `asignarFoto`
 * no se ejercita en este archivo (eso lo cubre `CamposDePortada`, sin estado propio, más abajo), así
 * que basta con un `vi.fn()` que nunca resuelve en un estado real.
 *
 * `vi.mock` se hoistea por encima de los imports de arriba (transformación de Vitest): el mock
 * queda instalado antes de que `formulario-portada.tsx` resuelva su propio import de
 * `asignarFoto`/`quitarFoto`, así que no hace falta un import diferido.
 */
const referenciaAccionQuitar = vi.hoisted(() => ({
  accion: (_datos: FormData): Promise<void> => Promise.resolve(),
}));

vi.mock('@/app/acciones-libro', () => ({
  asignarFoto: vi.fn(async () => null),
  quitarFoto: (datos: FormData) => referenciaAccionQuitar.accion(datos),
}));

// Mismo motivo que en `feedback.test.tsx`/`formulario-edicion.test.tsx`: sin este `afterEach`, los
// `render()` de cada `it` se acumulan en el mismo `document`.
afterEach(cleanup);

/** Promesa que el propio test controla, para simular una Server Action que todavía no resolvió. */
function crearDeferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

/**
 * `CamposDePortada` es el sub-componente sin estado propio de `FormularioPortada` (mismo patrón
 * que `CamposDeEdicion`, Block 4): recibe `estado`/`enviando`/`enviarFoto` por props, así que
 * estos tests pasan los valores que cada caso necesita sin invocar `asignarFoto()` de verdad.
 *
 * **Decisión de testeo (asunción declarada):** el spec pedía evaluar si introducir esta separación
 * hacía falta. Se introduce acá por el mismo motivo que en el Block 4 — es la única forma de fijar
 * `estado`/`enviando` sin pasar por `useActionState` real — y mantiene el mismo criterio entre los
 * dos formularios del detalle, en vez de inventar un segundo mecanismo de testeo para este bloque.
 */
describe('CamposDePortada (FEAT-002b Block 5)', () => {
  it('el campo de foto tiene un label accesible "Foto de portada" (FEAT-002c Block 4, NFR-01)', () => {
    render(
      <CamposDePortada
        id={7}
        tienePortada={false}
        estado={null}
        enviando={false}
        enviarFoto={() => {}}
      />,
    );

    // `selector: 'input'` es necesario: sin él, `getByLabelText` también matchea la
    // `<section aria-labelledby="portada">` que envuelve todo el formulario (Testing Library no
    // restringe `aria-labelledby` a controles de formulario), lo que daría un falso positivo
    // aunque el `<input>` de foto no tuviera ningún label propio.
    expect(screen.getByLabelText('Foto de portada', { selector: 'input' })).toBeInTheDocument();
  });

  it('con estado=null (sin envío) no renderiza ningún role="status" — mapeo a "inactivo"', () => {
    const { container } = render(
      <CamposDePortada
        id={7}
        tienePortada={false}
        estado={null}
        enviando={false}
        enviarFoto={() => {}}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // La versión anterior renderizaba siempre `<p className="aviso error" aria-live="polite">`,
    // incluso vacío; con `Feedback` mapeado a 'inactivo' no se renderiza ningún elemento de aviso.
    expect(container.querySelector('[aria-live="polite"]')).not.toBeInTheDocument();
  });

  it('con un envío en curso (enviando=true) muestra role="status" con el mensaje vigente (FR-03)', () => {
    const estado: ResultadoAsignarFoto = { ok: false, mensajes: {}, general: 'Guardando…' };

    render(
      <CamposDePortada
        id={7}
        tienePortada={false}
        estado={estado}
        enviando={true}
        enviarFoto={() => {}}
      />,
    );

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('data-estado', 'cargando');
    expect(region).toHaveTextContent('Guardando…');
  });

  it('con un estado de rechazo (ok: false) muestra role="status" con ese texto exacto (FR-04)', () => {
    const estado: ResultadoAsignarFoto = { ok: false, mensajes: {}, general: 'texto curado' };

    render(
      <CamposDePortada
        id={7}
        tienePortada={false}
        estado={estado}
        enviando={false}
        enviarFoto={() => {}}
      />,
    );

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('data-estado', 'error');
    expect(region).toHaveTextContent('texto curado');
  });
});

/**
 * El botón "Quitar foto" (mismo patrón que `boton-envio.test.tsx`, Block 1, aplicado en contexto
 * acá): se renderiza `FormularioPortada` completo, con `quitarFoto()` reemplazado por una promesa
 * que el test controla, y se observa el `disabled` del botón real mientras esa promesa no resuelve.
 */
describe('FormularioPortada — botón "quitar foto" (FEAT-002b Block 5)', () => {
  it('queda disabled mientras su <form> está pendiente y se rehabilita al resolver (FR-03)', async () => {
    const { promesa, resolver } = crearDeferida<void>();
    referenciaAccionQuitar.accion = () => promesa;

    render(<FormularioPortada id={7} tienePortada={true} />);

    const boton = screen.getByRole('button', { name: /quitar foto/iu });
    expect(boton).not.toBeDisabled();

    await act(async () => {
      boton.click();
    });

    expect(boton).toBeDisabled();

    await act(async () => {
      resolver();
      await promesa;
    });

    expect(boton).not.toBeDisabled();
  });
});
