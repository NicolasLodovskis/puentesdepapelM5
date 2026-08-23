// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Boton } from '@/app/componentes/ui/boton';

// El setup global (`test/ayudas/entorno.ts`, Block 2) no registra limpieza de Testing Library
// para no imponerla a los tests fuera de jsdom: cada archivo de este entorno limpia lo suyo.
afterEach(cleanup);

/**
 * `Boton` es el componente polimórfico fijado por ADR-001: cuando `as="a"` tiene que renderizar
 * el mismo `<a href>` sin manejadores de evento que hoy usan a mano las celdas "Ver"/"Vender" de
 * `ListadoLibros` (Block 4 lo reemplaza), y cuando `as` está ausente tiene que ser un
 * `<button type="button">` por default — nunca un botón sin `type` explícito, que dentro de un
 * `<form>` se comportaría como submit por accidente.
 */
describe('Boton', () => {
  it('con as="a" renderiza un <a href> sin atributo onClick', () => {
    render(
      <Boton as="a" href="/x">
        Ver
      </Boton>,
    );

    const enlace = screen.getByRole('link', { name: 'Ver' });
    expect(enlace).toHaveAttribute('href', '/x');
    expect(enlace).not.toHaveAttribute('onclick');
    expect(enlace.tagName).toBe('A');
  });

  it('sin as (por default) renderiza un <button type="button">', () => {
    render(<Boton>Guardar</Boton>);

    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton.tagName).toBe('BUTTON');
    expect(boton).toHaveAttribute('type', 'button');
  });
});
