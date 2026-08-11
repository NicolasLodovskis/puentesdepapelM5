import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guardias de exposición de red: mitigaciones 1 y 6 del threat model
 * (`docs/daw/security/threat-FEAT-001a.md`).
 *
 * **Por qué existen.** El producto no tiene autenticación, y no la tiene por decisión de
 * producto: es el riesgo aceptado **A1** (PRD-001 §6, threat model §4). Lo que la reemplaza
 * son dos controles compensatorios, y los dos viven en un archivo de configuración que
 * ningún test de comportamiento mira:
 *
 * - **Mitigación 1 (riesgo R1):** el proceso escucha únicamente en `127.0.0.1`. Sin el bind
 *   explícito en `dev` y `start`, la aplicación de una librería queda **sin autenticación
 *   escuchando en todas las interfaces de su red**: cualquier dispositivo de la red ve el
 *   inventario y da de alta libros.
 * - **Mitigación 6 (riesgo R5):** no se configura `serverActions.allowedOrigins`, para
 *   conservar la validación de `Origin` que Next.js aplica por defecto. Es la única defensa
 *   CSRF del `POST /` del Server Action de alta.
 *
 * Las dos se pueden borrar de un tirón dejando la suite de negocio en verde, el lint limpio y
 * el SAST sin nada que decir. Estos guardias son la red de regresión que faltaba.
 */

const RAIZ = process.cwd();

/** Los scripts declarados en `package.json`, leídos del archivo real. */
const scripts = (
  JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  }
).scripts;

/**
 * Toda aparición de la bandera de host en un comando, con el valor que la sigue.
 *
 * Se afirma sobre **cada** aparición y no sobre la primera: `next dev -H 127.0.0.1 -H 0.0.0.0`
 * contiene el bind correcto y escucha en toda la red igual. Se admiten las dos formas de la
 * bandera (`-H` y `--hostname`) y los dos separadores (espacio y `=`), porque las cuatro
 * combinaciones son válidas para Next y exigir una sola dejaría al comando **invisible para el
 * guardia** en vez de ponerlo rojo.
 */
const BANDERA_DE_HOST = /(?:-H|--hostname)(?:[=\s]+)(\S+)/gu;

/** El único host admitido. `localhost` no sirve: resuelve por DNS y puede no ser el loopback. */
const LOOPBACK = '127.0.0.1';

function hostsDe(comando: string): string[] {
  return Array.from(comando.matchAll(BANDERA_DE_HOST), (coincidencia) => coincidencia[1]);
}

describe('mitigación 1 — el servidor escucha sólo en 127.0.0.1 (R1, control compensatorio de A1)', () => {
  it('extrae de verdad el host de un comando, en las cuatro formas de la bandera', () => {
    // Meta-guardia del extractor: si `hostsDe()` devolviera siempre `[]`, los dos guardias de
    // abajo se pondrían rojos por la aserción de longitud, no en silencio. Y si devolviera
    // basura, dirían que el bind está mal cuando está bien. Se comprueba contra literales, no
    // contra `package.json`, para que reescribir un script no mueva este test.
    expect(hostsDe('next dev -H 127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev -H=127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev --hostname 127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev --hostname=127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev -H 127.0.0.1 -H 0.0.0.0')).toEqual(['127.0.0.1', '0.0.0.0']);
    expect(hostsDe('next dev')).toEqual([]);
    expect(hostsDe('next dev -p 3000')).toEqual([]);
  });

  it('el script dev fija el bind explícito al loopback', () => {
    // La aserción va sobre el script `dev` y no sobre el `package.json` entero: un
    // `toContain('127.0.0.1')` sobre el archivo completo pasaría con el bind puesto en el
    // script equivocado, que es exactamente el escenario que deja la app expuesta.
    const comando = scripts?.dev ?? '';
    const hosts = hostsDe(comando);

    expect(comando, 'package.json no declara el script dev').not.toBe('');
    expect(hosts, `el script dev no fija el host: ${comando}`).toHaveLength(1);
    expect(hosts).toEqual([LOOPBACK]);
  });

  it('el script start fija el bind explícito al loopback', () => {
    // `start` es el que corre en la máquina de la librería: si sólo `dev` estuviera atado al
    // loopback, el control compensatorio de A1 no existiría en producción.
    const comando = scripts?.start ?? '';
    const hosts = hostsDe(comando);

    expect(comando, 'package.json no declara el script start').not.toBe('');
    expect(hosts, `el script start no fija el host: ${comando}`).toHaveLength(1);
    expect(hosts).toEqual([LOOPBACK]);
  });
});

/**
 * El fuente sin sus comentarios.
 *
 * Es lo que hace falsable la aserción negativa de la mitigación 6: `next.config.ts`
 * **menciona `allowedOrigins` a propósito**, en un comentario que explica por qué no se
 * configura, así que un `not.toContain('allowedOrigins')` sobre el fuente crudo se pondría
 * rojo contra el código correcto — y la reacción previsible a ese rojo es borrar el guardia o
 * borrar el comentario.
 *
 * Se recorre carácter por carácter en vez de filtrar por línea porque un comentario al final
 * de una línea de código (`serverExternalPackages: [...], // ...`) sobrevive al filtro por
 * línea, y porque `//` dentro de una cadena (una URL, por ejemplo) no abre un comentario y no
 * hay que tratarlo como tal.
 */
function sinComentarios(fuente: string): string {
  let resultado = '';
  let comilla: string | null = null;
  let i = 0;

  while (i < fuente.length) {
    const actual = fuente[i];
    const siguiente = fuente[i + 1];

    if (comilla !== null) {
      if (actual === '\\') {
        resultado += actual + (siguiente ?? '');
        i += 2;
        continue;
      }
      if (actual === comilla) {
        comilla = null;
      }
      resultado += actual;
      i += 1;
      continue;
    }

    if (actual === "'" || actual === '"' || actual === '`') {
      comilla = actual;
      resultado += actual;
      i += 1;
      continue;
    }

    if (actual === '/' && siguiente === '/') {
      while (i < fuente.length && fuente[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (actual === '/' && siguiente === '*') {
      i += 2;
      while (i < fuente.length && !(fuente[i] === '*' && fuente[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }

    resultado += actual;
    i += 1;
  }

  return resultado;
}

/** ¿Aparece `clave` como clave en algún nivel de este valor? */
function tieneClave(valor: unknown, clave: string): boolean {
  if (Array.isArray(valor)) {
    return valor.some((elemento) => tieneClave(elemento, clave));
  }
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const registro = valor as Record<string, unknown>;
  return (
    Object.keys(registro).includes(clave) ||
    Object.values(registro).some((anidado) => tieneClave(anidado, clave))
  );
}

describe('mitigación 6 — no se relaja la validación de Origin de los Server Actions (R5)', () => {
  const fuente = fs.readFileSync(path.join(RAIZ, 'next.config.ts'), 'utf8');
  const codigo = sinComentarios(fuente);

  it('el filtro de comentarios distingue el comentario de la configuración real', () => {
    // Meta-guardia del filtro, y el que sostiene todo este describe: si `sinComentarios()`
    // devolviera la cadena vacía, la aserción negativa de abajo pasaría **en silencio** para
    // siempre. Se comprueba contra literales para no atarse a la redacción del comentario que
    // hoy tiene `next.config.ts`: reescribirlo no debe mover este test.
    expect(sinComentarios('const a = 1; // allowedOrigins')).not.toContain('allowedOrigins');
    expect(sinComentarios('/* allowedOrigins */const a = 1;')).not.toContain('allowedOrigins');
    expect(sinComentarios("serverActions: { allowedOrigins: ['*'] },")).toContain('allowedOrigins');
    expect(sinComentarios("const url = 'https://ej/x'; // nota")).toContain('https://ej/x');

    // Y sobre el archivo de verdad: quedó código, no una cadena vacía ni el archivo entero.
    expect(codigo).toContain('serverExternalPackages');
    expect(codigo.length).toBeLessThan(fuente.length);
  });

  it('reconoce la clave anidada a cualquier profundidad', () => {
    // Meta-guardia del recorrido: sin esto, un `tieneClave()` que devolviera siempre `false`
    // dejaría el guardia estructural de abajo pasando contra una configuración relajada.
    expect(tieneClave({ serverActions: { allowedOrigins: ['*'] } }, 'allowedOrigins')).toBe(true);
    expect(
      tieneClave({ experimental: { serverActions: { allowedOrigins: [] } } }, 'allowedOrigins'),
    ).toBe(true);
    expect(tieneClave({ serverExternalPackages: ['better-sqlite3'] }, 'allowedOrigins')).toBe(
      false,
    );
    expect(tieneClave(undefined, 'allowedOrigins')).toBe(false);
  });

  it('la configuración que exporta next.config.ts no lleva allowedOrigins en ningún nivel', async () => {
    // El guardia estructural, y el que no tiene puerta lateral: se mira el objeto **resuelto**
    // que Next.js lee, así que da igual si la clave se escribió suelta (`{ allowedOrigins }`),
    // bajo `experimental`, con comillas, o armada aparte en una variable y volcada con spread.
    const configuracion: unknown = (await import('@/next.config')).default;

    // Que sea la configuración de verdad y no un módulo vacío: sin esto, un `default`
    // `undefined` haría pasar la aserción de abajo sin haber mirado nada.
    expect(tieneClave(configuracion, 'serverExternalPackages')).toBe(true);
    expect(tieneClave(configuracion, 'allowedOrigins')).toBe(false);

    // La aserción se detiene en `allowedOrigins` y **no** exige que `serverActions` no exista:
    // la mitigación 6 prohíbe relajar el origen, no configurar el bloque. Pedir la ausencia de
    // la clave entera pondría rojo un `serverActions.bodySizeLimit` legítimo, y un guardia de
    // seguridad que se pone rojo por algo que no es un problema de seguridad es un guardia que
    // alguien va a borrar.
  });

  it('el fuente de next.config.ts no nombra allowedOrigins fuera de los comentarios', () => {
    // Cinturón sobre el fuente, además del tirante estructural: cubre la clave escrita en una
    // rama condicional que hoy no se evalúa, o detrás de una variable de entorno — casos que
    // el objeto resuelto en este entorno de test no mostraría.
    expect(codigo).not.toMatch(/allowedOrigins/u);
  });
});
