import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import LayoutRaiz, { metadata } from '@/app/layout';

describe('app/layout.tsx', () => {
  it('renderiza el documento raíz en español', () => {
    // Los hijos van como tercer argumento, no como prop (regla react/no-children-prop).
    const html = renderToStaticMarkup(createElement(LayoutRaiz, null, null));

    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<body>');
  });

  it('declara el título de la aplicación', () => {
    expect(metadata.title).toBe('Puentes de Papel');
  });
});
