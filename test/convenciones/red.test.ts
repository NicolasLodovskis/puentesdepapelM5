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
 *
 * El host se captura con una clase acotada a lo que un host puede contener y **no** con `\S+`,
 * que se comía la comilla de cierre: la familia de runners que se agrega para un test de
 * navegador —`start-server-and-test`, `concurrently`, `wait-on`— envuelve el comando del
 * servidor entre comillas, y un `start-server-and-test 'npm run dev' 3000 …` legítimo daba el
 * host `127.0.0.1'` y ponía rojo el guardia con un mensaje que afirmaba lo contrario de lo que
 * pasaba. Un rojo incomprensible en un guardia de seguridad es cómo se terminan borrando los
 * guardias.
 *
 * Las comillas alrededor del valor se admiten y no se capturan, para que `-H "127.0.0.1"` no
 * sea el mismo falso positivo por la otra puerta; el host de adentro se sigue leyendo, así que
 * un `-H "0.0.0.0"` entre comillas se ve igual.
 *
 * Los corchetes en la clase son por IPv6, y con una consecuencia deliberada: `-H [::1]` se
 * captura entero y se compara contra `127.0.0.1`, así que sale **rojo**. `::1` es loopback, pero
 * la mitigación nombra `127.0.0.1` y el guardia falla cerrado. No es un bug: es la decisión.
 */
const BANDERA_DE_HOST = /(?:-H|--hostname)[=\s]+['"]?([\w.:[\]-]+)['"]?/gu;

/** El único host admitido. `localhost` no sirve: resuelve por DNS y puede no ser el loopback. */
const LOOPBACK = '127.0.0.1';

function hostsDe(comando: string): string[] {
  return Array.from(comando.matchAll(BANDERA_DE_HOST), (coincidencia) => coincidencia[1]);
}

/** Un comando que levanta el servidor de Next, en cualquiera de sus dos modos. */
const INVOCA_SERVIDOR = /\bnext\s+(?:dev|start)\b/u;

/**
 * Una delegación a otro script del mismo `package.json`.
 *
 * `\bnpm` **no matchea dentro de `pnpm`** —entre `p` y `n` no hay frontera de palabra—, así que
 * un `pnpm run dev -- -H 0.0.0.0` quedaba invisible al detector. Es el mismo hueco por una
 * tercera puerta lateral, y el proyecto declara npm en `AGENTS.md`, pero cerrarlo cuesta un
 * token y el `run` es opcional porque `yarn dev` no lo lleva.
 */
const REFERENCIA_A_SCRIPT = /\b(?:p?npm|yarn)\s+(?:run\s+)?([\w:-]+)/gu;

/**
 * El comando con sus delegaciones reemplazadas por el cuerpo del script referenciado.
 *
 * Sin esto, `"dev:red": "npm run dev -- -H 0.0.0.0"` no contendría la cadena `next dev` y
 * quedaría fuera del conjunto vigilado, levantando el servidor en toda la red. Resolver la
 * referencia lo pone dentro **y** deja las dos banderas en el mismo comando, que es lo que la
 * aserción de «exactamente un host» necesita ver.
 *
 * `vistos` corta los ciclos: un `"dev": "npm run dev"` haría recursión infinita.
 */
function resolver(comando: string, vistos: ReadonlySet<string> = new Set()): string {
  return comando.replace(REFERENCIA_A_SCRIPT, (coincidencia, nombre: string) => {
    const cuerpo = scripts?.[nombre];
    if (cuerpo === undefined || vistos.has(nombre)) {
      return coincidencia;
    }
    return resolver(cuerpo, new Set(vistos).add(nombre));
  });
}

/** Todo script de `package.json` que termine levantando el servidor, con su comando resuelto. */
const scriptsDeServidor = Object.entries(scripts ?? {})
  .map(([nombre, comando]) => [nombre, resolver(comando)] as const)
  .filter(([, comando]) => INVOCA_SERVIDOR.test(comando));

describe('mitigación 1 — ningún script levanta el servidor fuera de 127.0.0.1 (R1, control compensatorio de A1)', () => {
  it('extrae de verdad el host de un comando, en las cuatro formas de la bandera', () => {
    // Meta-guardia del extractor: si `hostsDe()` devolviera siempre `[]`, el guardia de abajo se
    // pondría rojo por la aserción de longitud, no en silencio. Y si devolviera basura, diría
    // que el bind está mal cuando está bien. Se comprueba contra literales, no contra
    // `package.json`, para que reescribir un script no mueva este test.
    expect(hostsDe('next dev -H 127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev -H=127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev --hostname 127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev --hostname=127.0.0.1')).toEqual(['127.0.0.1']);
    expect(hostsDe('next dev -H 127.0.0.1 -H 0.0.0.0')).toEqual(['127.0.0.1', '0.0.0.0']);
    expect(hostsDe('next dev')).toEqual([]);
    expect(hostsDe('next dev -p 3000')).toEqual([]);

    // El host no se lleva puesta la comilla que cierra el comando envuelto por un runner de
    // navegador. Ésta es la aserción del falso positivo que el guardia tuvo: sin ella el host
    // salía `127.0.0.1'` y un `e2e` legítimo se ponía rojo.
    expect(hostsDe("start-server-and-test 'next dev -H 127.0.0.1' 3000 'x'")).toEqual([
      '127.0.0.1',
    ]);
    expect(hostsDe('start-server-and-test "next dev -H 127.0.0.1" 3000 "x"')).toEqual([
      '127.0.0.1',
    ]);

    // Y la dirección que importa más: acotar la captura no puede volver ciego al guardia
    // **dentro** de las comillas. Un host malo ahí adentro se sigue viendo, con comilla simple,
    // con doble, y con el valor entrecomillado por separado.
    expect(hostsDe("start-server-and-test 'next dev -H 0.0.0.0' 3000 'x'")).toEqual(['0.0.0.0']);
    expect(hostsDe('start-server-and-test "next dev -H 0.0.0.0" 3000 "x"')).toEqual(['0.0.0.0']);
    expect(hostsDe('next dev -H "0.0.0.0"')).toEqual(['0.0.0.0']);
    expect(hostsDe("next dev -H '0.0.0.0'")).toEqual(['0.0.0.0']);
    expect(hostsDe('next dev -H "127.0.0.1"')).toEqual(['127.0.0.1']);

    // IPv6: se captura entero, se compara contra 127.0.0.1 y por lo tanto sale rojo. Queda
    // clavado como decisión —el guardia falla cerrado— y no como accidente del patrón.
    expect(hostsDe('next dev -H [::1]')).toEqual(['[::1]']);
  });

  it('reconoce como servidor a dev y start, y sólo a ellos, sin pedirle bandera al resto', () => {
    // Meta-guardia del detector, y la mitad de la propiedad que la aserción de abajo no cubre:
    // el guardia recorre **el conjunto de scripts que levantan el servidor**, así que un
    // detector que devolviera el conjunto vacío lo dejaría pasando sin haber mirado nada, y con
    // él volvería el agujero que este guardia vino a tapar. Exigir que `dev` y `start` estén
    // dentro es lo que hace que borrarles la bandera siga siendo rojo.
    const nombres = scriptsDeServidor.map(([nombre]) => nombre);

    expect(nombres).toContain('dev');
    expect(nombres).toContain('start');

    // Y el otro lado: los scripts que no levantan nada no deben caer en el conjunto, porque
    // entonces el guardia les exigiría una bandera de host que no tiene sentido y se pondría
    // rojo por algo que no es un problema de seguridad.
    for (const nombre of ['build', 'test', 'test:cov', 'lint', 'format', 'format:check']) {
      expect(scripts?.[nombre], `package.json no declara el script ${nombre}`).toBeDefined();
      expect(nombres, `${nombre} no levanta el servidor y no debería exigir bandera`).not.toContain(
        nombre,
      );
    }

    expect(INVOCA_SERVIDOR.test('next build')).toBe(false);
    expect(INVOCA_SERVIDOR.test('vitest run --coverage')).toBe(false);

    // Y la delegación se resuelve: si no, un script que llame a otro queda invisible. Los tres
    // gestores, porque `\bnpm` no matchea dentro de `pnpm` y `yarn` no lleva `run`.
    expect(resolver('npm run dev -- -H 0.0.0.0')).toMatch(INVOCA_SERVIDOR);
    expect(resolver('pnpm run dev -- -H 0.0.0.0')).toMatch(INVOCA_SERVIDOR);
    expect(resolver('yarn dev -H 0.0.0.0')).toMatch(INVOCA_SERVIDOR);
    // Y el comando resuelto conserva la bandera de quien delega, que es lo que ve la aserción de
    // host. Se afirma la pertenencia y no la lista completa: atar este meta-guardia al cuerpo
    // exacto del script `dev` lo pondría rojo cada vez que alguien toque `dev`, con un mensaje
    // que habla de la resolución de delegaciones y no del bind. Es el mismo defecto que tuvo
    // este archivo con la comilla: un rojo que afirma algo distinto de lo que pasa.
    expect(hostsDe(resolver('pnpm run dev -- -H 0.0.0.0'))).toContain('0.0.0.0');
  });

  it('todo script que levanta el servidor fija exactamente un host, y es el loopback', () => {
    // La aserción está escrita sobre **la propiedad** y no sobre los nombres `dev` y `start`:
    // afirmar sobre dos nombres deja invisible al tercer script que alguien agregue, y ese
    // tercer script es el escenario más probable de este producto —«quiero ver el catálogo
    // desde el celular», `next dev -H 0.0.0.0`, dos minutos—. En ese momento una aplicación
    // **sin autenticación** queda escuchando en toda la red de la librería: es el riesgo R1 con
    // su control compensatorio desactivado, y el compensatorio es lo único que hay, porque la
    // falta de autenticación es un riesgo aceptado (A1) y no un descuido.
    //
    // Se pide **exactamente uno**: `-H 127.0.0.1 -H 0.0.0.0` contiene el bind correcto y
    // escucha en toda la red igual. Y se pide la IP, no `localhost`: eso resuelve por DNS y
    // puede no ser el loopback.
    expect(scriptsDeServidor.length).toBeGreaterThan(0);

    for (const [nombre, comando] of scriptsDeServidor) {
      expect(
        hostsDe(comando),
        `el script ${nombre} no fija exactamente un host al loopback: ${comando}`,
      ).toEqual([LOOPBACK]);
    }
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

/** Todas las claves presentes en un valor, a cualquier profundidad y en cualquier orden. */
function clavesAnidadas(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((elemento) => clavesAnidadas(elemento));
  }
  if (typeof valor !== 'object' || valor === null) {
    return [];
  }
  const registro = valor as Record<string, unknown>;
  return Object.entries(registro).flatMap(([clave, anidado]) => [
    clave,
    ...clavesAnidadas(anidado),
  ]);
}

/**
 * Toda clave de configuración que relaje una validación de origen.
 *
 * El patrón es una familia y no un nombre porque hay **dos** claves en juego, y sólo una es la
 * mitigación 6:
 *
 * - `serverActions.allowedOrigins` es la mitigación 6 (riesgo R5): relajarla desarma la única
 *   defensa CSRF del `POST /` del Server Action de alta.
 * - `allowedDevOrigins`, de primer nivel, **no es un hueco de la mitigación 6**: esa mitigación
 *   nombra una clave concreta y esa clave está cubierta. Es una superficie vecina que el threat
 *   model no analizó porque no existía cuando se escribió. Relaja la protección cross-origin del
 *   servidor de desarrollo, no la de los Server Actions, y con el bind al loopback su alcance es
 *   acotado. Se vigila igual: para este producto —sin autenticación, atado al loopback— no hay
 *   ningún motivo legítimo para relajar el origen de nada. `tsc` la acepta sin chistar, porque
 *   es una clave real de Next 16, así que el tipo no es la barrera.
 */
const CLAVE_QUE_RELAJA_ORIGEN = /^allowed\w*Origins$/u;

describe('mitigación 6 — no se relaja ninguna validación de origen (R5, y la superficie vecina)', () => {
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

  it('recoge las claves anidadas a cualquier profundidad, incluidas las computadas', () => {
    // Meta-guardia del recorrido: sin esto, un `clavesAnidadas()` que devolviera siempre `[]`
    // dejaría el guardia estructural de abajo pasando contra una configuración relajada.
    expect(clavesAnidadas({ serverActions: { allowedOrigins: ['*'] } })).toContain(
      'allowedOrigins',
    );
    expect(clavesAnidadas({ experimental: { serverActions: { allowedOrigins: [] } } })).toContain(
      'allowedOrigins',
    );
    expect(clavesAnidadas({ allowedDevOrigins: ['*'] })).toContain('allowedDevOrigins');
    // Una clave armada en tiempo de ejecución es una clave común en el objeto resuelto: por eso
    // el guardia estructural mira el objeto y no el texto.
    expect(clavesAnidadas({ [`allowedDev${'Origins'}`]: ['*'] })).toContain('allowedDevOrigins');
    expect(clavesAnidadas({ serverExternalPackages: ['better-sqlite3'] })).toEqual([
      'serverExternalPackages',
    ]);
    expect(clavesAnidadas(undefined)).toEqual([]);
  });

  it('la configuración que exporta next.config.ts no relaja el origen en ningún nivel', async () => {
    // El guardia estructural, y el que no tiene puerta lateral: se mira el objeto **resuelto**
    // que Next.js lee, así que da igual si la clave se escribió suelta (`{ allowedOrigins }`),
    // bajo `experimental`, con comillas, armada aparte en una variable y volcada con spread, o
    // con el nombre computado (`['allowedDev' + 'Origins']`).
    const configuracion: unknown = (await import('@/next.config')).default;
    const claves = clavesAnidadas(configuracion);

    // Que sea la configuración de verdad y no un módulo vacío: sin esto, un `default`
    // `undefined` haría pasar la aserción de abajo sin haber mirado nada.
    expect(claves).toContain('serverExternalPackages');
    expect(claves.filter((clave) => CLAVE_QUE_RELAJA_ORIGEN.test(clave))).toEqual([]);

    // La aserción se detiene en las claves que relajan el origen y **no** exige que
    // `serverActions` no exista: la mitigación 6 prohíbe relajar el origen, no configurar el
    // bloque. Pedir la ausencia de la clave entera pondría rojo un `serverActions.bodySizeLimit`
    // legítimo, y un guardia de seguridad que se pone rojo por algo que no es un problema de
    // seguridad es un guardia que alguien va a borrar.
  });

  it('el fuente de next.config.ts no nombra ninguna clave de origen fuera de los comentarios', () => {
    // Cinturón sobre el fuente, además del tirante estructural: cubre la clave escrita en una
    // rama condicional que hoy no se evalúa, o detrás de una variable de entorno — casos que
    // el objeto resuelto en este entorno de test no mostraría.
    expect(codigo).not.toMatch(/allowed\w*Origins/u);
  });
});
