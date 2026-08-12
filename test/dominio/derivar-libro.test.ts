import type Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import type { EntradaLibro } from '@/lib/db/libros';
import type { ColumnasDerivadas } from '@/lib/dominio/derivar-libro';
import { derivarLibro } from '@/lib/dominio/derivar-libro';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';

/**
 * Tests de la derivación compartida (FR-10, spec-FEAT-001b Block 1).
 *
 * `derivarLibro()` es el **único** productor de `titulo_normalizado`, `titulo_orden` y
 * `editorial_normalizada`. Los valores esperados van todos como literales y ninguna aserción
 * llama a `normalizarTitulo()` ni a `plegarTexto()` para armar lo que espera: cruzar la función
 * contra las mismas dos funciones que la implementan es escribir de nuevo su cuerpo, y una
 * regresión de la normalización se llevaría las dos mitades del cruce a la vez, dejando el test
 * verde. Los literales afirman **cuál** es la identidad correcta.
 *
 * Y el test del alta interviene el módulo con un centinela: con valores legítimos, un
 * `crearLibro()` que volviera a derivar en línea daría exactamente los mismos, así que la
 * igualdad no distingue delegar de coincidir.
 */

/**
 * Las cinco columnas TEXT que el `INSERT` del alta ata por posición: las **tres** derivadas más
 * `titulo` y `editorial`, que son sus dos fuentes y no son derivadas.
 *
 * Las dos fuentes se leen a propósito, no de relleno: van adyacentes a las derivadas en el
 * `INSERT` y es lo que hace visible un cruce de binds —un `titulo_orden` escrito en `titulo`—
 * que mirando sólo las tres derivadas pasaría inadvertido.
 */
const SQL_COLUMNAS_DERIVADAS = `
  SELECT titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada
    FROM libros
   WHERE id = ?
`;

/**
 * Título y editorial con las tres columnas derivadas que les corresponden, como literales.
 *
 * Los cuatro casos están elegidos para que los tres valores esperados difieran entre sí: el
 * artículo pospuesto separa `titulo_normalizado` de `titulo_orden`, y los diacríticos y la
 * puntuación separan lo plegado de la entrada. `'El Aleph'` no serviría —normaliza y pliega los
 * dos a `'el aleph'`— y un cruce de columnas pasaría inadvertido.
 */
const CASOS: ReadonlyArray<readonly [string, string, string, string, string]> = [
  ['El Principito', 'Emecé', 'el principito', 'el principito', 'emece'],
  ['Principito, El.', 'Emecé', 'el principito', 'principito, el.', 'emece'],
  [
    'Casa de los espíritus, La',
    'Sudamericana',
    'la casa de los espiritus',
    'casa de los espiritus, la',
    'sudamericana',
  ],
  ['¿Quién  soy?', 'Ávila', 'quien soy', '¿quien  soy?', 'avila'],
];

/**
 * La entrada de un alta, con el tipo del repositorio anotado: si `EntradaLibro` gana un campo
 * obligatorio, el error sale acá y no repartido por cada sitio de llamada.
 */
function entradaDeAlta(titulo: string, editorial: string): EntradaLibro {
  return { titulo, editorial, stock: '3', precio: '1200' };
}

describe('derivarLibro()', () => {
  it('produce las tres columnas derivadas de un libro (FR-10)', () => {
    expect(derivarLibro('Principito, El', 'Emecé')).toEqual({
      tituloNormalizado: 'el principito',
      tituloOrden: 'principito, el',
      editorialNormalizada: 'emece',
    });
  });

  it.each(CASOS)(
    'deriva "%s" / "%s" en "%s", "%s" y "%s"',
    (titulo, editorial, tituloNormalizado, tituloOrden, editorialNormalizada) => {
      expect(derivarLibro(titulo, editorial)).toEqual({
        tituloNormalizado,
        tituloOrden,
        editorialNormalizada,
      });
    },
  );

  it('da la misma identidad a un título que sólo difiere en la puntuación final (AC-13)', () => {
    const identidad = (titulo: string): string => derivarLibro(titulo, 'Emecé').tituloNormalizado;

    // El literal es lo que hace falsable a las tres: una derivación que devolviera siempre la
    // misma constante pasaría la igualdad entre pares sin haber normalizado nada.
    expect(identidad('El Principito')).toBe('el principito');
    expect(identidad('Principito, El.')).toBe('el principito');
    expect(identidad('"Principito, El"')).toBe('el principito');
    expect(identidad('Principito, El .')).toBe('el principito');
  });

  it('devuelve identidad vacía ante un título vacío, sin lanzar', () => {
    // Cadena vacía es exactamente lo que espera el rechazo de `crearLibro()` y el
    // `CHECK (length(titulo_normalizado) >= 1)` del esquema. No lanza: una función pura que
    // lanza obliga a envolverla en `try` y el motivo del rechazo se pierde por el camino.
    expect(() => derivarLibro('', '')).not.toThrow();
    expect(derivarLibro('', '')).toEqual({
      tituloNormalizado: '',
      tituloOrden: '',
      editorialNormalizada: '',
    });
    expect(derivarLibro('¿?', 'Sur').tituloNormalizado).toBe('');
  });
});

describe('crearLibro() y la derivación compartida', () => {
  it('almacena en cada columna el valor derivado que le corresponde (FR-10)', async () => {
    const { crearLibro } = await import('@/lib/db/libros');
    const db: Database.Database = baseDePrueba();

    try {
      const resultado = crearLibro(entradaDeAlta('Principito, El.', 'Emecé'), db);

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      // Los cinco valores como literales, y leídos de la base y no del objeto devuelto: es lo
      // único que cubre los bind del `INSERT`. El título lleva el punto final que AC-13 saca de
      // la identidad y que `titulo_orden` conserva, así que las tres derivadas difieren entre sí.
      expect(db.prepare(SQL_COLUMNAS_DERIVADAS).get(resultado.libro.id)).toEqual({
        titulo: 'Principito, El.',
        titulo_normalizado: 'el principito',
        titulo_orden: 'principito, el.',
        editorial: 'Emecé',
        editorial_normalizada: 'emece',
      });
    } finally {
      db.close();
    }
  });

  it('obtiene las tres columnas de derivarLibro() y no las calcula por su cuenta (FR-10)', async () => {
    // Con valores legítimos, un `crearLibro()` que siguiera derivando en línea pasaría el test de
    // arriba sin haber consumido el módulo. El centinela es lo que distingue delegar de
    // coincidir: estas tres cadenas no las produce ninguna normalización.
    //
    // La base se abre **antes** del `doMock`: si abrirla fallara con el mock ya registrado, el
    // `finally` no correría y `derivarLibro` quedaría interceptado para el resto del archivo.
    const db: Database.Database = baseDePrueba();

    try {
      vi.resetModules();
      vi.doMock('@/lib/dominio/derivar-libro', () => ({
        derivarLibro: (): ColumnasDerivadas => ({
          tituloNormalizado: 'centinela identidad',
          tituloOrden: 'centinela orden',
          editorialNormalizada: 'centinela editorial',
        }),
      }));

      const { crearLibro } = await import('@/lib/db/libros');
      const resultado = crearLibro(entradaDeAlta('El Aleph', 'Sur'), db);

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;

      expect(db.prepare(SQL_COLUMNAS_DERIVADAS).get(resultado.libro.id)).toEqual({
        titulo: 'El Aleph',
        titulo_normalizado: 'centinela identidad',
        titulo_orden: 'centinela orden',
        editorial: 'Sur',
        editorial_normalizada: 'centinela editorial',
      });
    } finally {
      db.close();
      vi.doUnmock('@/lib/dominio/derivar-libro');
      vi.resetModules();
    }
  });
});
