import { describe, expect, it } from 'vitest';

import { normalizarTitulo } from '@/lib/dominio/normalizar-titulo';

/**
 * Los nueve artículos del español pospuestos, con la identidad que les corresponde.
 *
 * La tabla se recorre con `it.each` y no con un `for` dentro de un `it`: así cada caso es
 * un test con nombre propio y, cuando falla uno, el reporte dice qué artículo falló en vez
 * de sólo el número de línea.
 */
const ARTICULOS_POSPUESTOS: ReadonlyArray<readonly [string, string]> = [
  ['Principito, El', 'el principito'],
  ['Casa de los espíritus, La', 'la casa de los espiritus'],
  ['Miserables, Los', 'los miserables'],
  ['Flores del mal, Las', 'las flores del mal'],
  ['Mundo feliz, Un', 'un mundo feliz'],
  ['Habitación propia, Una', 'una habitacion propia'],
  ['Cuentos, Unos', 'unos cuentos'],
  ['Ruinas circulares, Unas', 'unas ruinas circulares'],
  ['Absurdo, Lo', 'lo absurdo'],
];

/**
 * Artículos de otros idiomas: no se reordenan. Acertar en un idioma y equivocarse en otro
 * es peor que no tocar nada (Principio II).
 */
const ARTICULOS_DE_OTROS_IDIOMAS: ReadonlyArray<readonly [string, string]> = [
  ['Hobbit, The', 'hobbit the'],
  ['Petit Prince, Le', 'petit prince le'],
  ['Zauberberg, Der', 'zauberberg der'],
];

describe('normalizarTitulo()', () => {
  it('da el mismo valor para "Principito, El" y "El Principito" (AC-03)', () => {
    expect(normalizarTitulo('Principito, El')).toBe('el principito');
    expect(normalizarTitulo('El Principito')).toBe('el principito');
    expect(normalizarTitulo('Principito, El')).toBe(normalizarTitulo('El Principito'));
  });

  it('da valores distintos para "El Aleph" y "Aleph": el artículo se mueve, no se borra', () => {
    expect(normalizarTitulo('El Aleph')).toBe('el aleph');
    expect(normalizarTitulo('Aleph')).toBe('aleph');
    expect(normalizarTitulo('El Aleph')).not.toBe(normalizarTitulo('Aleph'));
  });

  it('quita la puntuación y colapsa los espacios', () => {
    expect(normalizarTitulo('¿Quién  soy?')).toBe('quien soy');
    expect(normalizarTitulo('  ¡Rayuela!  ')).toBe('rayuela');
  });

  it.each(ARTICULOS_POSPUESTOS)(
    'reordena el artículo pospuesto de "%s" y da "%s"',
    (titulo, esperado) => {
      expect(normalizarTitulo(titulo)).toBe(esperado);
    },
  );

  it.each(ARTICULOS_DE_OTROS_IDIOMAS)(
    'no reordena "%s": sólo son artículos los nueve del español',
    (titulo, esperado) => {
      expect(normalizarTitulo(titulo)).toBe(esperado);
    },
  );

  it('deja el artículo antepuesto donde está, aunque el título traiga una coma', () => {
    // La coma intermedia no dispara el reordenamiento: el patrón está anclado en `$`, así
    // que sólo reconoce el artículo cuando cierra el título. El antepuesto no se duplica
    // ni se mueve.
    expect(normalizarTitulo('La casa, de Bernarda')).toBe('la casa de bernarda');
    expect(normalizarTitulo('Casa, La de Bernarda')).toBe('casa la de bernarda');
  });

  it('devuelve cadena vacía ante una cadena vacía, sin lanzar', () => {
    expect(normalizarTitulo('')).toBe('');
    expect(normalizarTitulo('   ')).toBe('');
    // Puntuación sola tampoco lanza: queda vacío y lo rechaza el CHECK del esquema.
    expect(normalizarTitulo('¿?')).toBe('');
  });

  it('reordena el artículo pospuesto aunque el título sólo sea ese artículo', () => {
    expect(normalizarTitulo(', El')).toBe('el');
  });
});
