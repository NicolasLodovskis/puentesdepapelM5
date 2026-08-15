import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * La guardia del barrido de mutaciones: **cada test que el barrido cita existe en la suite**.
 *
 * `test/convenciones/barrido-de-mutaciones.md` es lo más valioso que dejó el bloque 4 —dice, por
 * cada mutación de una línea, qué test se pone rojo— y hasta acá era prosa: borrar o renombrar un
 * test citado dejaba el archivo mintiendo, sin que nada se pusiera rojo. Un contrato que nadie
 * comprueba es un comentario, y es el estándar que este ticket le aplicó a todo lo demás.
 *
 * **Los nombres se le preguntan a Vitest**, no se deducen del fuente: los describes se arman con
 * plantillas (`convenciones de ${relativo} (M9)`) y los `it.each` interpolan la ruta del módulo, así
 * que la única lista fiel de nombres es la que recolecta el propio runner. Se invoca `vitest list`,
 * que **colecta sin ejecutar**: importa las suites, registra los tests y no corre ningún cuerpo, de
 * modo que esta guardia no se dispara a sí misma.
 */

const BARRIDO = 'test/convenciones/barrido-de-mutaciones.md';

/** El separador con el que Vitest arma el nombre completo, y el que distingue una cita del resto. */
const SEPARADOR = ' > ';

/** Los nombres completos de los tests recolectados, preguntados a Vitest. */
function testsRecolectados(): string[] {
  const salida = execFileSync(
    process.execPath,
    [path.join('node_modules', 'vitest', 'vitest.mjs'), 'list', '--json'],
    { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  return (JSON.parse(salida) as Array<{ name: string }>).map(({ name }) => name);
}

/**
 * Los nombres de test que el barrido cita.
 *
 * La regla es una sola y está escrita en el propio archivo: **un tramo entre acentos graves que
 * contenga ` > ` es un nombre de test**, porque los nombres se citan siempre con su describe
 * adelante. Los saltos de línea se colapsan —el archivo envuelve a 100 columnas— así que una cita
 * partida en dos líneas sigue siendo la misma cita.
 */
function citasDelBarrido(texto: string): string[] {
  // Los bloques de código y los tramos de doble acento grave se sacan **antes**: un fence abierto
  // desemparejaría todos los acentos que vienen después, y con el emparejado corrido las citas de
  // media tabla dejaban de verse (medido: 15 de 33) sin que nada avisara. Es el mismo modo de fallar
  // que el despeje de comentarios cierra en las guardias que leen código.
  const prosa = texto.replace(/```[\s\S]*?```/gu, ' ').replace(/``[\s\S]*?``/gu, ' ');

  return Array.from(prosa.matchAll(/`([^`]+)`/gu), (encontrada) =>
    encontrada[1].replace(/\s+/gu, ' ').trim(),
  ).filter((cita) => cita.includes(SEPARADOR));
}

/**
 * Las citas del barrido, leídas **dentro** de cada test y no al recolectar.
 *
 * Si el archivo se leyera en el cuerpo del `describe`, su ausencia rompería la recolección de esta
 * suite —y, con ella, la del `vitest list` que corre acá adentro—. Leerlo dentro del test deja el
 * fallo donde se entiende: un test rojo que nombra el archivo que falta.
 */
function citas(): string[] {
  return citasDelBarrido(fs.readFileSync(path.join(process.cwd(), BARRIDO), 'utf8'));
}

describe('el barrido de mutaciones es un contrato y no un comentario', () => {
  it('cita tests, y son muchos', () => {
    // Meta-guardia de la extracción: con la lista vacía —o corta— la exigencia de abajo pasaría sin
    // haber comparado nada, que es exactamente el silencio que este archivo existe para no repetir.
    // El barrido tiene más de treinta puntos y casi todos nombran su rojo.
    expect(citas().length).toBeGreaterThan(25);
    expect(new Set(citas()).size).toBeGreaterThan(20);
  });

  it('cada test que cita existe en la suite recolectada', () => {
    // Sin esto, borrar o renombrar un test citado deja el barrido afirmando que una mutación se
    // caza cuando ya no la caza nadie. Con esto, el rojo aparece del lado correcto: el que renombra
    // el test se entera de que hay un contrato que lo nombra.
    const recolectados = new Set(testsRecolectados());

    expect(recolectados.size).toBeGreaterThan(100);
    expect(
      citas().filter((cita) => !recolectados.has(cita)),
      `${BARRIDO} cita tests que la suite no recolecta`,
    ).toEqual([]);
  });
});
