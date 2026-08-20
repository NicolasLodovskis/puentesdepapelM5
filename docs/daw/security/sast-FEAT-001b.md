# Reporte SAST — FEAT-001b

| Campo | Valor |
|---|---|
| Ticket | FEAT-001b — Venta y edición |
| Barrido | **closeout** (implementación completa: bloques 1 a 5) — primer y único barrido de este ticket |
| Fecha | 2026-08-19 |
| Alcance | Diff completo contra `main` (base `a620d683`): `app/`, `lib/db/`, `lib/dominio/`, `docs/`, `test/` — 45 archivos |
| Resultado | **PASSED** (0 Critical, 0 High, 0 Medium, 0 Low, 0 supresiones) |

---

## Secretos (F-SAST-01) — ✅ limpio

Sin coincidencias de `api_key`, `secret`, `password`, `token`, `bearer`, `BEGIN ... PRIVATE KEY`
ni `AKIA[0-9A-Z]{16}` en el diff completo del ticket. `.gitignore` mantiene `.env`, `.env.*` (con
excepción explícita de `.env.example`); `git ls-files` no trackea ningún `.env` ni `.db`.

## Inyección SQL (F-SAST-02) — ✅ limpio

Las nueve sentencias nuevas de `lib/db/edicion.ts` (`SQL_LIBRO_A_EDITAR`,
`SQL_ACTUALIZAR_TITULO`, `SQL_ACTUALIZAR_EDITORIAL`, `SQL_ACTUALIZAR_PRECIO`,
`SQL_ACTUALIZAR_STOCK`, `SQL_INSERTAR_HISTORIAL_PRECIO`, `SQL_INSERTAR_HISTORIAL_STOCK`) y las de
`lib/db/ventas.ts`, `lib/db/consultas.ts` y `lib/db/migraciones/002-ventas.ts` /
`003-identidad.ts` son template literals sin `${}` interno, ligadas por `?` posicional. Verificado
con `grep` sobre el diff completo: cero coincidencias de `SQL_[A-Z_]*\s*=\s*\`[^\`]*\${` y cero
`.prepare(\``.

La única interpolación en un `db.exec()` de todo el diff es
`lib/db/migrar.ts:61` — `` db.exec(`PRAGMA user_version = ${versionNueva}`) `` —, y `versionNueva`
no es entrada externa: sale de `migracion.numero`, un literal de `MIGRACIONES` (`lib/db/migraciones/index.ts`),
validado además con `Number.isInteger()` una línea antes de usarse (`migrar.ts:58-59`). Cubierto
además por las guardias de convención del proyecto (`test/convenciones/sql.test.ts`), que
recorren todo `lib/db/` y no encuentran ningún módulo sin registrar.

Adicionalmente, `buscarConflicto()` (`lib/db/libros.ts`) gana un parámetro `excluirId` para
Block 5, resuelto con `AND NOT (id = ?)` —ligado, no interpolado— y verificado por
`daw-module-verifier` contra la guardia que prohíbe comparar `id` por rango.

## Inyección de comandos de SO (F-SAST-03) — ✅ limpio

Sin `child_process`, `execSync`, `spawn`. Las coincidencias de `.exec(` en el diff son
`RegExp.prototype.exec` (`normalizar-titulo.ts:77`, `parsear-precio.ts:85`) y `Database.prototype.exec`
de better-sqlite3 sobre SQL literal (`migrar.ts`) — ninguna ejecuta un comando del sistema
operativo.

## Deserialización insegura (F-SAST-04) — ✅ limpio

Sin `eval()`, sin `new Function`, sin deserializador inseguro. El único `JSON.parse` del diff
es interno a un helper de test (`catalogo-de-prueba.ts`, sobre datos que el propio test generó,
Rule #0 de `testing.instructions.md`).

## Path traversal (F-SAST-05) — ✅ no aplica

Los `readFileSync`/`readdirSync` que aparecen en el diff son todos de `test/` recorriendo el
propio árbol del repositorio (`process.cwd()` + rutas relativas fijas) para las guardias de
convención — no hay entrada de usuario en ninguna ruta de archivo. El código de producción
(`app/`, `lib/`) no toca el filesystem.

## XSS (F-SAST-06) — ✅ limpio

Sin `dangerouslySetInnerHTML`, sin `innerHTML`, sin `javascript:` fuera de las cadenas que los
propios tests usan para *detectar* ese patrón. `título`/`editorial` los pinta React (que escapa
por defecto) en `detalle-libro.tsx`, `listado-libros.tsx` y `formulario-edicion.tsx`; verificado
además por un test dedicado (`test/app/detalle.test.ts`, "escapa el título y la editorial").

## SSRF (F-SAST-07) — ✅ no aplica

Sin `fetch`, sin cliente HTTP, sin llamada a servicio externo en todo el diff.

## Criptografía rota (F-SAST-08) — ✅ no aplica

Sin hashing ni cifrado: el proyecto no maneja credenciales (PRD-001 §6, un único usuario sin
login).

## Modo debug en producción (F-SAST-09) — ✅ limpio

Sin flags de debug ni configuración que degrade producción.

## Logging de datos sensibles (F-SAST-10) — ✅ limpio

Los tres `console.error()` nuevos/existentes en el camino de venta y edición
(`app/acciones-libro.ts:75,153`, `app/acciones.ts:62`) registran únicamente un texto curado fijo
y el objeto `error` — nunca el `FormData` de la petición. Verificado por un test dedicado (M8,
`test/app/acciones-libro.test.ts` — serializa con `util.inspect` y confirma que ningún argumento
logueado es una instancia de `FormData` ni contiene un valor de ejemplo puesto en el formulario).

## Carga sin restricciones (F-SAST-11) — ✅ no aplica

El proyecto no tiene endpoint de subida de archivos.

## CSRF (F-SAST-12) — ✅ cubierto (heredado de FEAT-001a)

Las dos Server Actions nuevas (`ventaDeLibro`, `edicionDeLibro`) son invocables como POST directo
(TB-1 del threat model), pero Next.js valida el header `Origin` en cada Server Action por
defecto, y el proyecto no relaja `allowedDevOrigins` (mitigaciones 1 y 6 de FEAT-001a, con guardia
de convención propia). Sin autenticación por decisión de producto (PRD-001 §6), compensada con
bind a `127.0.0.1` (riesgo aceptado A1, heredado).

## CVEs en dependencias (F-SAST-13/16) — ✅ limpio

`npm audit --production`: **0 vulnerabilidades**. No se agregó ninguna dependencia nueva en este
ticket (revisado contra `package.json` del diff — sin cambios).

## Validación de entrada incompleta (F-SAST-14) — ✅ limpio

Los cuatro campos de la edición se validan íntegramente en el servidor reusando
`validarTexto`/`validarStock`/`parsearPrecio` (mismas reglas que el alta, sin una segunda
implementación) antes de cualquier escritura; el identificador de ruta y de formulario pasa por
`identificadorDeLibro()` (M1) antes de tocar la base en las tres superficies que reciben un id
(`[id]/page.tsx`, `ventaDeLibro`, `edicionDeLibro`).

## Manejo de errores inseguro (F-SAST-15) — ✅ limpio

Ningún camino nuevo relanza el error crudo del motor hacia la usuaria: los mensajes de venta,
edición y colisión de identidad son constantes curadas (`MENSAJE_ERROR_DE_VENTA`,
`MENSAJE_ERROR_DE_EDICION`, `MENSAJE_COLISION_DE_IDENTIDAD`), verificadas por el test que deriva
**todos** los textos exportados de `app/**/*.{ts,tsx}` (no una lista a mano) y afirma que ninguno
contiene `SQLITE_`, `.db`, ni nombres de tabla/columna (M8).

## Funciones inseguras (F-SAST-17) — ✅ limpio

Sin coincidencias de uso no contextual de funciones inseguras fuera de lo ya cubierto arriba.

---

## Resultado

```
┌─────────────────────────────────────────────────────────────┐
│  /daw-security-sast — PASSED                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Secretos:            ✅ F-SAST-01                           │
│  Inyección SQL:       ✅ F-SAST-02                           │
│  Inyección de SO:     ✅ F-SAST-03                           │
│  Deserialización:     ✅ F-SAST-04                           │
│  Path traversal:      ✅ F-SAST-05 (no aplica)                │
│  XSS:                 ✅ F-SAST-06                           │
│  SSRF:                ✅ F-SAST-07 (no aplica)                │
│  Criptografía:        ✅ F-SAST-08 (no aplica)                │
│  Debug en prod:       ✅ F-SAST-09                           │
│  Logging sensible:    ✅ F-SAST-10                           │
│  Upload:              ✅ F-SAST-11 (no aplica)                │
│  CSRF:                ✅ F-SAST-12 (heredado)                 │
│  CVEs dependencias:   ✅ F-SAST-13/16 (npm audit: 0)          │
│  Validación entrada:  ✅ F-SAST-14                           │
│  Manejo de errores:   ✅ F-SAST-15                           │
│  Funciones inseguras: ✅ F-SAST-17                           │
│                                                              │
│  Supresiones: 0                                              │
│                                                              │
│  ────────────────────────────────────────────────────────────│
│  Total: 16 categorías limpias, 0 vulnerabilidades             │
│  Report: docs/daw/security/sast-FEAT-001b.md                 │
│  Next: gates.sast = true → transición a VERIFY                │
└─────────────────────────────────────────────────────────────┘
```
