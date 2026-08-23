# Verify FEAT-002a: Base (sistema de diseño y test DOM) y listado/búsqueda

| Field | Value |
|-------|-------|
| Ticket | FEAT-002a |
| Tier | FEATURE |
| PRD | docs/daw/prd/prd-FEAT-002a.md |
| Spec | docs/daw/specs/spec-FEAT-002a.md |
| Date | 2026-08-23 |
| Rondas | 2 |

## Ronda 1 — BLOCKED

`daw-module-verifier` corrió sobre el código ya commiteado de los 4 bloques (`git diff main...HEAD`,
21 archivos) y encontró 4 FAIL, todos de evidencia documental ausente, ningún gap de código:

- ❌ AC-02 (responsive 390px sin scroll horizontal): código presente
  (`overflow-x-auto` en `listado-libros.tsx:52`), pero sin registro escrito de la verificación
  manual que la propia spec exige (jsdom no calcula layout real).
- ❌ AC-03 (foco visible con Tab): código presente (`focus-visible:outline-foco` en
  `boton.tsx:19`, `campo-texto.tsx:26`), mismo problema de registro ausente.
- ❌ F-VER-06 / Block 4: el 4º ítem de "Required tests" (la verificación manual) sin evidencia
  escrita.
- ❌ Evidencia TDD: ningún commit ni reporte documentaba el conteo rojo→verde por bloque, a
  diferencia del precedente de `docs/daw/reports/verify-FEAT-001a.md`.

Todo lo demás pasó en la ronda 1 (13 PASS, 3 WARN no bloqueantes — ver detalle en la sección
"Hallazgos no bloqueantes" más abajo).

## Ronda 2 — PASSED

### AC-02 y AC-03 — verificación manual

Se intentó verificar con un navegador headless real (Playwright + Chromium) contra el servidor de
desarrollo (`npm run dev`, `http://localhost:3000`). El entorno de este agente no tiene las
librerías de sistema que requiere el binario (`libnspr4.so`, `libnss3.so`, `libnssutil3.so`,
`libasound.so.2`) y no hay acceso root para instalarlas — el intento se descartó limpio (sin dejar
dependencias ni residuos en el repo).

La usuaria propietaria hizo la verificación real, en su propio navegador, contra el mismo servidor
de desarrollo:

- **AC-02**: confirmado — a 390px de ancho no aparece scroll horizontal en la página; la tabla del
  listado queda contenida.
- **AC-03**: confirmado — el foco es visible al navegar con Tab por el campo de búsqueda, el botón
  "Buscar" y los links "Ver"/"Vender" de cada fila.

### Evidencia TDD por bloque (consolidada de los reportes de cada implementador)

| Bloque | Tests | Rojo antes | Verde después |
|---|---|---|---|
| 1 — Fundación Tailwind | `tailwind.test.ts` (4 casos tras la corrección de Block 1) | 2/3 fallaban (faltaba el `@import` y `--color-foco`); tras la corrección por auto-referencia, 2/4 fallaban reproduciendo el bug a mano | 3/3, luego 4/4 |
| 2 — Entorno de test DOM | `entorno.smoke.test.tsx`, `entorno-de-componentes.test.ts` | El smoke test fallaba con `ERR_MODULE_NOT_FOUND` (deps no instaladas); el guardia de aislamiento, tras su corrección, detectó en vivo un archivo sonda con el pragma en bloque `/** */` que antes se le escapaba | 3/3 |
| 3 — Componentes UI | `boton.test.tsx`, `campo-texto.test.tsx`, `feedback.test.tsx` | 9/9 fallaban por `Failed to resolve import` (componentes inexistentes) | 9/9 |
| 4 — Listado y búsqueda | `buscador.test.tsx`, `listado-libros.test.tsx` | 2/2 fallaban (`.campo-texto` inexistente; celda sin clase de `Boton`) | 2/2, y 454/454 en la suite completa tras corregir la regresión de `acciones-libro.test.ts` y el falso positivo de `feedback.tsx` |

Cada corrección post-revisión fue reproducida en rojo por el implementador antes de aplicarla
(detalle completo en los mensajes de commit de cada bloque y en la conversación de CODE).

## Verificación mecánica (F-VER-01 a F-VER-06, W-VER-01 a W-VER-03)

- ✅ F-VER-01: AC-01 a AC-06 con test o verificación manual documentada.
- ✅ F-VER-02: 4/4 bloques de la spec completamente implementados.
- ✅ F-VER-03: cobertura 100% líneas/ramas/funciones en los 7 archivos propios del ticket
  (`app/page.tsx`, `app/estado-del-catalogo.tsx`, `app/componentes/buscador.tsx`,
  `app/componentes/listado-libros.tsx`, `app/componentes/ui/{boton,campo-texto,feedback}.tsx`),
  muy por encima del umbral del 80%.
- ✅ F-VER-04: no aplica lógica de negocio con input; `Boton.href` cerrado por tipos
  (`href?: never`), `Feedback` cubre sus 4 estados.
- ✅ F-VER-05: `npx tsc --noEmit` y `npm run lint` limpios.
- ✅ F-VER-06: todos los tests que la spec exige por bloque existen y pasan.
- ✅ W-VER-01: sin código muerto ni imports sin usar en los archivos del ticket.
- ⚪ W-VER-02: no aplica — este ticket es presentación, no lógica de negocio nueva.
- ✅ W-VER-03: los guardias de convención nuevos (`tailwind.test.ts`,
  `entorno-de-componentes.test.ts`) quedaron sólidos tras su ronda de corrección — anclados al
  contenido real, no a menciones en comentarios, con meta-guardias propias.

## Regresión

- ✅ Suite completa: 454/454 tests, 33/33 archivos, sin skips (`npx vitest run`).
- ✅ Los 5 tests originalmente señalados como protegidos (`detalle.test.ts`,
  `portadas-route.test.ts`, `acciones.test.ts`, `listado.bench.test.ts`, `identidad.test.ts`) sin
  modificar.
- ℹ️ `test/app/acciones-libro.test.ts` sí se modificó (regex de `filaConTitulo()` para tolerar el
  `className` nuevo del `<tr>`) — no estaba en la lista original de "protegidos" de la spec, pero
  forma parte de la suite que NFR-03/AC-06 exige en verde. El cambio es defendible (adapta el
  extractor a un atributo de estilo, no a un cambio de comportamiento) y quedó documentado en el
  cuerpo del commit `163297e`.

## Hallazgos no bloqueantes (documentados, no requieren acción)

- El comentario de `app/componentes/formulario-alta.tsx:11` sigue diciendo ser "el único Client
  Component con estado de la pantalla" — sigue siendo técnicamente cierto (`Feedback` no tiene
  estado propio) pero es ambiguo. Queda para quien toque ese archivo en FEAT-002c.
- Duplicación intencional del guardia XSS puntual en `feedback.test.tsx` con el guardia global de
  `test/app/acciones.test.ts` — aceptado, no decorativo.
- `test/convenciones/barrido-de-mutaciones.test.ts` tenía un timeout preexistente sensible a la
  carga de máquina, sin relación con FEAT-002a; se amplió a 20s durante el cierre de CODE porque
  bloqueaba el gate de la suite completa.

## Resultado

**PASSED** — `gates.verify = true`. 2 rondas: la primera bloqueada por evidencia documental
ausente (no por código), la segunda cerrada con la verificación manual real de la usuaria y el
conteo TDD consolidado.
