// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Primer test del entorno de componentes (Block 2). No prueba lógica de producto: prueba que el
 * pragma `@vitest-environment jsdom` por archivo efectivamente activa un DOM real (`document`,
 * `window`) para este archivo, y que los matchers de `@testing-library/jest-dom` quedan
 * disponibles — sin tocar `vitest.config.ts`, que sigue fijando `environment: 'node'` para todo
 * lo demás (NFR-02).
 */
describe('entorno de test de componentes (jsdom aislado por archivo)', () => {
  it('renderiza un elemento trivial y lo encuentra con matchers de jest-dom', () => {
    render(<div>hola entorno</div>);

    expect(screen.getByText('hola entorno')).toBeInTheDocument();
  });
});
