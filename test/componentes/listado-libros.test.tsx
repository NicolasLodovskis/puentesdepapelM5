import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ListadoLibros } from '@/app/componentes/listado-libros';
import { Boton } from '@/app/componentes/ui/boton';
import { rutaDelDetalle, TEXTO_VENDER } from '@/app/mensajes';
import type { Libro } from '@/lib/db/tipos';

/**
 * Test estructural, sin jsdom: `renderToStaticMarkup` alcanza para afirmar el HTML de las celdas.
 *
 * Block 4 reemplaza el `<a>` escrito a mano de las celdas "Ver"/"Vender" por `<Boton as="a"
 * href={...}>` (ADR-001), con el mismo `href` y el mismo texto — y sin volverse un `<button>`,
 * que rompería AC-17 (la venta no se dispara a un click).
 */
const LIBRO: Libro = {
  id: 11,
  titulo: 'Ficciones',
  tituloNormalizado: 'ficciones',
  tituloOrden: 'ficciones',
  editorial: 'Emecé',
  editorialNormalizada: 'emece',
  stock: 5,
  precio: 3000,
  estado: 'activo',
  creadoEn: '2026-01-01T00:00:00.000Z',
};

function celda(html: string, campo: string): string {
  const patron = new RegExp(`<td[^>]*data-campo="${campo}"[^>]*>([\\s\\S]*?)</td>`, 'u');
  const encontrado = patron.exec(html);

  if (encontrado === null) {
    throw new Error(`No se encontró ninguna celda con data-campo="${campo}".`);
  }

  return encontrado[1];
}

function ancla(celdaHtml: string): { href: string; clase: string; texto: string } {
  const patron = /<a[^>]*href="([^"]*)"[^>]*class="([^"]*)"[^>]*>([^<]*)<\/a>/u;
  const encontrado = patron.exec(celdaHtml);

  if (encontrado === null) {
    throw new Error(`La celda no contiene un <a href class>: ${celdaHtml}`);
  }

  return { href: encontrado[1], clase: encontrado[2], texto: encontrado[3] };
}

describe('ListadoLibros — celdas "Ver"/"Vender" usan Boton (Block 4, ADR-001)', () => {
  it('siguen siendo <a href>, nunca <button>, con el mismo destino, el mismo texto y la clase de Boton', () => {
    const html = renderToStaticMarkup(
      createElement(ListadoLibros, {
        libros: [{ ...LIBRO, rutaPortada: '/logo-puentes-de-papel-96.jpg' }],
      }),
    );

    const celdaVer = celda(html, 'detalle');
    const celdaVender = celda(html, 'venta');

    // Nunca un <button>: AC-17 exige que la venta no se dispare a un click.
    expect(celdaVer).not.toContain('<button');
    expect(celdaVender).not.toContain('<button');

    const anclaVer = ancla(celdaVer);
    const anclaVender = ancla(celdaVender);

    expect(anclaVer.href).toBe(rutaDelDetalle(LIBRO.id));
    expect(anclaVer.texto).toBe('Ver');

    expect(anclaVender.href).toBe(rutaDelDetalle(LIBRO.id));
    expect(anclaVender.texto).toBe(TEXTO_VENDER);

    // La clase es exactamente la que `Boton` produce para un `<a>` (variante por default): así
    // el test queda atado al contrato real del componente compartido y no a un literal copiado
    // a mano, que dejaría de detectar una regresión si `Boton` cambiara sus clases.
    const claseEsperada = renderToStaticMarkup(
      <Boton as="a" href={rutaDelDetalle(LIBRO.id)}>
        Ver
      </Boton>,
    ).match(/class="([^"]*)"/u)?.[1];

    expect(claseEsperada).toBeTruthy();
    expect(anclaVer.clase).toBe(claseEsperada);
    expect(anclaVender.clase).toBe(claseEsperada);
  });
});
