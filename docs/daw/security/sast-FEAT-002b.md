# SAST FEAT-002b: Modernizar el front — detalle de libro

| Field | Value |
|-------|-------|
| Ticket | FEAT-002b |
| Date | 2026-08-25 |
| Scope | 5 archivos de aplicación modificados/nuevos (Blocks 1-5) + 5 archivos de test |
| Result | PASSED |

## Alcance del escaneo

```
app/componentes/detalle-libro.tsx
app/componentes/formulario-edicion.tsx
app/componentes/formulario-portada.tsx
app/componentes/ui/boton-envio.tsx (nuevo)
app/libros/[id]/page.tsx
```

Ningún archivo de `app/acciones-libro.ts` ni `lib/db/` aparece en el diff de la rama contra `main`
(confirmado con `git diff origin/main...HEAD --stat`) — consistente con NFR-02 del PRD.

## Secretos

- ✅ F-SAST-01: sin patrones de API key/password/token/connection-string en los archivos del
  scope (grep sobre `api[_-]?key|secret|password|token\s*=|AKIA...`).
- ✅ `.env` sigue en `.gitignore` (sin cambios de este ticket).

## Inyección

- ✅ F-SAST-02 (SQL/NoSQL): ningún archivo del scope toca `lib/db/` ni construye queries.
- ✅ F-SAST-03 (comando): sin `exec`/`spawn`/`child_process` en el scope.
- ✅ F-SAST-05 (path traversal): sin entrada de usuario usada para construir una ruta de archivo en
  el scope (el manejo de la foto de portada, en `guardarPortada()`, no se toca).

## XSS y funciones inseguras

- ✅ F-SAST-06: `grep` de `dangerouslySetInnerHTML`/`innerHTML`/`javascript:` sobre los 5 archivos
  del scope → 0 ocurrencias. Cubierto además por el guardia existente
  `test/app/acciones.test.ts` (recursivo sobre todo `app/`) y por el test puntual de
  `boton-envio.test.tsx` (Block 1).
- ✅ F-SAST-04/F-SAST-17: sin `eval()`, `new Function()` ni deserialización insegura en el scope.
- ✅ F-SAST-08 (cripto débil): no aplica — ningún archivo del scope maneja criptografía.

## Resto de categorías obligatorias

- ✅ F-SAST-07 (SSRF): no aplica — sin llamadas HTTP salientes en el scope.
- ✅ F-SAST-09 (debug en producción): sin flags de debug ni configuración nueva.
- ✅ F-SAST-10 (logging de datos sensibles): `grep` de `console.*` sobre los 5 archivos del scope →
  0 ocurrencias (ninguno de los archivos de este ticket loguea nada; el logging existente de
  `acciones-libro.ts` no se toca).
- ✅ F-SAST-11 (upload sin restricción): el `<input type="file">` de portada no cambia — sigue
  validado por `guardarPortada()`, fuera del scope de este ticket.
- ✅ F-SAST-12 (CSRF): sin cambios a la validación de `Origin` de Next.js (mitigaciones 1/6 de
  FEAT-001a, no tocadas).
- ✅ F-SAST-14 (validación de input incompleta): ningún archivo del scope recibe input nuevo de la
  usuaria — `BotonEnvio` sólo recibe props literales del código, `Feedback` sólo mensajes ya
  curados (mitigación 1 del threat model de este ticket, verificada en el bloque 4/5).
- ✅ F-SAST-15 (manejo de errores que filtra internals): ningún archivo del scope agrega manejo de
  errores nuevo — los `try/catch` que curan mensajes de infraestructura siguen sólo en
  `acciones-libro.ts`, sin tocar.

## Dependencias

- ✅ F-SAST-13/16: `package.json`/`package-lock.json` sin cambios en este ticket (diff vacío).
  `npm audit` (con y sin `devDependencies`): **0 vulnerabilidades**.

## Suppressions

Ninguna — no hubo hallazgos Medium que requieran documentación de supresión.

## Resultado

**PASSED** — 0 hallazgos Critical/High/Medium. `npm audit`: 0 vulnerabilidades.
