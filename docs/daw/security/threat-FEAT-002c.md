# Threat Model FEAT-002c: Modernizar el front — formularios (alta, edición, portada)

| Field | Value |
|-------|-------|
| Ticket | FEAT-002c |
| Date | 2026-08-25 |
| Result | PASSED |

## Contexto del diseño

FEAT-002c no toca `lib/db/` ni modifica ninguna Server Action de `app/acciones.ts` ni
`app/acciones-libro.ts` (NFR-02, AC-08): rediseña los tres formularios de carga individual (alta,
edición, portada) con los componentes compartidos de FEAT-002a (`CampoTexto`, `Feedback`) y una
extensión aditiva de `Boton` (`disabled`/`data-*`). Es el primer ticket que usa `CampoTexto` con
`type="file"` y el primero donde `Feedback` alcanza su estado `'exito'` (sólo en alta —
`altaDeLibro()` no redirige en éxito, a diferencia del resto de las Server Actions del proyecto).

## Superficies de ataque identificadas

1. **`Boton` extendido** (Server Component, sin cambios de superficie real) — `disabled`/`data-*`
   son props literales que cada formulario define en su propio código, nunca datos que la usuaria
   cargó.
2. **`CampoTexto` con `type="file"`** (primer uso de esta combinación) — el archivo que sube la
   usuaria sigue procesándose exactamente igual que antes (`guardarPortada()`/`crearLibro()`, sin
   tocar); este ticket sólo cambia cómo se presenta el `<input>`, no cómo se valida ni se guarda el
   archivo.
3. **`Feedback` alcanzando `'exito'` por primera vez** (en `formulario-alta.tsx`) — muestra
   `MENSAJE_ALTA_EXITOSA`, un texto fijo del código, no un dato devuelto por la usuaria ni derivado
   de la base.

## Fronteras de confianza

- **Navegador ↔ `CampoTexto`/`Boton` (Server Components)**: sin cambios — siguen sin manejadores de
  evento propios (ADR-001), y el archivo que suba la usuaria en el `<input type="file">` de
  `CampoTexto` llega al mismo `FormData` que ya procesaban `crearLibro()`/`guardarPortada()`, sin un
  paso nuevo en el medio.
- **Navegador ↔ `Feedback` (Client Component)**: misma frontera ya declarada por FEAT-002a/FEAT-002b
  — `mensaje` sigue siendo siempre texto curado (`avisoDe()` en cada formulario), nunca un error
  crudo de infraestructura. `altaDeLibro()` ya cura sus errores de infraestructura
  (`MENSAJE_ERROR_INESPERADO`, `app/acciones.ts:86`) exactamente igual que
  `edicionDeLibro()`/`asignarFoto()`.

## Análisis STRIDE

| Componente | S | T | R | I | D | E |
|---|---|---|---|---|---|---|
| `Boton` extendido | N/A | Ver riesgo 1 | N/A | N/A | N/A | N/A |
| `CampoTexto` con `type="file"` | N/A | N/A | N/A | N/A | N/A | N/A |
| `Feedback` en `formulario-alta.tsx` (incl. `'exito'`) | N/A | N/A | N/A | Ver riesgo 2 | N/A | N/A |

Categorías sin riesgo aplicable (Spoofing, Repudiation, Denial of Service, Elevation of Privilege):
el proyecto sigue sin autenticación por decisión de producto (PRD-001 §6) y este ticket no agrega
ninguna escritura nueva — sólo presentación sobre Server Actions que ya existían.

## Riesgos

| Riesgo | STRIDE | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| 1. `Boton` extendido habilitara `disabled`/`data-*` en la variante `as="a"`, donde `disabled` no tiene sentido nativo en un `<a>` (rompería en silencio la promesa de que esa variante queda intacta) | Tampering | Baja | Bajo | El spec del bloque 1 tipa `disabled`/`data-*` únicamente en `PropsBotonComoBoton`, nunca en `PropsComunes` — `<Boton as="a" disabled>` no compila. Confirmado por el arch-auditor de PLAN. |
| 2. `Feedback` mostrara el error crudo de infraestructura del alta en vez del texto curado, al conectar por primera vez el estado `'exito'` junto con `'error'` en el mismo componente | Information Disclosure | Baja | Alto si ocurriera | `altaDeLibro()` ya cura el mensaje antes de devolverlo (`MENSAJE_ERROR_INESPERADO`, `mensajeDeCampo()`, `mensajeDeConflicto()` en `app/acciones.ts`, sin tocar por este ticket). El spec documenta que `Feedback.mensaje` en `formulario-alta.tsx` recibe únicamente `avisoDe(estado)` (que deriva de `estado.mensaje`/`estado.general`, ambos ya curados), igual criterio que FEAT-002b. |

Ningún riesgo alcanza CRITICAL/HIGH: este ticket no toca `lib/db/`, no modifica ninguna Server
Action y no agrega ninguna escritura nueva — sólo presentación sobre lo que ya existía. No hace
falta un riesgo aceptado formal (F-TM-04).

## Datos sensibles

Ninguno nuevo. Los mismos datos que ya manejan los tres formularios (título, editorial, stock,
precio, foto) — ninguno es PII ni credencial; no aplica cifrado adicional (F-TM-07 no aplica).

## Mitigaciones a incorporar en la spec

1. `disabled`/`data-*` se agregan únicamente a `PropsBotonComoBoton`, nunca a `PropsComunes` ni a
   `PropsBotonComoEnlace`.
2. `Feedback.mensaje` en `formulario-alta.tsx` recibe únicamente `avisoDe(estado)`, nunca un error
   capturado localmente (no hay `try/catch` en ningún Client Component de este ticket).
3. Ningún bloque usa `dangerouslySetInnerHTML`, `innerHTML` ni URLs `javascript:` (cubierto por el
   guardia existente, sin test nuevo).

## Resultado

**PASSED** — 2 riesgos identificados, los 2 con mitigación folded en la spec, 0 riesgos
CRITICAL/HIGH, 0 riesgos aceptados formalmente (no hicieron falta).
