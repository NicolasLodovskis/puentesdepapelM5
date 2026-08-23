// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Buscador, PARAMETRO_BUSQUEDA } from '@/app/componentes/buscador';

// El setup global (`test/ayudas/entorno.ts`, Block 2) no registra limpieza de Testing Library
// para no imponerla a los tests fuera de jsdom: cada archivo de este entorno limpia lo suyo.
afterEach(cleanup);

/**
 * El buscador (Block 4) pasa a usar `CampoTexto`, el componente compartido de Block 3, para el
 * campo de búsqueda (AC-01) — sin perder ninguna de las propiedades de las que depende `?q=`
 * (FR-04): el `<form>` sigue siendo GET, sin JS de cliente, y el input conserva su `name` y su
 * `defaultValue`.
 */
describe('Buscador (Block 4: usa CampoTexto)', () => {
  it('usa el campo compartido (CampoTexto) y conserva defaultValue, method="get" y el name del parámetro', () => {
    const { container } = render(<Buscador termino="rayuela" />);

    // Marca del componente compartido: si esto no está, el campo se sigue escribiendo a mano
    // (CampoTexto envuelve su label+input en un <div className="campo-texto">).
    expect(container.querySelector('.campo-texto')).not.toBeNull();

    const input = screen.getByLabelText('Buscar por título o editorial') as HTMLInputElement;
    expect(input).toHaveValue('rayuela');
    expect(input).toHaveAttribute('name', PARAMETRO_BUSQUEDA);

    const form = input.closest('form');
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/');
  });
});
