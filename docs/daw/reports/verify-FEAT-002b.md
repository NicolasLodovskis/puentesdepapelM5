# Verify FEAT-002b: Modernizar el front — detalle de libro

| Field | Value |
|-------|-------|
| Ticket | FEAT-002b |
| PRD | docs/daw/prd/prd-FEAT-002b.md |
| Spec | docs/daw/specs/spec-FEAT-002b.md |
| Tier | FEATURE |
| Date | 2026-08-25 |

## Ronda 1 — FAILED (evidencia documental, no código)

`daw-module-verifier` corrió una verificación independiente completa contra el PRD, la spec, el
threat model, el SAST y los 5 archivos de código + 5 de test del diff
(`git diff origin/main...HEAD --stat`), corriendo `npx tsc --noEmit`, `npm run lint` y `npm test`
por su cuenta.

Resultado: **FAILED**, con 3 FAIL — los tres de evidencia documental ausente, no de código:

- ❌ AC-02 (responsive 390px sin scroll horizontal): código presente (`flex-col`/`sm:flex-row` en
  `detalle-libro.tsx`), pero sin registro escrito de la verificación manual que la propia spec
  exige (jsdom no calcula layout real — mismo límite ya declarado por FEAT-002a).
- ❌ AC-05 (foco visible con Tab): código presente (`focus-visible:outline-foco` en los 9 elementos
  interactivos del detalle), mismo problema de registro ausente.
- ❌ Evidencia TDD: ningún artefacto en disco (commits, `.daw-state.json`) consolidaba el conteo
  rojo→verde por bloque — existía en la conversación de CODE (reportes de cada `daw-implementer`),
  pero no estaba escrita en ningún lado verificable de forma independiente.

Todo lo demás pasó en la ronda 1: 14 PASS (incluida la trazabilidad de AC-01, AC-03, AC-04, AC-06,
AC-07; los 5 bloques de la spec completamente implementados; cobertura 98.16%/95.27%/98.97%/98.15%
sobre 474/474 tests; `tsc`/`lint` limpios; los 12 checkboxes de "Required tests" de la spec
verificados 1:1), 2 WARN no bloqueantes (ver más abajo).

El agente intentó cerrar el gap de AC-02/AC-05 por su cuenta con Playwright antes de reportar FAIL:
Chromium está en caché pero le faltan librerías del sistema (`libnspr4.so`, `libnss3.so`,
`libnssutil3.so`, `libasound.so.2`) y no hay acceso root para instalarlas — mismo bloqueo exacto que
ya documentó `docs/daw/reports/verify-FEAT-002a.md`. El intento no dejó residuos en el repo.

## Ronda 2 — PASSED

### AC-02 y AC-05 — verificación manual

Mismo camino que FEAT-002a: la usuaria propietaria hizo la verificación real, en su propio
navegador, contra el servidor de desarrollo (`npm run dev`, `http://127.0.0.1:3000/libros/2` —
"El Principito Box", stock 2, para que la sección de venta se renderice completa):

- **AC-02**: confirmado — a 390px de ancho no aparece scroll horizontal en el detalle; los cuatro
  datos del libro, la portada, los formularios de edición/portada y la sección de venta quedan
  visibles y operables.
- **AC-05**: confirmado — el foco es visible al navegar con Tab por el link "Volver al catálogo",
  el input de foto y el botón "Cambiar foto", el botón "Quitar foto" (`BotonEnvio`), los cuatro
  campos de edición y el botón "Guardar", y el botón "Confirmar venta" (`BotonEnvio`).
- **Flujo de venta end-to-end**: confirmado sin regresión — la venta se confirma desde el detalle
  igual que antes de este ticket (mitigación del riesgo de AC-17 del PRD maestro, declarada en el
  PRD de este sub-ticket).

### Evidencia TDD por bloque (consolidada de los reportes de cada implementador)

| Bloque | Tests del bloque | Rojo antes | Verde después |
|---|---|---|---|
| 1 — BotonEnvio | `boton-envio.test.tsx` (4 casos) | Suite entera fallaba: `Failed to resolve import "@/app/componentes/ui/boton-envio"` — 0 tests corridos, el archivo no existía (creación ex-nihilo; el `module-verifier` del bloque aceptó explícitamente este tipo de evidencia para un archivo que no existía en absoluto) | 4/4 |
| 2 — page.tsx (venta) | 1 test nuevo en `detalle.test.ts` (`formularioDeVenta()` + foco visible) | Rojo real: `AssertionError` — el `<button>` de venta del código previo no tenía ninguna clase, el assert sobre `focus-visible:outline-foco` fallaba contra el marcado real | 23/23 (`detalle.test.ts` completo) |
| 3 — detalle-libro.tsx | 1 test nuevo de convención (`sistema-de-diseno-detalle.test.ts`) + 1 regresión (`data-campo`) | El de convención: rojo real (`expected false to be true`, sin ningún token compartido en el código previo). El de regresión ya pasaba antes por diseño — el bloque no cambia contenido, sólo clases (mismo criterio que usa el propio spec para este caso) | 27/27 |
| 4 — formulario-edicion.tsx | 3 tests de `Feedback` (`formulario-edicion.test.tsx`) + 1 de convención + 1 regresión (`data-edicion`) | 4/5 rojo real: los 3 de `Feedback` fallaban porque `role="status"` no existía en el `<p className="aviso error">` anterior; el de convención fallaba sin tokens. El de regresión ya pasaba antes (mismo criterio que Block 3) | 69/69 (acumulado) |
| 5 — formulario-portada.tsx | 3 tests de `Feedback` + 1 de `BotonEnvio` en contexto + 1 de convención (`formulario-portada.test.tsx`) + 1 regresión (`data-portada`) | 5/5 rojo real: los de `Feedback`/`CamposDePortada` fallaban por `Cannot find module` (sub-componente recién extraído); el de `BotonEnvio` en contexto fallaba porque el botón real nunca se deshabilitaba; el de convención fallaba sin tokens. El de regresión ya pasaba antes | 72/72 (suite del ticket) |

Cada corrección posterior a una revisión (ninguna hizo falta: los 5 bloques pasaron sus dos rondas
de revisión — spec y arquitectura — en el primer intento) habría sido reproducida en rojo antes de
aplicarla, mismo protocolo que FEAT-001a/FEAT-002a.

### Resultado final por regla

- ✅ F-VER-01: las 7 AC del PRD (AC-01 a AC-07) con test que pasa o verificación manual documentada.
- ✅ F-VER-02: 5/5 bloques de la spec completamente implementados, verificados contra el código real.
- ✅ F-VER-03: cobertura agregada 98.16% líneas / 95.27% ramas / 98.97% funciones (474/474 tests).
  Archivos propios del ticket: `boton-envio.tsx` 100/100/100, `page.tsx` 100/100/100,
  `detalle-libro.tsx` 100/100 (sin ramas), `formulario-edicion.tsx` 100%/100%/91.66% ramas,
  `formulario-portada.tsx` 100%/100%/92.85% ramas — los cinco por encima del umbral del 80%.
- ✅ F-VER-04: no aplica lógica de negocio nueva con input de la usuaria en este ticket
  (`BotonEnvio` sólo recibe props literales del código); el camino "infeliz" del mapeo
  `estado→Feedback` (`estado.ok === false`) sí está testeado en los dos formularios.
- ✅ F-VER-05: `npx tsc --noEmit` y `npm run lint` limpios (1 warning no bloqueante, ver abajo).
- ✅ F-VER-06: los 12 checkboxes de "Required tests" de los 5 bloques de la spec, verificados 1:1
  contra el código de test real (nombres de archivo, casos y aserciones).
- ⚠️ W-VER-01: `test/componentes/formulario-portada.test.tsx:23` — parámetro `_datos` sin usar en
  el tipo del mock (necesario para que la firma coincida con el call site de `quitarFoto`); eslint
  lo reporta como warning, no error, no bloquea.
- ⚪ W-VER-02: no aplica — ticket de presentación, sin lógica de negocio nueva.
- ⚠️ W-VER-03: rama sin cubrir `estado.general ?? ''` en `formulario-edicion.tsx:41` y
  `formulario-portada.tsx:33` (el caso `estado.general === undefined` con `estado` no `null`);
  cobertura de calidad, no baja ningún archivo del umbral del 80%, no bloquea.

## Resultado

**PASSED** en la ronda 2 (ronda 1 bloqueada por evidencia documental ausente, no por código): las 7
AC del PRD verificadas, los 5 bloques de la spec completos, cobertura y calidad por encima de los
umbrales, verificación manual de AC-02/AC-05 y del flujo de venta confirmada por la usuaria.
