import { PRECIO_MAXIMO, PRECIO_MINIMO } from './constantes';

/** Por qué se rechazó un precio. Cada motivo se traduce a un mensaje distinto en la UI. */
export type MotivoPrecio =
  'ausente' | 'no_numerico' | 'decimal' | 'separador_miles' | 'fuera_de_rango';

/** Resultado de interpretar un precio: unión discriminada por `ok`. */
export type ResultadoPrecio = { ok: true; valor: number } | { ok: false; motivo: MotivoPrecio };

/**
 * Grupos de tres dígitos separados por punto o coma: `1.234`, `1,234`, `1.234.567`,
 * `1.234,50`. El grupo repetido tiene ancho fijo (`\d{3}`), así que cada repetición
 * consume exactamente cuatro caracteres y no hay retroceso ambiguo (riesgo R12).
 *
 * La bandera `u` no cambia nada acá —el patrón es puro ASCII— pero la llevan los cuatro
 * patrones de este módulo y los tres de `normalizar-titulo.ts`: en ese otro módulo `\p{L}`
 * la exige, y tenerla en todos evita que la asimetría se lea como intencional.
 */
const SEPARADOR_DE_MILES = /^-?\d{1,3}([.,]\d{3})+([.,]\d+)?$/u;

/**
 * Entero, con signo opcional. El `-` entra en el patrón a propósito: un negativo **es**
 * numérico, sólo está fuera de rango, y reportarlo como `no_numerico` sería informar un
 * motivo falso (Principio II).
 */
const ENTERO = /^-?\d+$/u;

/** Decimal con punto o coma. El signo queda dentro del primer grupo para no perderlo. */
const DECIMAL = /^(-?\d+)[.,](\d+)$/u;

/** Parte decimal que no aporta valor: `,0`, `,00`, `,000`. */
const SOLO_CEROS = /^0+$/u;

/**
 * Aplica el rango del esquema (`precio > 0`) y el techo de representación exacta, y
 * devuelve ya el `ResultadoPrecio`: no es un predicado, aunque el rango sea lo que decide.
 */
function validarRango(valor: number): ResultadoPrecio {
  if (valor < PRECIO_MINIMO || valor > PRECIO_MAXIMO) {
    return { ok: false, motivo: 'fuera_de_rango' };
  }

  return { ok: true, valor };
}

/**
 * Interpreta el precio que escribió la usuaria y devuelve un entero, o el motivo exacto
 * por el que no se puede interpretar (FR-03, AC-04, AC-05).
 *
 * Las reglas se evalúan **en este orden**:
 *
 * 1. vacío, `null` o `undefined` → `ausente`;
 * 2. separador de miles → `separador_miles`;
 * 3. entero → el entero, si cae en rango;
 * 4. decimal: si la parte decimal es toda ceros, el entero; si no, `decimal` **sin
 *    redondear**;
 * 5. cualquier otra cosa → `no_numerico`.
 *
 * La regla 2 va antes que la 4 porque `1.234` es ambiguo —¿mil doscientos treinta y
 * cuatro, o uno con doscientos treinta y cuatro?— y elegir una lectura sería adivinar
 * (RF-31e, Principio II). No lanza nunca: el rechazo es un valor de retorno.
 */
export function parsearPrecio(valor: string | number | null | undefined): ResultadoPrecio {
  if (valor === null || valor === undefined) {
    return { ok: false, motivo: 'ausente' };
  }

  // Un `number` se pasa por el mismo camino que el texto en vez de tener reglas propias:
  // así `1234.5` cae en `decimal` igual que `"1234,5"`, y `NaN`, `Infinity` y la notación
  // científica quedan en `no_numerico` sin ninguna rama especial.
  const texto = (typeof valor === 'number' ? String(valor) : valor).trim();

  if (texto === '') {
    return { ok: false, motivo: 'ausente' };
  }

  if (SEPARADOR_DE_MILES.test(texto)) {
    return { ok: false, motivo: 'separador_miles' };
  }

  if (ENTERO.test(texto)) {
    return validarRango(Number(texto));
  }

  const decimal = DECIMAL.exec(texto);
  if (decimal !== null) {
    const [, parteEntera, parteDecimal] = decimal;

    if (SOLO_CEROS.test(parteDecimal)) {
      return validarRango(Number(parteEntera));
    }

    return { ok: false, motivo: 'decimal' };
  }

  return { ok: false, motivo: 'no_numerico' };
}
