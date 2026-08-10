import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const configuracion = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'data/**',
      '.tmp-tests/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Va último: apaga las reglas de formato que se pisarían con Prettier.
  prettier,
];

export default configuracion;
