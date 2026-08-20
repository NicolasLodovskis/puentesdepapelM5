# Reporte de verificación — FEAT-001b

| Campo | Valor |
|---|---|
| Ticket | FEAT-001b — Venta y edición |
| Tier | FEATURE |
| PRD | `docs/daw/prd/prd-FEAT-001b.md` |
| Spec | `docs/daw/specs/spec-FEAT-001b.md` |
| Threat model | `docs/daw/security/threat-FEAT-001b.md` |
| Reporte SAST | `docs/daw/security/sast-FEAT-001b.md` |
| Rondas de verificación | 1 — PASSED |
| Resultado | **PASSED** (gate `verify` satisfecho en la ronda 1) |

> Este archivo se **agrega**, no se sobrescribe. Cuántas rondas tardó la verificación es parte de lo
> que pasó.

---

## Ronda 1 — 2026-08-20 — **PASSED**

Verificación cruzada independiente por `daw-module-verifier`, un agente que no escribió nada de este
código y no participó de los bloques. Alcance: el ticket completo (5 bloques), no un bloque
individual — es el gate de VERIFY, distinto del que corrió por bloque durante CODE.

### Gates re-derivados de forma independiente (no heredados del cierre de CODE)

| Comando | Resultado |
|---|---|
| `npx vitest run --coverage` | 365 tests, 20 archivos, 0 fallos |
| Cobertura | 97.73 % statements · 92.82 % branches · 98.64 % functions · 97.71 % lines |
| `npx tsc --noEmit` | limpio |
| `npm run lint` | limpio |
| `npm run format:check` | limpio |

### F-VER-01 a F-VER-06 (`.daw/rules/validation-rules.instructions.md` §5)

| Regla | Resultado |
|---|---|
| F-VER-01 — cada AC con test que pasa | ✅ 17/17 (tabla abajo) |
| F-VER-02 — cada bloque/tarea de la spec implementado | ✅ 5/5 bloques |
| F-VER-03 — cobertura ≥ 80 % líneas/ramas/funciones | ✅ 97.71 / 92.82 / 98.64 |
| F-VER-04 — sad path por función/endpoint con entrada | ✅ confirmado para `venderEjemplar()`, `editarLibro()`, el `[id]` de ruta y las dos Server Actions |
| F-VER-05 — lint/tsc sin errores | ✅ limpio |
| F-VER-06 — cada test listado en la spec existe y pasa | ✅ verificado bloque por bloque contra los checklists de "Required tests" |

WARNINGS (no bloquean):

- W-VER-02-like: `app/componentes/formulario-edicion.tsx` en 37.5 % de cobertura de ramas *aislado*
  (ternarios de UI sin ejercitar); el agregado sobre `lib/**`+`app/**` sigue por encima del 80 %.
- Los rótulos `AC-nn` desnudos se reutilizan entre los tests de FEAT-001a y de FEAT-001b con
  significado distinto (patrón preexistente, no introducido por este ticket); la trazabilidad
  sigue siendo explícita por el FR acompañante o por vivir en un archivo exclusivo del bloque.

### Las 9 condiciones de "Final verification" (spec-FEAT-001b.md)

| # | Condición | Resultado |
|---|---|---|
| 1 | 17 AC con test y trazabilidad explícita | ✅ |
| 2 | Las 11 mitigaciones M1-M11 con test de regresión propio | ✅ ninguna quedó sólo en prosa |
| 3 | Suite de FEAT-001a verde, sin editar sus aserciones de comportamiento fuera de la lista autorizada | ✅ verificado con `git diff` contra cada archivo de test preexistente; los únicos cambios son el conteo de `MIGRACIONES`, el stub del contrato, la lista `server-only` derivada y el acotamiento del `ORDER BY` de `consultas.ts` |
| 4 | `npm test` ≥ 80 % líneas/ramas/funciones | ✅ 97.71 / 92.82 / 98.64 |
| 5 | `npm run lint`, `format:check`, `tsc --noEmit` limpios | ✅ |
| 6 | Ninguna producción de las tres columnas derivadas fuera de `derivar-libro.ts` | ✅ barrido `grep` propio, cero coincidencias |
| 7 | Ninguna escritura de `libros` fuera de `lib/db/`; stock/precio siempre con su historial en la misma transacción | ✅ |
| 8 | Guardia de coherencia de identidad (M6) presente y falsable | ✅ confirmado por inspección: literal fijo vs. llamada viva a `normalizarTitulo()` |
| 9 | SAST sin hallazgos abiertos ni supresiones | ✅ 16 categorías limpias, 0 supresiones |

### AC-01 a AC-17 — trazabilidad

| AC | Implementación | Test |
|---|---|---|
| AC-01 | `lib/db/consultas.ts` `leerLibroPorId()`; `app/libros/[id]/page.tsx` | `test/db/consultas.test.ts:384`; `test/app/detalle.test.ts:257,272` |
| AC-02 | `lib/db/ventas.ts:105` `venderEjemplar()` | `test/db/ventas.test.ts:77`; `test/app/acciones-libro.test.ts:432` |
| AC-03 | `lib/db/ventas.ts:116-118` | `test/db/ventas.test.ts:148`; `test/app/acciones-libro.test.ts:509` |
| AC-04 | `lib/db/edicion.ts:268-277` | `test/db/edicion.test.ts:105` |
| AC-05 | `lib/db/edicion.ts:127-142` `validarPrecioDeEdicion()` | `test/db/edicion.test.ts:136`; `test/app/acciones-libro.test.ts:829` |
| AC-06 | `lib/db/edicion.ts:279-288` | `test/db/edicion.test.ts:169` |
| AC-07 | `lib/db/edicion.ts:260-266` | `test/db/edicion.test.ts:199` |
| AC-08 | `lib/db/libros.ts:163` `validarTexto()` (reusada) | `test/db/edicion.test.ts:231`; `test/app/acciones-libro.test.ts:829` |
| AC-09 | `lib/db/libros.ts:252-268` `buscarConflicto()` vía `edicion.ts:229` | `test/db/edicion.test.ts:270`; `test/app/acciones-libro.test.ts:842` |
| AC-10 | `lib/db/edicion.ts:235-253` | `test/db/edicion.test.ts:319` — intercepta `db.prepare` (`espiarSentencias()`), no compara sólo valores |
| AC-11 | `lib/db/ventas.ts:106-141`, `lib/db/edicion.ts:178-319` | `test/db/ventas.test.ts:223`; `test/db/edicion.test.ts:341` |
| AC-12 | `vitest.config.ts` (umbrales) | corrida de cobertura re-verificada de forma independiente |
| AC-13 | `lib/dominio/normalizar-titulo.ts:74-82` | `test/dominio/normalizar-titulo.test.ts:109,114,121`; `test/dominio/derivar-libro.test.ts:87` |
| AC-14 | `lib/db/libros.ts:252-268` vía `edicion.ts:229` | `test/db/edicion.test.ts:295`; `test/app/acciones-libro.test.ts:842` |
| AC-15 | `lib/db/migraciones/003-identidad.ts:87-124` | `test/db/identidad.test.ts:226,253` |
| AC-16 | `lib/db/migraciones/003-identidad.ts:96-101` | `test/db/identidad.test.ts:306,412,430`; `test/app/detalle.test.ts:343` |
| AC-17 | `app/componentes/listado-libros.tsx`; `app/acciones-libro.ts:53-112` | `test/app/acciones-libro.test.ts:932` y siguientes |

### M1 a M11 — trazabilidad

| M | Producción | Test de regresión |
|---|---|---|
| M1 | `app/mensajes.ts` `identificadorDeLibro()` | `test/app/detalle.test.ts:298`; `test/app/acciones-libro.test.ts:665,856` |
| M2 | `lib/db/ventas.ts:39-44` | `test/db/ventas.test.ts:246,265`; `test/app/acciones-libro.test.ts:482` |
| M3 | `app/acciones-libro.ts:103-111,178-182` | `test/app/acciones-libro.test.ts:457,815` |
| M4 | `lib/db/ventas.ts:107-108`, `lib/db/edicion.ts:180` | `test/db/ventas.test.ts:474-499` |
| M5 | `lib/db/consultas.ts:88-94` | `test/db/consultas.test.ts:413,489-537` |
| M6 | `lib/dominio/derivar-libro.ts` (único productor) | `test/db/identidad.test.ts:569-597` |
| M7 | `lib/db/migraciones/003-identidad.ts:90-123` | `test/db/identidad.test.ts:362,378,306,412` |
| M8 | `app/mensajes.ts` (constantes curadas) | `test/app/detalle.test.ts:492`; `test/app/acciones-libro.test.ts:703,772,883`; `test/db/identidad.test.ts:430` |
| M9 | `server-only` + SQL literal en los módulos nuevos | `test/db/migrar.test.ts:602-830`; `test/convenciones/sql.test.ts:284-425`; `test/app/detalle.test.ts:586-648` |
| M10 | `lib/db/conexion.ts:43-49,83-91` | `test/db/migrar.test.ts:486,531` |
| M11 | `app/componentes/listado-libros.tsx` (sin `'use client'`, sin `next/link`) | `test/app/detalle.test.ts:390,414`; `test/app/acciones-libro.test.ts:1013` |

### Verificaciones adicionales

- Los call sites de 2 argumentos de `crearLibro()` a `buscarConflicto()` (`libros.ts:371,409`) no se
  vieron afectados por el nuevo parámetro opcional `excluirId`.
- `SQL_BUSCAR_CONFLICTO_EXCLUYENDO` usa `AND NOT (id = ?)`, sin violar la prohibición de elegir una
  fila de `libros` por comparador de rango.
- `test/convenciones/barrido-de-mutaciones.test.ts` corrido en aislamiento: sin flakiness esta vez.

### Nota de proceso

A diferencia de FEAT-001a (4 rondas, 2 corrective loops), FEAT-001b cerró VERIFY en la primera
ronda. La diferencia atribuible: las guardias de convención (M9, la barrera SQL, la trazabilidad de
AC) que FEAT-001a tuvo que descubrir a los golpes durante VERIFY ya estaban escritas y vigentes
*antes* de que Block 5 empezara — el ticket las hereda en vez de tener que inventarlas bajo presión
de un FAIL.
