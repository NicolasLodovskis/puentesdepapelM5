import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Fundación de estilos de FEAT-002a (Block 1): Tailwind CSS v4 en modo CSS-first, sin
 * `tailwind.config.ts`. Todo el contrato de este bloque vive en `app/globals.css`, y este
 * archivo es el único guardia automatizado que lo verifica — el resto (contraste AA real,
 * compilación) se comprueba a mano al fijar los valores y con `npm run build`, según la spec.
 *
 * **Qué agujero cierra, medido.** Sin este guardia, alguien podría borrar `@import
 * "tailwindcss"` o cualquiera de los cuatro tokens de `@theme` y ni `npm run lint` ni
 * `npx tsc --noEmit` lo notarían: son CSS, no TypeScript. El único lugar que lo iba a notar
 * era `npm run build` fallando de forma indirecta (clases de Tailwind sin generar) en un
 * bloque posterior, ya con el bloque 1 dado por cerrado.
 */

const RAIZ = process.cwd();
const RUTA_GLOBALS = path.join(RAIZ, 'app', 'globals.css');

/**
 * Se lee una sola vez el fuente crudo: la segunda aserción (ausencia de `.pantalla`) tiene que
 * mirar el mismo texto que la primera, sin pasar por ningún parser CSS que normalice selectores
 * y pueda ocultar una coincidencia.
 */
const fuente = fs.readFileSync(RUTA_GLOBALS, 'utf8');

/**
 * El contenido del bloque `@theme` de `app/globals.css`, sin las llaves que lo delimitan.
 *
 * Buscar los tokens en el fuente completo (`fuente.toContain(token)`) no es falsable: el
 * comentario explicativo que precede al bloque (líneas 3-18) nombra los cuatro tokens en prosa
 * para documentar el contraste elegido, así que borrar las declaraciones reales de `@theme` y
 * dejar el comentario intacto seguía dando verde. Anclar la búsqueda a este bloque es lo que
 * hace que borrar la declaración real se note.
 *
 * `[\s\S]*?` (no ávido) porque el archivo tiene más de un bloque de llaves después de `@theme`
 * (`body { … }`, `.detalle { … }`, etc.): un cuantificador ávido se comería hasta el último `}`
 * del archivo y devolvería reglas que no son del tema.
 */
function bloqueTheme(fuenteCss: string): string {
  return fuenteCss.match(/@theme\s*\{([\s\S]*?)\n\}/u)?.[1] ?? '';
}

describe('app/globals.css — fundación de Tailwind CSS v4 (Block 1 de FEAT-002a)', () => {
  it('importa Tailwind', () => {
    expect(fuente).toContain('@import "tailwindcss"');
  });

  it('extrae de verdad el bloque @theme, y sólo ese bloque', () => {
    // Meta-guardia de `bloqueTheme()`: si devolviera siempre `''`, la aserción de abajo se
    // pondría roja contra un `@theme` correcto por la razón equivocada, y nadie lo notaría hasta
    // que alguien mirara por qué el guardia de tokens es imposible de pasar. Y si el recorte se
    // pasara de largo (cuantificador ávido), el bloque devuelto incluiría reglas ajenas como
    // `.detalle` y una prosa de comentario que mencione un selector no relacionado se colaría
    // igual que en el bug original.
    expect(bloqueTheme('@theme {\n  --color-texto: #111;\n}\nbody { color: red; }')).toBe(
      '\n  --color-texto: #111;',
    );
    expect(bloqueTheme('sin bloque theme acá')).toBe('');

    // Sobre el archivo real: no vacío, y sin la regla `.detalle` que viene después de `@theme`.
    const theme = bloqueTheme(fuente);
    expect(theme.length).toBeGreaterThan(0);
    expect(theme).not.toContain('.detalle');
  });

  it('define los cuatro tokens mínimos de @theme que exigen FR-03/AC-01/NFR-01', () => {
    // Se exige el patrón de declaración (`--token:`) dentro del bloque `@theme` extraído, y no el
    // nombre suelto en el archivo completo: un `@theme` vacío con el nombre mencionado sólo en el
    // comentario de arriba (líneas 3-18) pasaría un guardia que buscara la palabra clave en
    // cualquier lado, y dejaría sin foco visible (FR-03) o sin contraste garantizado (NFR-01) sin
    // que nada lo notara. El signo `:` es lo que una oración de prosa no puede reproducir después
    // del nombre del token sin que se note como código, así que ancla la búsqueda a una
    // declaración real.
    const theme = bloqueTheme(fuente);
    for (const token of ['--color-texto', '--color-fondo', '--color-borde', '--color-foco']) {
      expect(
        theme,
        `app/globals.css no declara ${token}: dentro de su bloque @theme`,
      ).toContain(`${token}:`);
    }
  });

  it('no le agrega ninguna regla al selector .pantalla', () => {
    // Guardia de la mitigación del impact scan: `.pantalla` ya existe en el HTML de
    // `app/page.tsx`, `app/error.tsx`, `app/not-found.tsx` y `app/libros/[id]/page.tsx`, y las
    // tres últimas están fuera de alcance de este ticket. Agregarle una regla acá filtraría
    // estilo a pantallas que este bloque no tiene que tocar.
    //
    // Se busca el patrón crudo, con y sin espacio antes de la llave, en vez de parsear CSS: es
    // exactamente lo que un `grep` manual de revisión haría, y no depende de que ninguna
    // herramienta de parseo esté disponible en el entorno de test.
    expect(fuente).not.toMatch(/\.pantalla\s*\{/u);
  });
});
