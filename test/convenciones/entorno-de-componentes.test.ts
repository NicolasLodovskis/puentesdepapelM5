import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * NFR-02: el entorno `jsdom` que trae Block 2 es exclusivo de `test/componentes/`, activado por el
 * pragma de entorno de Vitest (la palabra "vitest-environment" seguida del nombre del entorno) en
 * la primera línea de cada archivo ahí. Ningún test de la suite existente (Server Actions, dominio,
 * DB, portadas, convenciones, rendimiento y rutas confinadas) puede llevar ese pragma apuntando a
 * "js" + "dom": si lo llevara, ese archivo dejaría de correr en el entorno `node` que ya usan hoy,
 * sin que nadie lo pidiera, y `vitest.config.ts` no lo notaría porque el pragma gana por archivo.
 *
 * Detección: Vitest reconoce el pragma como una subcadena en TODO el contenido del archivo, sin
 * anclarlo a un comentario de línea ni a una posición concreta dentro de esa línea — un comentario
 * de bloque cuenta igual. Por eso esta guardia busca la subcadena en todo el archivo, igual que
 * Vitest, en vez de anclarse a un comentario de línea al inicio del archivo. El patrón se arma
 * concatenando fragmentos a propósito para que la frase completa del pragma no quede escrita tal
 * cual en este archivo (si lo estuviera, este mismo archivo activaría el entorno que está
 * prohibiendo).
 *
 * Esta guardia se prueba a sí misma: no basta con que hoy dé verde porque nadie escribió el pragma
 * todavía, así que el reporte de cierre de este bloque documenta haberla forzado a fallar a mano
 * (agregando el pragma, dentro de un comentario de bloque, a un archivo temporal bajo `test/db/`)
 * y haberla revertido antes de terminar.
 */

const PALABRA_PRAGMA = ['@vitest', '-environment'].join('');
const VALOR_JSDOM = ['js', 'dom'].join('');
const PRAGMA_JSDOM = new RegExp(`${PALABRA_PRAGMA}\\s+${VALOR_JSDOM}\\b`, 'u');

const RAIZ = process.cwd();

/** Directorios y archivos protegidos: deben seguir en el entorno `node` por defecto. */
const RUTAS_PROTEGIDAS = [
  'test/app',
  'test/db',
  'test/dominio',
  'test/portadas',
  'test/convenciones',
  'test/rutas-confinadas.test.ts',
  'test/rendimiento',
];

/** Todos los archivos `.ts`/`.tsx` bajo una ruta, recursivo. Si la ruta es un archivo, es ella misma. */
function archivosDe(rutaRelativa: string): string[] {
  const completo = path.join(RAIZ, rutaRelativa);
  const info = fs.statSync(completo);

  if (info.isFile()) {
    return [rutaRelativa];
  }

  return fs.readdirSync(completo, { withFileTypes: true }).flatMap((entrada) => {
    const hijoCompleto = path.join(completo, entrada.name);
    const hijoRelativo = path.relative(RAIZ, hijoCompleto);

    if (entrada.isDirectory()) {
      return archivosDe(hijoRelativo);
    }

    return /\.tsx?$/u.test(entrada.name) ? [hijoRelativo] : [];
  });
}

const archivosProtegidos = RUTAS_PROTEGIDAS.flatMap((ruta) => archivosDe(ruta));

describe('aislamiento del entorno jsdom (NFR-02)', () => {
  it('barre al menos un archivo por cada ruta protegida', () => {
    // Meta-guardia: si alguna ruta no resolviera ningún archivo (renombre, typo), la aserción de
    // abajo pasaría en vacío sobre esa ruta sin haber mirado nada.
    for (const ruta of RUTAS_PROTEGIDAS) {
      expect(archivosDe(ruta).length, `${ruta} no aportó ningún archivo al barrido`).toBeGreaterThan(
        0,
      );
    }
  });

  it('ningún archivo protegido activa el pragma de entorno de Vitest apuntando a jsdom', () => {
    const conPragma = archivosProtegidos.filter((archivo) =>
      PRAGMA_JSDOM.test(fs.readFileSync(path.join(RAIZ, archivo), 'utf8')),
    );

    expect(
      conPragma,
      'estos archivos activarían jsdom fuera de test/componentes/, rompiendo NFR-02',
    ).toEqual([]);
  });
});
