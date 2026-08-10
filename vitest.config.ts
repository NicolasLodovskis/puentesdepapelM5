import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const raiz = path.dirname(fileURLToPath(import.meta.url));

// `server-only` sólo exporta un módulo vacío bajo la condición `react-server`, que
// Next.js aplica y Vitest no: sin alias, cualquier test que importe `lib/db/` explota
// con el error de "Client Component" del propio paquete. La ruta se resuelve con
// `createRequire` en vez de asumir un `node_modules/` plano.
const servidorSolo = createRequire(import.meta.url).resolve('server-only');
const servidorSoloVacio = path.join(path.dirname(servidorSolo), 'empty.js');

export default defineConfig({
  resolve: {
    alias: {
      '@': raiz,
      'server-only': servidorSoloVacio,
    },
  },
  // La transformación de JSX se fija acá y no se delega a `tsconfig.json`, porque ese
  // archivo lo reescribe Next.js solo: con Next 15 imponía `jsx: "preserve"`, que dejaba
  // el JSX sin transformar, y entonces todo test que importara un `.tsx` fallaba y el
  // proveedor de cobertura descartaba el archivo en silencio, reportando verde sobre
  // código no medido. Next 16 pasó a imponer `jsx: "react-jsx"` y hoy alcanzaría con eso,
  // pero depender de un valor que otra herramienta reescribe es volver a apostar a que
  // no cambie. `test/app/layout.test.ts` es el detector si alguna vez vuelve a romperse.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['./test/ayudas/entorno.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
});
