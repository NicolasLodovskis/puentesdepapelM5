import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET } from '@/app/portadas/[id]/route';
import { guardarPortadaProcesada, quitarPortada } from '@/lib/portadas/almacenamiento';

/**
 * Mide el costo de `GET /portadas/[id]` como función async, sin servidor HTTP real (mismo
 * molde que el proyecto ya usa para las Server Actions, `AGENTS.md` § Stack: no hay entorno
 * DOM ni runner e2e).
 *
 * NFR-01 fija el presupuesto sobre el listado ya renderizado con sus miniaturas; este bench
 * deja evidencia concreta del costo que introduce **cada** miniatura con foto, que
 * `test/rendimiento/listado.bench.test.ts` no puede aislar por sí solo (mide 2.000 filas de
 * una sola vez, no una petición).
 */

const ITERACIONES = 100;
const PRESUPUESTO_MS = 1000;
const PERCENTIL = 0.95;

/** Un id fijo por escenario: el bench no necesita ids distintos, sólo un archivo real. */
const ID_CON_PORTADA = 800001;
const ID_SIN_PORTADA = 800002;

function pedido(id: number): Request {
  return new Request(`http://localhost/portadas/${String(id)}`);
}

function contexto(id: number): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

function percentil(muestras: number[], fraccion: number): number {
  const ordenadas = [...muestras].sort((a, b) => a - b);

  return ordenadas[Math.ceil(fraccion * ordenadas.length) - 1];
}

async function medir(id: number): Promise<{ p95: number; muestras: number[] }> {
  const muestras: number[] = [];

  for (let iteracion = 0; iteracion < ITERACIONES; iteracion += 1) {
    const inicio = performance.now();
    const respuesta = await GET(pedido(id), contexto(id));
    await respuesta.arrayBuffer();
    muestras.push(performance.now() - inicio);
  }

  return { p95: percentil(muestras, PERCENTIL), muestras };
}

describe('GET /portadas/[id]: presupuesto de NFR-01 aplicado al costo nuevo de este bloque', () => {
  beforeAll(async () => {
    const portada = await sharp({
      create: { width: 96, height: 96, channels: 3, background: { r: 30, g: 40, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    guardarPortadaProcesada(ID_CON_PORTADA, portada);
    // ID_SIN_PORTADA nunca recibe un archivo: mide el camino del fallback al logo.
  });

  afterAll(() => {
    // Sólo el archivo que este bench creó, no el directorio entero de portadas de la corrida:
    // otros archivos de test pueden compartirlo (mismo `PUENTES_PORTADAS_PATH`, mismo pid).
    quitarPortada(ID_CON_PORTADA);
  });

  it('mide con los números que fija AC-08/AC-09 y no con otros', () => {
    expect(ITERACIONES).toBe(100);
    expect(PRESUPUESTO_MS).toBe(1000);
    expect(PERCENTIL).toBe(0.95);
  });

  it('sirve una portada real por debajo de 1000 ms (p95 sobre 100 iteraciones)', async () => {
    const medida = await medir(ID_CON_PORTADA);

    console.info(`[NFR-01] portada real: p95 ${medida.p95.toFixed(1)} ms`);

    expect(medida.muestras).toHaveLength(ITERACIONES);
    expect(medida.p95).toBeLessThan(PRESUPUESTO_MS);
  }, 30_000);

  it('sirve el fallback al logo por debajo de 1000 ms (p95 sobre 100 iteraciones)', async () => {
    const medida = await medir(ID_SIN_PORTADA);

    console.info(`[NFR-01] fallback al logo: p95 ${medida.p95.toFixed(1)} ms`);

    expect(medida.muestras).toHaveLength(ITERACIONES);
    expect(medida.p95).toBeLessThan(PRESUPUESTO_MS);
  }, 30_000);
});
