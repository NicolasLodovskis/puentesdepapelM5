// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { BotonEnvio } from '@/app/componentes/ui/boton-envio';

// Mismo motivo que en `feedback.test.tsx`/`campo-texto.test.tsx`: sin este `afterEach`, los
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
 * `BotonEnvio` (Block 1, ADR-001 lo exceptúa) lee `useFormStatus()` del `<form>` padre: el hook
 * sólo funciona en un componente hijo del `<form>`, nunca en el mismo que lo declara — por eso
 * cada test envuelve el botón en un `<form action={...}>` real en vez de renderizarlo suelto.
 */
describe('BotonEnvio', () => {
  it('queda disabled mientras la acción del form padre está pendiente y se rehabilita al resolver', async () => {
    const { promesa, resolver } = crearDeferida<void>();
    const accion = () => promesa;

    render(
      <form action={accion}>
        <BotonEnvio>Confirmar venta</BotonEnvio>
      </form>,
    );

    const boton = screen.getByRole('button');
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

  it('renderiza cualquier data-* recibido por props', () => {
    render(
      <form action={() => Promise.resolve()}>
        <BotonEnvio data-venta="confirmar">Confirmar venta</BotonEnvio>
      </form>,
    );

    expect(screen.getByRole('button')).toHaveAttribute('data-venta', 'confirmar');
  });

  it('muestra textoEnviando en vez de children mientras pending es true, y vuelve a children al resolver', async () => {
    const { promesa, resolver } = crearDeferida<void>();
    const accion = () => promesa;

    render(
      <form action={accion}>
        <BotonEnvio textoEnviando="Vendiendo…">Confirmar venta</BotonEnvio>
      </form>,
    );

    const boton = screen.getByRole('button');
    expect(boton).toHaveTextContent('Confirmar venta');

    await act(async () => {
      boton.click();
    });

    expect(boton).toHaveTextContent('Vendiendo…');
    expect(boton).not.toHaveTextContent('Confirmar venta');

    await act(async () => {
      resolver();
      await promesa;
    });

    expect(boton).toHaveTextContent('Confirmar venta');
  });

  it('el archivo fuente no usa dangerouslySetInnerHTML ni innerHTML', () => {
    // Guardia puntual pedida explícitamente por la spec (Block 1), mismo criterio que
    // `feedback.test.tsx`.
    const fuente = readFileSync(
      path.join(process.cwd(), 'app/componentes/ui/boton-envio.tsx'),
      'utf8',
    );

    expect(fuente).not.toContain('dangerouslySetInnerHTML');
    expect(fuente).not.toContain('innerHTML');
  });
});
