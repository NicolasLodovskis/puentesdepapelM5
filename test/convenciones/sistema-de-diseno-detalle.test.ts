import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guardia de convención del sistema de diseño en la pantalla de detalle (FEAT-002b, AC-01).
 *
 * Cada superficie del detalle tiene que usar al menos uno de los tokens compartidos de
 * `app/globals.css` (`text-texto`, `bg-fondo`, `border-borde`) o la clase de foco visible
 * (`focus-visible:outline-foco`) en su propio fuente, en vez de definir paleta o foco propios —
 * es la misma estrategia de NFR-01 que ya declara el spec: reutilizar, no reinventar.
 *
 * **Un `describe`/`it` por archivo, a propósito.** Block 3 sólo puede afirmar sobre `page.tsx`
 * (sección de venta, ya con clases del Block 2, cerrado) y sobre `detalle-libro.tsx` (este
 * bloque) — mirar hacia adelante a `formulario-edicion.tsx`/`formulario-portada.tsx`, que
 * todavía no tienen sus cambios, sería una dependencia hacia bloques que no corrieron. Block 4 y
 * Block 5 **extienden este mismo archivo** agregando su propio `it` cuando les toca, en vez de
 * crear uno nuevo: la lista de tokens y el criterio ("al menos uno") quedan en un solo lugar.
 */

const RAIZ = process.cwd();

/** Los tokens del sistema de diseño (FEAT-002a) que cualquier superficie del detalle puede usar. */
const TOKENES_COMPARTIDOS = ['text-texto', 'bg-fondo', 'border-borde', 'focus-visible:outline-foco'];

/** Lee el fuente crudo de un archivo del proyecto, relativo a la raíz. */
function fuenteDe(relativo: string): string {
  return fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
}

/** ¿Aparece en el fuente al menos uno de los tokens compartidos? */
function usaAlgunTokenCompartido(fuente: string): boolean {
  return TOKENES_COMPARTIDOS.some((token) => fuente.includes(token));
}

describe('sistema de diseño del detalle: tokens compartidos (FEAT-002b, AC-01)', () => {
  it('el detector de tokens compartidos distingue presencia de ausencia', () => {
    // Meta-guardia: si `usaAlgunTokenCompartido()` devolviera siempre `true`, los dos `it` de
    // abajo pasarían aunque nadie hubiera tocado ninguna clase.
    expect(usaAlgunTokenCompartido('<p className="text-texto">Hola</p>')).toBe(true);
    expect(usaAlgunTokenCompartido('<p className="p-4 rounded">Hola</p>')).toBe(false);
  });

  it('app/libros/[id]/page.tsx (sección de venta, Block 2) usa al menos un token compartido', () => {
    const fuente = fuenteDe(path.join('app', 'libros', '[id]', 'page.tsx'));

    expect(usaAlgunTokenCompartido(fuente)).toBe(true);
  });

  it('app/componentes/detalle-libro.tsx usa al menos un token compartido (Block 3)', () => {
    const fuente = fuenteDe(path.join('app', 'componentes', 'detalle-libro.tsx'));

    expect(usaAlgunTokenCompartido(fuente)).toBe(true);
  });

  it('app/componentes/formulario-edicion.tsx usa al menos un token compartido (Block 4)', () => {
    const fuente = fuenteDe(path.join('app', 'componentes', 'formulario-edicion.tsx'));

    expect(usaAlgunTokenCompartido(fuente)).toBe(true);
  });
});
