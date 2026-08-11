import { describe, expect, it } from 'vitest';

import { plegarTexto } from '@/lib/dominio/plegar-texto';

describe('plegarTexto()', () => {
  it('quita los diacríticos de á é í ó ú y ü', () => {
    expect(plegarTexto('Ávila')).toBe('avila');
    expect(plegarTexto('PINGÜINO')).toBe('pinguino');
    expect(plegarTexto('Éxodo')).toBe('exodo');
    expect(plegarTexto('Ítaca')).toBe('itaca');
    expect(plegarTexto('Óptica')).toBe('optica');
    expect(plegarTexto('Último')).toBe('ultimo');
  });

  it('preserva la eñe: la ñ es una letra, no un acento', () => {
    // Plancharla haría que "El sueño" y "El sueno" fueran el mismo libro.
    expect(plegarTexto('El sueño')).toBe('el sueño');
    expect(plegarTexto('El sueño')).not.toBe('el sueno');
    expect(plegarTexto('MAÑANA')).toBe('mañana');
  });

  it('recorta los extremos y pasa a minúsculas sin tocar los espacios internos', () => {
    expect(plegarTexto('   Rayuela   ')).toBe('rayuela');
    expect(plegarTexto('El  Principito')).toBe('el  principito');
  });

  it('pliega también la forma descompuesta, y ahí tampoco pierde la ñ', () => {
    // Las entradas van escritas con escapes `\u` y NO con el carácter compuesto, a
    // propósito: son la única cobertura de la rama `normalize('NFC')` de `plegarTexto()`.
    // Escritas como bytes crudos, cualquier editor, filtro de git o copiar-pegar que
    // normalizara el archivo a NFC las volvería duplicados de los tests de arriba: el
    // suite seguiría verde y esa rama quedaría sin cubrir sin que nadie se enterara.
    //
    // "A" + acento combinante U+0301, que es lo que producen algunos teclados y pegados.
    expect(plegarTexto('A\u0301vila')).toBe('avila');
    // "a" + "n" + tilde combinante U+0303 + "o" = "año": la ñ compuesta sobrevive.
    expect(plegarTexto('an\u0303o')).toBe('año');
  });

  it('devuelve cadena vacía ante una entrada vacía o de sólo espacios, sin lanzar', () => {
    expect(plegarTexto('')).toBe('');
    expect(plegarTexto('   ')).toBe('');
  });
});
