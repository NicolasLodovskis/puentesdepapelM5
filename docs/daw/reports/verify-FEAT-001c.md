# Verificación — FEAT-001c: Portadas

| Campo | Valor |
|---|---|
| Ticket | FEAT-001c |
| Tier | FEATURE |
| PRD | `docs/daw/prd/prd-FEAT-001c.md` |
| Spec | `docs/daw/specs/spec-FEAT-001c.md` |
| Threat model | `docs/daw/security/threat-FEAT-001c.md` |
| SAST | `docs/daw/security/sast-FEAT-001c.md` |
| Rondas | 1 |

## Ronda 1 — PASSED

### F-VER-01 — Cada AC del PRD tiene un test que pasa

Los 9 AC (AC-01 a AC-09) tienen al menos un test que los nombra por id:

| AC | Cubierto por |
|---|---|
| AC-01 | `test/app/acciones.test.ts:351,358`, integración e2e en `test/app/portadas-route.test.ts:282` |
| AC-02 | `test/app/portadas-route.test.ts:105` |
| AC-03 | `test/app/portadas-route.test.ts:118` |
| AC-04 | `test/app/portadas-route.test.ts:130,159` |
| AC-05 | `test/app/acciones-libro.test.ts:1124,1140` |
| AC-06 | `test/app/acciones-libro.test.ts:1256,1290` |
| AC-07 | `test/app/acciones-libro.test.ts:1157`, `test/app/acciones.test.ts:370,384` |
| AC-08 | `test/rendimiento/listado.bench.test.ts:236`, `test/rendimiento/portadas-route.bench.test.ts` |
| AC-09 | Cobertura real: 98.11% stmts / 91.97% branches / 98.92% funcs / 98.1% lines |

### F-VER-02 — Cada tarea del spec está implementada

Los 4 bloques del spec están implementados en su totalidad (ver "Coverage: PRD → blocks" abajo).

### F-VER-03 — Cobertura ≥ 80% en las tres métricas

98.11% stmts / 91.97% branches / 98.92% funcs / 98.1% lines. Por encima del umbral en las cuatro
métricas.

### F-VER-04 — Sad-path test por cada endpoint/función con input

Cubierto: `procesarPortada()` (formato inválido, tamaño excedido), `asignarFoto`/`quitarFoto` (id
inválido, fallo de infraestructura), `GET /portadas/[id]` (id inválido, portada inexistente, fallo
de lectura, carrera de `fs.statSync`).

### F-VER-05 — Lint/typecheck sin errores

`npm run lint`, `npx tsc --noEmit`, `npm run format:check`: los tres limpios, corridos en esta
ronda.

### F-VER-06 — Cada test listado en el spec existe y pasa

Los ~48 ítems de "Required tests" de los 4 bloques tienen su test correspondiente, verificado
bloque por bloque durante CODE y re-confirmado en esta ronda.

### Coverage: PRD → blocks (verificado contra el código real)

| Requisito | Bloque | Verificado |
|---|---|---|
| FR-01 | Block 2 | ✅ `app/acciones.ts`, `lib/db/libros.ts`, `lib/db/errores.ts`, `app/mensajes.ts` |
| FR-02, FR-03 | Block 3 | ✅ `app/acciones-libro.ts:asignarFoto/quitarFoto` |
| FR-04 | Blocks 1-3 | ✅ por construcción (`lib/portadas/` sin import de `lib/db/`/`better-sqlite3`); test de conteo de filas de historial |
| FR-05, FR-06 | Block 4 | ✅ columna "Portada", `.miniatura-portada`, logo optimizado versionado |
| FR-07 | Block 4 | ✅ `GET /portadas/[id]` nunca responde error |
| NFR-01 | Block 4 | ✅ benchmarks reales, p95 < 1000ms |
| NFR-02 | Todos | ✅ 98% >> 80% |

### Final verification del spec (líneas 516-533)

Las 6 condiciones, todas cumplidas — ver detalle en el reporte del agente de verificación.

### Mitigaciones del threat model (M12-M21)

Las 10 incorporadas y verificadas por test o revisión de código explícita.

### Riesgo aceptado A4

Sigue documentado en `docs/daw/security/threat-FEAT-001c.md` §4, referenciado en
`app/acciones.ts:97` y cubierto por test. No es un cabo suelto.

### W-VER — Hallazgos no bloqueantes

- **Desviación de naming documentada**: el threat model y el spec nombraban un archivo nuevo
  `app/acciones-portada.ts`; la implementación puso `asignarFoto()`/`quitarFoto()` dentro de
  `app/acciones-libro.ts`, junto a `ventaDeLibro()`/`edicionDeLibro()`. Es una decisión de
  organización (mismo molde `useActionState`/sin-hook, mismas mitigaciones aplicadas), ya revisada
  por `daw-arch-auditor` bloque a bloque durante CODE (commit `d8120e2`). No es un gap funcional.

## Comandos corridos en esta ronda

```
npm test        → 436/436 passed, cobertura 98.11%/91.97%/98.92%/98.1%
npx tsc --noEmit → limpio
npm run lint     → limpio
npm run format:check → limpio
npm run build    → sin errores, /portadas/[id] presente en la tabla de rutas
```

## Veredicto

**PASSED.** 0 FAILs, 1 WARN no bloqueante (desviación de naming documentada). `gates.verify = true`.
