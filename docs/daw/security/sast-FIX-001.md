# SAST — FIX-001: Colores ANSI del proceso hijo de Vitest rompen el test de umbrales de cobertura en CI

| Campo | Valor |
|-------|-------|
| Ticket | FIX-001 |
| Tier | QUICK-FIX |
| Fecha | 2026-08-25 |
| Alcance | `test/app/acciones.test.ts` (único archivo modificado) |

## Cambio auditado

Se agregó `env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }` a las opciones de un
`spawnSync` ya existente en un test. No se agregó, quitó ni modificó ningún argumento del proceso
hijo (`process.execPath` y una lista fija de strings literales) — sólo se fijaron dos variables de
entorno adicionales, heredando el resto de `process.env`.

## Hallazgos

- **Secretos**: ✅ F-SAST-01 — no se introduce ningún literal de credencial, token o cadena de
  conexión. `.env` sigue en `.gitignore` (sin cambios de este ticket).
- **Inyección de comandos**: ✅ F-SAST-03 — los argumentos del `spawnSync` son literales fijos en
  el código fuente (`path.join(raiz, 'node_modules/vitest/vitest.mjs')`, `'run'`, `'--coverage'`,
  `'--root'`, `'.'`); ninguno proviene de entrada de usuario. Las variables de entorno agregadas
  son valores fijos (`'0'`, `'1'`), no interpolación de datos externos.
- **Inyección SQL/NoSQL**: N/A — el archivo no contiene consultas.
- **XSS y funciones inseguras**: ✅ F-SAST-04/06 — no hay `eval`, `innerHTML` ni
  `dangerouslySetInnerHTML` en el cambio.
- **Path traversal**: ✅ F-SAST-05 — la ruta al binario de Vitest se arma con `path.join` sobre
  `process.cwd()`, sin entrada externa (ya existía antes de este fix).
- **Logging de datos sensibles**: ✅ F-SAST-10 — `env` sólo agrega banderas de color, no vuelca
  variables de entorno a ningún log.
- **Validación de entrada / manejo de errores**: N/A — el cambio no toca lógica de validación ni de
  manejo de errores de producción; es un test.
- **Dependencias**: ✅ F-SAST-13/16 — `npm audit --audit-level=high` reporta 0 vulnerabilidades.

## Suppressions

Ninguna — no hubo hallazgos Medium, High ni Critical que requieran documentar una supresión.

## Resultado

**PASSED** — 0 Critical, 0 High, 0 Medium. `gates.sast = true`.
