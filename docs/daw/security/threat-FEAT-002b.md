# Threat Model FEAT-002b: Modernizar el front — detalle de libro

| Field | Value |
|-------|-------|
| Ticket | FEAT-002b |
| Date | 2026-08-25 |
| Result | PASSED |

## Contexto del diseño

FEAT-002b no toca `lib/db/` ni modifica ninguna Server Action de `app/acciones-libro.ts` (NFR-02):
aplica estilos del sistema de diseño de FEAT-002a a `app/libros/[id]/page.tsx` y
`app/componentes/detalle-libro.tsx`, y **conecta por primera vez** el componente `Feedback`
(construido pero no conectado por FEAT-002a) a las Server Actions reales de edición y portada. El
único componente nuevo es `app/componentes/ui/boton-envio.tsx`, un Client Component que lee
`useFormStatus()` para dar estado de carga a los dos formularios que no usan `useActionState`
(`ventaDeLibro`, `quitarFoto`).

## Superficies de ataque identificadas

1. **`Feedback` conectado a Server Actions reales** (`formulario-edicion.tsx`, `formulario-portada.tsx`)
   — por primera vez recibe un `mensaje` que depende del resultado de una escritura real
   (`edicionDeLibro`, `asignarFoto`), no un valor de prueba como en FEAT-002a.
2. **`BotonEnvio`** (Client Component nuevo) — lee `useFormStatus()` (estado interno de React/Next,
   no dato del usuario) y renderiza `data-*`/`className`/`children` que la pantalla le pasa como
   props literales en el código, no como datos que la usuaria cargó.
3. **Estilos nuevos sobre `detalle-libro.tsx`, `formulario-edicion.tsx`, `formulario-portada.tsx`** —
   los mismos cuatro campos del libro (título, editorial, stock, precio) que ya se renderizaban antes
   de este ticket, ahora con clases Tailwind alrededor.

## Fronteras de confianza

- **Navegador ↔ `detalle-libro.tsx`/`page.tsx` (Server Components)**: sin cambios — siguen
  renderizando el mismo `Libro` que ya venía de `leerLibroPorId()`, ahora con clases Tailwind.
- **Navegador ↔ `Feedback` (Client Component, ahora conectado)**: frontera ya declarada por
  FEAT-002a, que dejó como restricción para quien lo conectara: `mensaje` siempre es texto curado,
  nunca el error crudo de infraestructura. Este ticket es quien efectivamente cruza esa frontera.
- **Navegador ↔ `BotonEnvio` (Client Component nuevo)**: nueva frontera de ejecución en el cliente,
  pero sin dato de usuario involucrado — sólo el estado `pending` de `useFormStatus()` y props
  literales del código (`data-venta="confirmar"`, etc.).

## Análisis STRIDE

| Componente | S | T | R | I | D | E |
|---|---|---|---|---|---|---|
| `Feedback` conectado | N/A | Ver riesgo 1 | N/A | Ver riesgo 1 | N/A | N/A |
| `BotonEnvio` | N/A | Ver riesgo 2 | N/A | N/A | N/A | N/A |
| Estilos en `detalle-libro.tsx`/formularios | N/A | Ver riesgo 3 | N/A | N/A | N/A | N/A |
| Formularios sin feedback inline (`ventaDeLibro`/`quitarFoto`) | N/A | N/A | N/A | N/A | N/A | Ver riesgo 4 |

Categorías sin riesgo aplicable (Spoofing, Repudiation, Elevation of Privilege salvo riesgo 4): el
proyecto sigue sin autenticación por decisión de producto (PRD-001 §6) y este ticket no agrega
ninguna acción nueva que escriba — sólo presentación sobre acciones que ya existían.

## Riesgos

| Riesgo | STRIDE | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| 1. `Feedback` mostrara el error crudo de infraestructura (nombre de tabla, ruta del archivo `.db`) en vez del texto curado, si el mapeo de `formulario-edicion.tsx`/`formulario-portada.tsx` usara por error `String(error)` en vez de `estado.general` | Information Disclosure | Baja | Alto si ocurriera | `edicionDeLibro()` y `asignarFoto()` ya curan el mensaje antes de devolverlo (`MENSAJE_ERROR_DE_EDICION`, `MENSAJE_ERROR_DE_FOTO`, `mensajeDeCampo()`, `mensajeDeConflicto()` en `app/acciones-libro.ts`) — este ticket no toca esa curación, sólo pinta lo que ya vuelve curado. Se documenta en la spec: `Feedback.mensaje` recibe únicamente `estado?.general`/`mensajes[campo]`, nunca un `error` capturado en el propio componente cliente (que no captura ninguno — no hay `try/catch` en Client Components de este ticket). |
| 2. `BotonEnvio` habilitara pasar un atributo arbitrario (`onClick`, `dangerouslySetInnerHTML`) por el spread de props si su tipo quedara demasiado abierto | Tampering | Baja | Bajo | El spec del bloque 1 tipa `BotonEnvio` con `ButtonHTMLAttributes<HTMLButtonElement>` (atributos nativos válidos de un `<button>`) más `Record<\`data-${string}\`, string>` para los `data-*` — nunca `Record<string, unknown>` ni un tipo abierto. Ningún dato de usuario llega a esas props: son literales que cada pantalla escribe en su propio código (`data-venta="confirmar"`). |
| 3. Reaparición de HTML sin escapar (mitigación 9 de FEAT-002a) al reestilizar `detalle-libro.tsx`, `formulario-edicion.tsx` y `formulario-portada.tsx`, que ya pintan título/editorial cargados por la usuaria | Tampering | Baja | Alto | **Ya cubierto**: el guardia existente `test/app/acciones.test.ts` ("no inyecta HTML sin escapar en ningún archivo de `app/`") barre recursivamente todo `app/`, así que los tres archivos modificados quedan cubiertos sin test nuevo. Ningún bloque de este ticket usa `dangerouslySetInnerHTML`, `innerHTML` ni URLs `javascript:`. |
| 4. Un fallo de infraestructura en `ventaDeLibro()`/`quitarFoto()` no tiene mensaje inline (por diseño: ambas `Promise<void>` sólo `redirect()`/`notFound()`/`throw`) — si alguien esperara ver el error en la propia pantalla, podría reintentar sin saber la causa real | Repudiation (del lado de la usuaria: no queda un rastro visible del motivo) | Media (es el comportamiento actual, sin cambios) | Bajo | **Riesgo aceptado, no de este ticket**: es el comportamiento que ya existe hoy (`app/error.tsx`, fuera de alcance del PRD padre) y NFR-02 prohíbe tocarlo. FR-03 sólo exige el indicador de carga para estas dos acciones, no un mensaje de error inline — interpretación ya declarada y aprobada en PLAN. No requiere aceptación formal F-TM-04 porque no es un riesgo que este ticket introduzca: es la ausencia de un cambio, documentada para que quede trazable. |

Ningún riesgo alcanza CRITICAL/HIGH: este ticket no toca `lib/db/`, no modifica ninguna Server Action
y no agrega ninguna escritura nueva — sólo presentación sobre lo que ya existía. No hace falta un
riesgo aceptado formal (F-TM-04).

## Datos sensibles

Ninguno nuevo. Los mismos datos que ya maneja el detalle (título, editorial, stock, precio, foto de
portada) — ninguno es PII ni credencial; no aplica cifrado adicional (F-TM-07 no aplica).

## Mitigaciones a incorporar en la spec

1. `Feedback.mensaje` en `formulario-edicion.tsx`/`formulario-portada.tsx` recibe únicamente
   `estado?.general` o `mensajes[campo]` (ya curados por `acciones-libro.ts`), nunca un error crudo
   capturado localmente.
2. `BotonEnvio` tipa sus props con `ButtonHTMLAttributes<HTMLButtonElement> & Record<\`data-${string}\`, string>`,
   nunca un tipo abierto (`Record<string, unknown>` o similar).
3. Ningún bloque usa `dangerouslySetInnerHTML`, `innerHTML` ni URLs `javascript:` (cubierto por el
   guardia existente, sin test nuevo).
4. `ventaDeLibro`/`quitarFoto` quedan sin cambios: sólo reciben el indicador de carga de
   `BotonEnvio`, ningún mensaje de error inline — la spec lo documenta como interpretación
   declarada, no como omisión.

## Resultado

**PASSED** — 4 riesgos identificados, los 4 con mitigación folded en la spec, 0 riesgos
CRITICAL/HIGH, 0 riesgos aceptados formalmente (no hicieron falta).
