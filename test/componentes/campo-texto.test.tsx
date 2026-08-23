// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CampoTexto } from '@/app/componentes/ui/campo-texto';

// El setup global de Vitest (`test/ayudas/entorno.ts`, Block 2) no registra el `afterEach` de
// limpieza de Testing Library porque los tests fuera de `test/componentes/` no usan jsdom: cada
// archivo de este entorno se hace cargo de su propia limpieza entre tests.
afterEach(cleanup);

/**
 * `CampoTexto` es el par `<label htmlFor>` + `<input>` compartido (ADR-001, Block 3). El
 * `htmlFor` tiene que coincidir con el `id` del input para que un lector de pantalla anuncie la
 * etiqueta al enfocar el campo, y el resto de los atributos nativos (`placeholder`, `maxLength`,
 * etc.) tienen que llegar al `<input>` sin que este componente los reescriba.
 */
describe('CampoTexto', () => {
  it('el label referencia el id del input', () => {
    render(<CampoTexto id="buscar" label="Buscar" />);

    const input = screen.getByLabelText('Buscar');
    expect(input).toHaveAttribute('id', 'buscar');
  });

  it('pasa placeholder y maxLength por props hasta el input', () => {
    render(
      <CampoTexto id="buscar" label="Buscar" placeholder="Título o editorial" maxLength={50} />,
    );

    const input = screen.getByLabelText('Buscar');
    expect(input).toHaveAttribute('placeholder', 'Título o editorial');
    expect(input).toHaveAttribute('maxlength', '50');
  });
});
