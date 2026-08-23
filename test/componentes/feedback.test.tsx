// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { Feedback } from '@/app/componentes/ui/feedback';

// Mismo motivo que en `campo-texto.test.tsx`: sin este `afterEach`, los `render()` de cada `it`
// se acumulan en el mismo `document` y `getByRole('status')` encuentra más de uno.
afterEach(cleanup);

/**
 * `Feedback` es un Client Component controlado enteramente por props (ADR-001): no decide su
 * propio estado, así que estos tests sólo confirman que el `role="status"` aparece cuando toca y
 * que el `mensaje` sale como texto — nunca como marcado inyectado (mitigación 1 del threat model
 * FEAT-002a).
 */
describe('Feedback', () => {
  it('con estado="inactivo" no renderiza ningún role="status"', () => {
    render(<Feedback estado="inactivo" mensaje="no debería verse" />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['cargando', 'exito', 'error'] as const)(
    'con estado="%s" renderiza role="status" con aria-live="polite" y el mensaje como texto',
    (estado) => {
      render(<Feedback estado={estado} mensaje="Guardado con éxito" />);

      const region = screen.getByRole('status');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveTextContent('Guardado con éxito');
    },
  );

  it('el archivo fuente no usa dangerouslySetInnerHTML ni innerHTML', () => {
    // Guardia puntual pedida explícitamente por la spec (Block 3), además del guardia global
    // de `test/app/acciones.test.ts` que ya barre todo `app/` — belt and suspenders sobre el
    // primer Client Component del proyecto que muestra un mensaje controlado por props.
    const fuente = readFileSync(
      path.join(process.cwd(), 'app/componentes/ui/feedback.tsx'),
      'utf8',
    );

    expect(fuente).not.toContain('dangerouslySetInnerHTML');
    expect(fuente).not.toContain('innerHTML');
  });
});
