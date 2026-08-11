import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ListadoLibros } from '@/app/componentes/listado-libros';
import { aplicarPragmas } from '@/lib/db/conexion';
import { buscarLibros } from '@/lib/db/consultas';
import { migrar } from '@/lib/db/migrar';
import {
  editorialDeterminista,
  sembrarCatalogo,
  tituloDeterminista,
} from '@/scripts/sembrar-catalogo';
import { DIRECTORIO_TEMPORAL } from '@/test/ayudas/base-de-prueba';

/** El tamaño de catálogo que fija NFR-01, no uno cómodo. */
const CANTIDAD = 2000;

const ITERACIONES = 100;

/** El presupuesto de AC-09, en milisegundos. */
const PRESUPUESTO_MS = 1000;

const PERCENTIL = 0.95;

/**
 * Término que matchea una parte del catálogo sembrado y no todo: mide el camino del `LIKE`,
 * que es el que **no** usa índice, sin degradar a la rama del catálogo completo.
 */
const TERMINO = 'puente';

/**
 * La base va a un archivo temporal y no a `:memory:` a propósito: el catálogo de producción
 * vive en disco, y medir contra memoria le regalaría al presupuesto el costo de la E/S. El
 * archivo se borra en el teardown y está cubierto por el `.gitignore` (`.tmp-tests/`).
 *
 * El directorio se arma con el pid y sin ninguna parte aleatoria, para que la medición sea
 * reproducible y el teardown sepa exactamente qué borrar.
 */
const DIRECTORIO = path.join(DIRECTORIO_TEMPORAL, `rendimiento-${process.pid}`);

let db: Database.Database;

interface Medicion {
  p95: number;
  mediana: number;
  peor: number;
  filas: number;
  bytes: number;
  /** Las muestras crudas, para poder afirmar cuántas iteraciones se midieron de verdad. */
  muestras: number[];
}

function percentil(muestras: number[], fraccion: number): number {
  const ordenadas = [...muestras].sort((a, b) => a - b);

  return ordenadas[Math.ceil(fraccion * ordenadas.length) - 1];
}

/**
 * Mide las 100 iteraciones de **consulta + armado del HTML** del listado.
 *
 * Las dos mitades van dentro del mismo reloj porque AC-09 pide *devolver el listado*, no
 * ejecutar la consulta: el armado del HTML de 2.000 filas es parte de lo que la usuaria
 * espera. Pintarlo en un navegador con miniaturas es la medición de FEAT-001c.
 */
function medir(termino: string | null): Medicion {
  const muestras: number[] = [];
  let filas = 0;
  let bytes = 0;

  for (let iteracion = 0; iteracion < ITERACIONES; iteracion += 1) {
    const inicio = performance.now();
    const libros = buscarLibros(termino, db);
    const html = renderToStaticMarkup(createElement(ListadoLibros, { libros }));
    muestras.push(performance.now() - inicio);

    filas = libros.length;
    bytes = html.length;
  }

  return {
    p95: percentil(muestras, PERCENTIL),
    mediana: percentil(muestras, 0.5),
    peor: Math.max(...muestras),
    filas,
    bytes,
    muestras,
  };
}

/**
 * Medición de control: **sólo la consulta**, sin armar el HTML.
 *
 * Existe para poder afirmar que el reloj de `medir()` cubre las dos mitades. Sacar el
 * `renderToStaticMarkup()` de adentro del reloj es una regresión que ninguna comparación contra
 * el presupuesto detecta —el presupuesto es 8 veces más grande que lo medido, así que medir de
 * menos sigue dando verde—, y sí detecta comparar contra este control.
 */
function medirSoloConsulta(termino: string | null): number {
  const muestras: number[] = [];

  for (let iteracion = 0; iteracion < ITERACIONES; iteracion += 1) {
    const inicio = performance.now();
    buscarLibros(termino, db);
    muestras.push(performance.now() - inicio);
  }

  return percentil(muestras, PERCENTIL);
}

function informar(caso: string, medida: Medicion): void {
  // Una medición de rendimiento que no deja los números a la vista no se puede revisar.
  console.info(
    `[AC-09] ${caso}: p95 ${medida.p95.toFixed(1)} ms · mediana ${medida.mediana.toFixed(1)} ms · ` +
      `peor ${medida.peor.toFixed(1)} ms · ${medida.filas} filas · ${medida.bytes} bytes de HTML`,
  );
}

describe('AC-09: catálogo de 2.000 libros (NFR-01)', () => {
  beforeAll(() => {
    // Idempotente a propósito: un Ctrl-C no corre el `afterAll`, así que el directorio de una
    // corrida interrumpida sobrevive con su `.db`, su `-wal` y su `-shm`. Sembrar encima de esa
    // base haría fallar la siembra con un `titulo_duplicado` que no señala en absoluto la causa
    // real.
    fs.rmSync(DIRECTORIO, { recursive: true, force: true });
    fs.mkdirSync(DIRECTORIO, { recursive: true });
    db = new Database(path.join(DIRECTORIO, 'catalogo.db'));
    aplicarPragmas(db);
    migrar(db);
    sembrarCatalogo(db, CANTIDAD);
  }, 120_000);

  afterAll(() => {
    db?.close();
    // Con `journal_mode = WAL` quedan además los `-wal` y `-shm`: se borra el directorio.
    fs.rmSync(DIRECTORIO, { recursive: true, force: true });
  });

  it('mide con los números que fija AC-09 y no con otros', () => {
    // Los cuatro literales del criterio, afirmados contra el valor escrito y no contra la
    // constante: aflojar cualquiera —200 libros, 1 iteración, 10 s de presupuesto, el
    // percentil 50— haría que las mediciones de abajo siguieran verdes midiendo otra cosa.
    expect(CANTIDAD).toBe(2000);
    expect(ITERACIONES).toBe(100);
    expect(PRESUPUESTO_MS).toBe(1000);
    expect(PERCENTIL).toBe(0.95);
  });

  it('siembra los 2.000 libros de forma determinista', () => {
    const libros = buscarLibros('', db);

    // La semilla no depende de `Math.random()` ni del reloj: el catálogo que quedó en la base
    // tiene que ser exactamente el que predicen las funciones puras del generador, libro por
    // libro, con su editorial.
    const esperados = Array.from(
      { length: CANTIDAD },
      (_, indice) => `${tituloDeterminista(indice)} | ${editorialDeterminista(indice)}`,
    );
    const sembrados = libros.map((libro) => `${libro.titulo} | ${libro.editorial}`);

    expect(libros).toHaveLength(CANTIDAD);
    expect([...sembrados].sort()).toEqual([...esperados].sort());

    // Y las 2.000 identidades son distintas: si el generador repitiera un título, el alta
    // habría fallado por duplicado y la siembra no habría llegado hasta acá.
    expect(new Set(libros.map((libro) => libro.tituloNormalizado)).size).toBe(CANTIDAD);

    // El orden que devuelve la consulta es el de `titulo_orden`. Los títulos plegados son
    // ASCII, así que la colación binaria de SQLite y el orden de JavaScript coinciden.
    const orden = libros.map((libro) => libro.tituloOrden);
    expect(orden).toEqual([...orden].sort());
  });

  it('devuelve el catálogo completo en menos de 1 s (p95 sobre 100 iteraciones)', () => {
    const medida = medir(null);
    const soloConsulta = medirSoloConsulta(null);
    informar('catálogo completo', medida);
    console.info(
      `[AC-09] control (sólo consulta): p95 ${soloConsulta.toFixed(1)} ms · ` +
        `el armado del HTML es ${(medida.p95 / soloConsulta).toFixed(1)}× la consulta`,
    );

    // Que la medición sea de trabajo real y no de una lista vacía.
    expect(medida.filas).toBe(CANTIDAD);
    expect(medida.bytes).toBeGreaterThan(CANTIDAD * 50);

    // Las 100 iteraciones se midieron de verdad, una muestra por iteración.
    expect(medida.muestras).toHaveLength(ITERACIONES);

    // El criterio de AC-09.
    expect(medida.p95).toBeLessThan(PRESUPUESTO_MS);

    // Y el reloj cubre las dos mitades: sobre 2.000 filas el armado del HTML cuesta ~20 veces
    // más que la consulta, así que si alguien lo saca de adentro del reloj el p95 cae al del
    // control. El factor 2 es el margen conservador de esa distancia: mide la **presencia** del
    // armado, no su costo exacto, que sí varía de máquina en máquina.
    expect(medida.p95).toBeGreaterThan(soloConsulta * 2);
  }, 120_000);

  it('devuelve una búsqueda con término en menos de 1 s (p95 sobre 100 iteraciones)', () => {
    const medida = medir(TERMINO);
    informar(`búsqueda "${TERMINO}"`, medida);

    // Un subconjunto propio: si el término no matcheara nada, la medición sería de la lista
    // vacía; si matcheara todo, sería otra vez la del catálogo completo.
    expect(medida.filas).toBeGreaterThan(0);
    expect(medida.filas).toBeLessThan(CANTIDAD);
    expect(medida.bytes).toBeGreaterThan(medida.filas * 50);
    expect(medida.muestras).toHaveLength(ITERACIONES);
    expect(medida.p95).toBeLessThan(PRESUPUESTO_MS);
  }, 120_000);
});
