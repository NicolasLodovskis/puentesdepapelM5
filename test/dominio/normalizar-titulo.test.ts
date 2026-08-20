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

/**
 * FR-10 / AC-13: la puntuación final no es parte de la identidad.
 *
 * Antes de FEAT-001b el patrón del artículo pospuesto exigía que el artículo cerrara el texto
 * y la puntuación se quitaba *después*, así que `"Principito, El."` entraba al catálogo como
 * `"principito el"`: otra clave `UNIQUE` para el mismo libro, y el duplicado pasaba. El recorte
 * del final ocurre ahora **antes** de buscar el artículo.
 *
 * **Los tres últimos tests de este describe no agregan cobertura**: son documentación por
 * proximidad. Los tres bordes ya estaban cubiertos en este mismo archivo antes de FEAT-001b, y
 * ahí sigue estando la red de verdad:
 *
 * - `'¿?'` → `''` en `:78`, dentro de "devuelve cadena vacía ante una cadena vacía".
 * - `', El'` → `'el'` en `:82`, en su propio test.
 * - `'Casa, La de Bernarda'` → `'casa la de bernarda'` en `:71`; es la línea que la propia
 *   spec-FEAT-001b señala como la que se pone roja si alguien le saca el `$` al patrón.
 *
 * Están repetidos acá porque son los tres bordes que el recorte del final podía romper y la
 * lista de tests obligatorios del bloque los nombra: quien venga a mover el recorte los tiene
 * al lado del caso que lo motivó, en vez de tres archivos de distancia. Borrar estos tres no
 * bajaría la cobertura; borrar los de `:71`, `:78` y `:82` sí.
 */
describe('normalizarTitulo() — puntuación al final del título (AC-13)', () => {
  it('da la misma identidad para "Principito, El." que para "El Principito" (AC-13)', () => {
    expect(normalizarTitulo('Principito, El.')).toBe('el principito');
    expect(normalizarTitulo('Principito, El.')).toBe(normalizarTitulo('El Principito'));
  });

  it('da la misma identidad para \'"Principito, El"\' entrecomillado que para "El Principito" (AC-13)', () => {
    // El pegado de Excel: la celda llega envuelta en comillas dobles. La comilla de cierre
    // separaba al artículo del final del texto y con eso se perdía el reordenamiento.
    expect(normalizarTitulo('"Principito, El"')).toBe('el principito');
    expect(normalizarTitulo('"Principito, El"')).toBe(normalizarTitulo('El Principito'));
  });

  it('da la misma identidad para "Principito, El ." con espacio antes del punto (AC-13)', () => {
    // `plegarTexto()` recorta los extremos pero no colapsa los espacios internos, así que acá
    // el artículo queda separado del final por un espacio **y** un punto: el recorte se lleva
    // los dos. Un recorte de sólo puntuación deja este caso igual de roto que antes.
    expect(normalizarTitulo('Principito, El .')).toBe('el principito');
    expect(normalizarTitulo('Principito, El .')).toBe(normalizarTitulo('El Principito'));
  });

  it('conserva el borde de un título sin letras ni dígitos: identidad vacía (AC-13)', () => {
    // Sad path del que depende el rechazo de `lib/db/libros.ts` y el
    // `CHECK (length(titulo_normalizado) >= 1)` del esquema: recortar el final no puede
    // convertir `"¿?"` en otra cosa que la cadena vacía, ni hacerlo lanzar.
    expect(() => normalizarTitulo('¿?')).not.toThrow();
    expect(normalizarTitulo('¿?')).toBe('');
  });

  it('conserva el borde de un título que sólo es su artículo pospuesto (AC-13)', () => {
    // El recorte del final no puede comerse la coma que necesita el reordenamiento cuando no
    // hay título delante.
    expect(normalizarTitulo(', El')).toBe('el');
  });

  it('no reordena "Casa, La de Bernarda": el patrón sigue anclado al final (AC-13)', () => {
    // Arreglo prohibido nº 1: quitarle el `$` a `ARTICULO_POSPUESTO` cerraría AC-13 y movería
    // al frente el artículo intermedio, dejando `'la casa'`. La aserción que lo detecta es la
    // de `:71`, que ya existía; ésta es la misma, puesta al lado del recorte que la pone en
    // juego.
    expect(normalizarTitulo('Casa, La de Bernarda')).toBe('casa la de bernarda');
  });
});
