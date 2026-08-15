import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Todo módulo de `app/` que provee la función de un formulario **es** un módulo de Server Actions, y
 * por lo tanto tiene que declarar `'use server'`.
 *
 * **Qué agujero cierra, medido.** Borrar `'use server';` de `app/acciones-libro.ts` dejaba la suite
 * entera en verde: la meta-guardia de `test/app/acciones.test.ts` nombra sólo `app/acciones.ts`, y la
 * guardia de exports que sí alcanza al archivo nuevo deriva su lista **de la directiva**, así que sin
 * la directiva el archivo desaparece de la vigilancia en vez de fallar. Sin la directiva el módulo
 * deja de ser un módulo de Server Actions y `<form action={ventaDeLibro}>` falla al enviarse en
 * producción; los tests no lo notan porque en `renderToStaticMarkup` es una función común. Es la
 * convención que `AGENTS.md` documenta como cicatriz y que este ticket ya corrigió tres veces.
 *
 * **Por qué derivada y no una lista.** Una lista escrita a mano es exactamente lo que dejó afuera al
 * archivo nuevo, y dejaría afuera al del Block 5. Lo que se deriva es el **uso**: cada sitio donde un
 * componente pasa una función como acción de un formulario —`action={X}` en el JSX, o el primer
 * argumento de `useActionState`— y de ahí, siguiendo el import, el módulo que la provee. Un formulario
 * nuevo entra solo.
 *
 * Es complementaria de la guardia de `test/app/acciones.test.ts` y no su repetición: allá se afirma
 * que un módulo que **tiene** la directiva sólo exporte funciones async; acá, que el módulo que
 * **debe** tenerla la tenga.
 */

/** Todos los archivos bajo `app/`, recursivo, en ruta relativa a la raíz. */
function archivosDeApp(directorio = path.join(process.cwd(), 'app')): string[] {
  return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const completo = path.join(directorio, entrada.name);

    return entrada.isDirectory()
      ? archivosDeApp(completo)
      : [path.relative(process.cwd(), completo)];
  });
}

function leer(relativo: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativo), 'utf8');
}

/**
 * La directiva a nivel de módulo, con las comillas en una clase y el punto y coma opcional: vale
 * igual escrita `"use server"` o sin `;`, y un patrón que exigiera una sola forma dejaría al archivo
 * invisible en vez de fallar. Es el mismo patrón que usa la guardia de exports.
 */
const DIRECTIVA_DE_SERVIDOR = /^\s*['"]use server['"];?/u;

const ACCION_EN_JSX = /\baction=\{([^{}]*)\}/gu;
const ACCION_EN_HOOK = /\buse(?:Action|Form)State\s*(?:<[^;]*?>)?\s*\(\s*([^,)]*)/gu;

const IDENTIFICADOR = /^[A-Za-z_$][\w$]*$/u;
const LITERAL_DE_TEXTO = /^['"`]/u;

const IMPORT_CON_LLAVES = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gu;
const IMPORT_POR_DEFECTO =
  /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\}\s*)?from\s*['"]([^'"]+)['"]/gu;

/**
 * De dónde salió el sitio: del atributo `action={…}` del JSX, o del primer argumento del hook.
 *
 * **Se etiqueta y no se deduce del texto.** La guardia de cardinalidad deducía el origen por la
 * ausencia de `=>` en la expresión, y con eso los dos orígenes caían en el mismo balde: en un
 * archivo que además usa `useActionState`, el sitio del hook infla la cuenta del JSX y la absorbe.
 */
type OrigenDeLaAccion = 'jsx' | 'hook';

/** Un sitio donde un componente entrega una función como acción de un formulario. */
interface SitioDeAccion {
  /** El archivo de `app/` que la entrega. */
  archivo: string;
  /** De dónde salió, para que la cuenta del JSX no se mezcle con la del hook. */
  origen: OrigenDeLaAccion;
  /** El texto que aparece en el sitio: un identificador, un literal o algo que hay que revisar. */
  expresion: string;
}

interface AccionesDeUnArchivo {
  archivo: string;
  sitios: SitioDeAccion[];
  /** Cuántos `action={` hay en el fuente, para que el reconocedor no pueda perder ninguno. */
  aperturas: number;
}

function accionesDe(archivo: string): AccionesDeUnArchivo {
  const fuente = leer(archivo);
  const enJsx = Array.from(fuente.matchAll(ACCION_EN_JSX), (encontrado) => encontrado[1].trim());
  const enHook = Array.from(fuente.matchAll(ACCION_EN_HOOK), (encontrado) => encontrado[1].trim());

  return {
    archivo,
    sitios: [
      ...enJsx.map((expresion) => ({ archivo, origen: 'jsx' as const, expresion })),
      ...enHook.map((expresion) => ({ archivo, origen: 'hook' as const, expresion })),
    ],
    aperturas: (fuente.match(/\baction=\{/gu) ?? []).length,
  };
}

/**
 * El módulo del proyecto al que apunta un especificador, o `undefined` si es un paquete externo.
 *
 * Se prueban `.ts`, `.tsx` y las dos formas de barrel, igual que la guardia transitiva de
 * `test/app/detalle.test.ts`: un `./acciones` puede ser un archivo o un directorio con `index.ts`.
 */
function resolver(especificador: string, desde: string): string | undefined {
  const base = especificador.startsWith('@/')
    ? path.join(process.cwd(), especificador.slice(2))
    : especificador.startsWith('.')
      ? path.join(process.cwd(), path.dirname(desde), especificador)
      : '';

  if (base === '') {
    return undefined;
  }

  return ['.ts', '.tsx', path.join(path.sep, 'index.ts'), path.join(path.sep, 'index.tsx')]
    .map((sufijo) => `${base}${sufijo}`)
    .filter((archivo) => fs.existsSync(archivo) && fs.statSync(archivo).isFile())
    .map((archivo) => path.relative(process.cwd(), archivo))[0];
}

/** De qué especificador viene cada nombre que el archivo importa, con el nombre **local**. */
function importacionesDe(archivo: string): Map<string, string> {
  const fuente = leer(archivo);
  const importaciones = new Map<string, string>();

  for (const [, adentro, especificador] of fuente.matchAll(IMPORT_CON_LLAVES)) {
    for (const parte of adentro.split(',')) {
      const nombre =
        parte
          .trim()
          .split(/\s+as\s+/u)
          .pop()
          ?.trim() ?? '';

      if (nombre !== '') {
        importaciones.set(nombre, especificador);
      }
    }
  }

  for (const [, nombre, especificador] of fuente.matchAll(IMPORT_POR_DEFECTO)) {
    importaciones.set(nombre, especificador);
  }

  return importaciones;
}

/** ¿El nombre está declarado en el propio archivo? Entonces no lo provee ningún módulo. */
function declaradoEnElArchivo(archivo: string, nombre: string): boolean {
  return new RegExp(
    String.raw`(?:const|let|var|function)\s+(?:async\s+)?\[?[^=;{]*\b${nombre}\b`,
    'u',
  ).test(leer(archivo));
}

/**
 * El módulo que provee la acción de un sitio, o el motivo por el que no se pudo determinar.
 *
 * Un identificador declarado en el propio archivo —`enviarAlta`, que devuelve `useActionState`— no lo
 * provee ningún módulo y no es un problema: la acción de verdad es la que ese hook recibe, y ésa se ve
 * en su propio sitio. Cualquier otra cosa que no se pueda seguir hasta un módulo de `app/` **sí** es
 * un problema, y se reporta en vez de saltearse.
 */
interface Procedencia {
  sitio: SitioDeAccion;
  modulo?: string;
  problema?: string;
}

function procedenciaDe(sitio: SitioDeAccion): Procedencia {
  const { archivo, expresion } = sitio;

  if (declaradoEnElArchivo(archivo, expresion)) {
    return { sitio };
  }

  const especificador = importacionesDe(archivo).get(expresion);

  if (especificador === undefined) {
    return {
      sitio,
      problema: `${archivo}: la acción \`${expresion}\` no se declara acá ni se importa, no hay módulo que vigilar`,
    };
  }

  const modulo = resolver(especificador, archivo);

  if (modulo === undefined) {
    return {
      sitio,
      problema: `${archivo}: la acción \`${expresion}\` viene de '${especificador}', que no resuelve a un módulo del proyecto`,
    };
  }

  if (!modulo.startsWith(`app${path.sep}`)) {
    return {
      sitio,
      problema: `${archivo}: la acción \`${expresion}\` vive en ${modulo}, fuera de app/`,
    };
  }

  return { sitio, modulo };
}

const archivos = archivosDeApp().filter((archivo) => /\.tsx?$/u.test(archivo));
const acciones = archivos.map((archivo) => accionesDe(archivo));
const sitios = acciones.flatMap(({ sitios: encontrados }) => encontrados);

/** Los sitios cuya acción es un identificador: los únicos que pueden venir de otro módulo. */
const porIdentificador = sitios.filter(({ expresion }) => IDENTIFICADOR.test(expresion));
const procedencias = porIdentificador.map((sitio) => procedenciaDe(sitio));

const MODULOS_DE_ACCIONES = [
  ...new Set(
    procedencias
      .map(({ modulo }) => modulo)
      .filter((modulo): modulo is string => modulo !== undefined),
  ),
];

describe('los módulos que proveen la acción de un formulario declaran la directiva', () => {
  it('encuentra los sitios donde un componente entrega una función como acción', () => {
    // Meta-guardia del barrido: con la lista vacía, las aserciones de abajo pasarían sin haber
    // mirado ningún formulario. Los dos de hoy son la confirmación de la venta —el `<form>` del
    // detalle— y el alta, que entrega su acción a `useActionState`.
    expect(sitios.length).toBeGreaterThan(1);
    expect(
      sitios.map(({ archivo }) => archivo),
      'la confirmación de la venta dejó de verse como sitio de acción',
    ).toContain(path.join('app', 'libros', '[id]', 'page.tsx'));
    expect(sitios.map(({ archivo }) => archivo)).toContain(
      path.join('app', 'componentes', 'formulario-alta.tsx'),
    );

    // Y los **dos orígenes** están representados: la cuenta exacta de abajo compara sólo los del
    // JSX, así que con todos los sitios etiquetados igual estaría comparando otra cosa. La
    // dirección peligrosa —etiquetar un sitio de hook como `jsx`— la caza esa cuenta, que se
    // pasaría de largo; ésta cubre la inversa, que la dejaría vacía.
    const origenes = new Set(sitios.map(({ origen }) => origen));

    expect(origenes).toContain('jsx');
    expect(origenes).toContain('hook');
  });

  it('no se le escapa ningún atributo action del JSX', () => {
    // Falla cerrado: si un `action={…}` llevara llaves adentro —una arrow con cuerpo, un objeto— el
    // reconocedor no lo capturaría y el sitio desaparecería de la lista en silencio. Acá la cuenta no
    // da y alguien lo revisa.
    //
    // **La cuenta es sólo la del JSX, y es exacta.** Antes mezclaba los dos orígenes en el mismo
    // balde —los deducía por la ausencia de `=>`— y comparaba con `>=`, así que en un archivo que
    // además usa `useActionState` el sitio del hook tapaba la falta: con un segundo formulario de
    // acción inline en `app/componentes/formulario-alta.tsx`, la cuenta daba `2 >= 2`, la suite
    // entera quedaba en verde (289/289) y la acción inline no la inspeccionaba nadie. En un archivo
    // sin hook sí daba rojo, que es lo que hacía creer que estaba cerrado.
    //
    // Importa ahora y no en abstracto: el Block 5 estrena `app/componentes/formulario-edicion.tsx`,
    // que es un formulario **con** `useActionState`, o sea que nace exactamente en ese punto ciego.
    for (const { archivo, sitios: encontrados, aperturas } of acciones) {
      const enJsx = encontrados.filter(({ origen }) => origen === 'jsx').length;

      expect(
        enJsx,
        `${archivo}: hay ${String(aperturas)} atributos action={…} y el reconocedor capturó ${String(enJsx)}`,
      ).toBe(aperturas);
    }
  });

  it('cada sitio es un identificador o un literal, nunca una expresión sin revisar', () => {
    // Una acción escrita inline (`action={async () => { … }}`) es una Server Action en el cuerpo de
    // un componente y tiene su propia regla —la directiva adentro de la función—, así que esta
    // guardia no puede opinar sobre ella y lo correcto es pedir que alguien la revise.
    for (const { archivo, expresion } of sitios) {
      expect(
        IDENTIFICADOR.test(expresion) || LITERAL_DE_TEXTO.test(expresion),
        `${archivo}: la acción \`${expresion}\` no es un identificador ni un literal, hay que revisarla a mano`,
      ).toBe(true);
    }
  });

  it('resuelve cada acción importada a un módulo de app/', () => {
    expect(porIdentificador.length).toBeGreaterThan(0);
    expect(procedencias.flatMap(({ problema }) => problema ?? [])).toEqual([]);

    // Los dos de hoy, nombrados: si el reconocedor dejara de encontrar uno, la guardia de abajo
    // pasaría en silencio sobre el otro. El del Block 5 entra solo con su formulario.
    expect(MODULOS_DE_ACCIONES).toContain(path.join('app', 'acciones.ts'));
    expect(MODULOS_DE_ACCIONES).toContain(path.join('app', 'acciones-libro.ts'));
    expect(MODULOS_DE_ACCIONES.length).toBeGreaterThan(1);
  });

  it('todos declaran la directiva de Server Actions', () => {
    // La aserción que la meta-guardia por nombre de `test/app/acciones.test.ts` no hacía sobre el
    // archivo nuevo. Sin la directiva, el `POST` del formulario no llega a la función: Next.js no
    // registra la acción, y en los tests no se nota porque ahí es una función común.
    expect(MODULOS_DE_ACCIONES.length).toBeGreaterThan(1);

    for (const modulo of MODULOS_DE_ACCIONES) {
      expect(
        DIRECTIVA_DE_SERVIDOR.test(leer(modulo)),
        `${modulo} provee la acción de un formulario y no declara 'use server'`,
      ).toBe(true);
    }
  });
});
