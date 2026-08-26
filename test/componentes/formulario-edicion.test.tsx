// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CamposDeEdicion } from '@/app/componentes/formulario-edicion';
import type { ResultadoEdicion } from '@/app/mensajes';
import type { Libro } from '@/lib/db/tipos';

// Mismo motivo que en `feedback.test.tsx`/`campo-texto.test.tsx`: sin este `afterEach`, los
// `render()` de cada `it` se acumulan en el mismo `document` y `getByRole('status')` encuentra
// más de uno.
afterEach(cleanup);

const LIBRO: Libro = {
  id: 7,
  titulo: 'Rayuela',
  tituloNormalizado: 'rayuela',
  tituloOrden: 'rayuela',
  editorial: 'Sudamericana',
  editorialNormalizada: 'sudamericana',
  stock: 4,
  precio: 9500,
  estado: 'activo',
  creadoEn: '2026-08-11T00:00:00.000Z',
};

/**
 * `CamposDeEdicion` es el sub-componente sin estado propio de `FormularioEdicion` (el que arma
 * el `useActionState` es difícil de testear en aislamiento porque dispara la Server Action real):
 * recibe `estado`/`enviando`/`enviarEdicion` por props, así que estos tests pasan los valores que
 * cada caso necesita sin invocar `edicionDeLibro()`.
 */
describe('CamposDeEdicion (FEAT-002b Block 4)', () => {
  it('con estado=null (sin envío) no renderiza ningún role="status" — mapeo a "inactivo"', () => {
    const { container } = render(
      <CamposDeEdicion libro={LIBRO} estado={null} enviando={false} enviarEdicion={() => {}} />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // La versión anterior renderizaba siempre `<p className="aviso error" aria-live="polite">`,
    // incluso vacío; con `Feedback` mapeado a 'inactivo' no se renderiza ningún elemento de aviso
    // (Feedback devuelve `null`) — sin esto, la aserción de arriba pasaría igual contra el
    // `<p>` sin `role` que existía antes de este bloque.
    expect(container.querySelector('[aria-live="polite"]')).not.toBeInTheDocument();
  });

  it('con un envío en curso (enviando=true) muestra role="status" con el mensaje vigente (FR-03)', () => {
    const estado: ResultadoEdicion = { ok: false, mensajes: {}, general: 'Reintentando…' };

    render(
      <CamposDeEdicion libro={LIBRO} estado={estado} enviando={true} enviarEdicion={() => {}} />,
    );

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('data-estado', 'cargando');
    expect(region).toHaveTextContent('Reintentando…');
  });

  it('con un estado de rechazo (ok: false) muestra role="status" con ese texto exacto (FR-04)', () => {
    const estado: ResultadoEdicion = { ok: false, mensajes: {}, general: 'texto curado' };

    render(
      <CamposDeEdicion libro={LIBRO} estado={estado} enviando={false} enviarEdicion={() => {}} />,
    );

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('data-estado', 'error');
    expect(region).toHaveTextContent('texto curado');
  });

  it('los 4 campos se renderizan vía CampoTexto (div.campo-texto) con su label y su defaultValue desde libro (FEAT-002c Block 3)', () => {
    const { container } = render(
      <CamposDeEdicion libro={LIBRO} estado={null} enviando={false} enviarEdicion={() => {}} />,
    );

    // `CampoTexto` es la única fuente del repo que envuelve label+input en un
    // `<div className="campo-texto">`; el marcado manual que reemplaza este bloque no lo tenía.
    // Sin esto, el test pasaría igual contra el `<label>+<input>` a mano que existía antes de
    // este bloque, porque `getByLabelText` no distingue quién renderizó el par.
    expect(container.querySelectorAll('[data-operacion] .campo-texto')).toHaveLength(4);

    expect(screen.getByLabelText('Título')).toHaveValue(LIBRO.titulo);
    expect(screen.getByLabelText('Editorial')).toHaveValue(LIBRO.editorial);
    expect(screen.getByLabelText('Stock')).toHaveValue(LIBRO.stock);
    expect(screen.getByLabelText('Precio')).toHaveValue(String(LIBRO.precio));
  });
});
