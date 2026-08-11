import { describe, expect, it } from 'vitest';

import { parsearPrecio } from '@/lib/dominio/parsear-precio';

/**
 * `MAX_SAFE_INTEGER + 2`, como texto: `9007199254740993`.
 *
 * Se escribe el literal y no la expresión porque `Number.MAX_SAFE_INTEGER + 2` ya se
 * evalúa con la imprecisión que este test quiere ejercitar. `Number()` sobre este texto
 * devuelve `…992` —el vecino representable, que es `MAX_SAFE_INTEGER + 1`—, y ése es el
 * valor que queda por encima de `PRECIO_MAXIMO` y dispara `fuera_de_rango`.
 */
const ENTERO_NO_REPRESENTABLE = '9007199254740993';

describe('parsearPrecio()', () => {
  it('acepta el entero y el decimal de ceros como el mismo entero (AC-04)', () => {
    expect(parsearPrecio('1234')).toEqual({ ok: true, valor: 1234 });
    expect(parsearPrecio('1234,00')).toEqual({ ok: true, valor: 1234 });
    expect(parsearPrecio('1234.0')).toEqual({ ok: true, valor: 1234 });
    expect(parsearPrecio('  1234  ')).toEqual({ ok: true, valor: 1234 });
  });

  it('devuelve decimal y no redondea cuando hay parte fraccionaria (AC-05)', () => {
    expect(parsearPrecio('1234,50')).toEqual({ ok: false, motivo: 'decimal' });
    expect(parsearPrecio('1234.99')).toEqual({ ok: false, motivo: 'decimal' });
    expect(parsearPrecio('1234,001')).toEqual({ ok: false, motivo: 'decimal' });
  });

  it('devuelve separador_miles antes que decimal, porque 1.234 es ambiguo (AC-05)', () => {
    expect(parsearPrecio('1.234,50')).toEqual({ ok: false, motivo: 'separador_miles' });
    expect(parsearPrecio('1.234')).toEqual({ ok: false, motivo: 'separador_miles' });
    expect(parsearPrecio('1,234')).toEqual({ ok: false, motivo: 'separador_miles' });
    expect(parsearPrecio('1.234.567')).toEqual({ ok: false, motivo: 'separador_miles' });
  });

  it('distingue no_numerico de ausente (AC-05)', () => {
    expect(parsearPrecio('abc')).toEqual({ ok: false, motivo: 'no_numerico' });
    expect(parsearPrecio('$1234')).toEqual({ ok: false, motivo: 'no_numerico' });
    expect(parsearPrecio('12 34')).toEqual({ ok: false, motivo: 'no_numerico' });
    expect(parsearPrecio('1,2,3')).toEqual({ ok: false, motivo: 'no_numerico' });

    expect(parsearPrecio('')).toEqual({ ok: false, motivo: 'ausente' });
    expect(parsearPrecio('   ')).toEqual({ ok: false, motivo: 'ausente' });
    expect(parsearPrecio(null)).toEqual({ ok: false, motivo: 'ausente' });
    expect(parsearPrecio(undefined)).toEqual({ ok: false, motivo: 'ausente' });
  });

  it('devuelve fuera_de_rango para 0 y para los negativos, no no_numerico', () => {
    expect(parsearPrecio('0')).toEqual({ ok: false, motivo: 'fuera_de_rango' });
    expect(parsearPrecio('-5')).toEqual({ ok: false, motivo: 'fuera_de_rango' });
    expect(parsearPrecio('0,00')).toEqual({ ok: false, motivo: 'fuera_de_rango' });
    expect(parsearPrecio('-5,00')).toEqual({ ok: false, motivo: 'fuera_de_rango' });
  });

  it('acepta un number y trata NaN, Infinity y la notación científica como no numéricos', () => {
    expect(parsearPrecio(1234)).toEqual({ ok: true, valor: 1234 });
    expect(parsearPrecio(1234.5)).toEqual({ ok: false, motivo: 'decimal' });
    expect(parsearPrecio(0)).toEqual({ ok: false, motivo: 'fuera_de_rango' });
    expect(parsearPrecio(Number.NaN)).toEqual({ ok: false, motivo: 'no_numerico' });
    expect(parsearPrecio(Number.POSITIVE_INFINITY)).toEqual({ ok: false, motivo: 'no_numerico' });
    expect(parsearPrecio(1e21)).toEqual({ ok: false, motivo: 'no_numerico' });
  });

  it('acepta el entero más grande que se representa con exactitud', () => {
    expect(parsearPrecio(String(Number.MAX_SAFE_INTEGER))).toEqual({
      ok: true,
      valor: Number.MAX_SAFE_INTEGER,
    });
  });

  it('rechaza como fuera_de_rango el entero que ya no se representa con exactitud', () => {
    expect(parsearPrecio(ENTERO_NO_REPRESENTABLE)).toEqual({
      ok: false,
      motivo: 'fuera_de_rango',
    });
  });
});
