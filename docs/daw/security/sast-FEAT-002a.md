# SAST FEAT-002a: Base (sistema de diseño y test DOM) y listado/búsqueda

| Field | Value |
|-------|-------|
| Ticket | FEAT-002a |
| Date | 2026-08-23 |
| Result | PASSED |

## Alcance

Diff completo de la rama contra `main` (21 archivos, ver `git diff --stat main...HEAD`): fundación
Tailwind (`postcss.config.mjs`, `app/globals.css`), entorno de test DOM (5 devDependencies nuevas),
3 componentes de UI (`app/componentes/ui/`) y el reestilizado de `app/page.tsx`,
`app/componentes/buscador.tsx`, `app/componentes/listado-libros.tsx`,
`app/estado-del-catalogo.tsx`, más sus tests.

## Secretos

- ✅ F-SAST-01: sin API keys, passwords, tokens ni connection strings. Las únicas coincidencias de
  la palabra "token" en el diff son comentarios sobre "tokens de diseño" (`--color-foco`, etc.), no
  credenciales.
- ✅ `.env` y `.env.*` están en `.gitignore` (líneas 26-27, sin cambios de este ticket).

## Inyección

- ✅ F-SAST-02 (SQL): sin sentencias SQL en ningún archivo tocado — este ticket no toca `lib/db/`.
- ✅ F-SAST-03 (comandos): sin `child_process`, `exec`, `spawn` en los archivos nuevos/modificados.
- ✅ F-SAST-05 (path traversal): sin `fs`/`path.join`/`path.resolve` con entrada de usuario en
  `app/componentes/ui/` ni en las pantallas reestiladas. Los `fs.readFileSync` de los tests nuevos
  (`test/convenciones/tailwind.test.ts`, `entorno-de-componentes.test.ts`) sólo leen rutas fijas del
  propio repo (`process.cwd()` + constantes), sin entrada externa.

## XSS y funciones inseguras

- ✅ F-SAST-06 (XSS): sin `dangerouslySetInnerHTML`, `innerHTML` ni URLs `javascript:` en ningún
  archivo nuevo o modificado (grep sobre `app/componentes/ui/`, `app/page.tsx`, `buscador.tsx`,
  `listado-libros.tsx`, `estado-del-catalogo.tsx`). Cubierto además por el guardia preexistente de
  `test/app/acciones.test.ts` (barre todo `app/`) y por el guardia puntual de
  `test/componentes/feedback.test.tsx`.
- ✅ Sin `eval()`, sin deserialización insegura, sin criptografía débil (este ticket no introduce
  criptografía).
- ✅ Sin manejadores de evento (`onClick`, etc.) en `listado-libros.tsx` ni en `boton.tsx` — cero
  JavaScript de cliente por fila, verificado con grep además de por las tres rondas de revisión de
  arquitectura del bloque.

## Resto de categorías obligatorias

- ✅ F-SAST-07 (SSRF): no aplica, sin llamadas a servicios externos.
- ✅ F-SAST-09 (debug en producción): sin `console.log`/`console.debug` agregados en el diff.
- ✅ F-SAST-10 (logging de datos sensibles): no aplica, sin logging nuevo.
- ✅ F-SAST-11 (upload sin restricción): no aplica, este ticket no toca la carga de portadas.
- ✅ F-SAST-12 (CSRF): no aplica — el único formulario tocado (`Buscador`) sigue siendo un `GET`
  sin efecto secundario; no se agregó ningún formulario que mute estado.
- ✅ F-SAST-14 (validación de entrada incompleta): `CampoTexto` es presentacional — no valida, y no
  reemplaza ninguna validación de negocio existente (siguen en `lib/dominio/` y las Server Actions,
  sin cambios).
- ✅ F-SAST-15 (manejo de errores que filtra internals): `Feedback.mensaje` es contractualmente
  texto curado por quien lo use (mitigación 3 del threat model FEAT-002a); este ticket no lo conecta
  a ningún error real todavía.

## Dependencias

- ✅ F-SAST-13/16: `npm audit` (con y sin `--omit=dev`) → **0 vulnerabilidades** en las 5
  devDependencies nuevas (`tailwindcss`, `@tailwindcss/postcss`, `jsdom`,
  `@testing-library/react`, `@testing-library/jest-dom`) y en el resto del árbol.
- ✅ Las 5 devDependencies nuevas están fijadas a versión exacta (sin `^`/`~`) en `package.json`,
  mitigación 2 del threat model.

## Suppressions

Ninguna — no hubo hallazgos Medium que requirieran supresión documentada.

## Resultado

**PASSED** — 0 Critical, 0 High, 0 Medium sin resolver, 0 vulnerabilidades de dependencias.
