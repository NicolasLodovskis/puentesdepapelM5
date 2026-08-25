# Spec FEAT-002b: Modernizar el front — detalle de libro

| Field | Value |
|-------|-------|
| Ticket | FEAT-002b |
| PRD | docs/daw/prd/prd-FEAT-002b.md |
| Tier | FEATURE |
| Date | 2026-08-25 |
| Spec loops | 0 |

## Summary

Aplica el sistema de diseño de FEAT-002a (`Boton`, `CampoTexto`, `Feedback`, tokens `@theme`) al
detalle de libro y conecta por primera vez `Feedback` (construido pero no conectado por FEAT-002a) a
las Server Actions reales de edición y portada. **No rediseña los campos de los formularios de
edición ni de portada** — sigue el Out of Scope del PRD, que reserva ese trabajo para FEAT-002c: los
`<input>`/`<label>` nativos se estilizan in place, nunca se reemplazan por `CampoTexto`. El único
componente nuevo es `BotonEnvio` (`app/componentes/ui/boton-envio.tsx`), un Client Component que lee
`useFormStatus()` para dar estado de carga a los dos formularios sin `useActionState` (`ventaDeLibro`,
`quitarFoto`).

**Decisión de diseño declarada (aprobada en PLAN):** FR-03/FR-04 nombran literalmente "editar,
marcar venta" en el PRD; este spec extiende el mismo tratamiento (`Feedback`/`BotonEnvio`) a los dos
formularios de portada (`asignarFoto`/`quitarFoto`) por ser parte del mismo detalle y estar cubiertos
por FR-01/FR-05, que sí son transversales a toda la pantalla. `Feedback` nunca alcanza el estado
`'exito'`: las cuatro Server Actions redirigen en éxito y nunca devuelven un resultado positivo — el
redirect es la señal de éxito. `ventaDeLibro`/`quitarFoto` sólo reciben el indicador de carga
(FR-03): al ser `Promise<void>` sin `useActionState`, nunca devuelven un resultado de error inline
para pintar con `Feedback` — sus fallos de infraestructura siguen yendo al `app/error.tsx` existente,
sin cambio de comportamiento (NFR-02).

**Precedente de arquitectura declarado:** `BotonEnvio` se aparta del principio "Client Component
controlado enteramente por props, sin hooks internos" que ADR-001 fija para `Feedback` — lee
`useFormStatus()` adentro porque es la única forma de conocer el estado de un formulario cuya acción
es `Promise<void>` sin `useActionState` (el hook sólo funciona en un hijo del `<form>`, nunca en el
mismo componente que lo declara). FEAT-002c hereda esta API.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 2, Block 3, Block 4, Block 5 |
| FR-02 | Block 3 (layout principal), Block 2/4/5 (no agregan overflow) |
| FR-03 | Block 1, Block 2, Block 4, Block 5 |
| FR-04 | Block 4, Block 5 |
| FR-05 | Block 2, Block 3, Block 4, Block 5 |
| NFR-01 (Accesibilidad AA) | Strategy: reutiliza los tokens `--color-texto`/`--color-fondo`/`--color-borde` y las clases `focus-visible:outline-foco` ya validados por FEAT-002a; ningún bloque define paleta nueva. Final verification revisa contraste en `BotonEnvio` (único elemento con clases propias). |
| NFR-02 (No regresión funcional) | Strategy: ningún bloque modifica `app/acciones-libro.ts` ni `lib/db/`; el guardia `test/app/acciones-libro.test.ts` (existente) sigue verificando el comportamiento de las cuatro Server Actions sin cambios. |

## Dependencies between blocks

- Block 1 no depende de nada — es el componente nuevo.
- Block 2 depende de Block 1 (usa `BotonEnvio`).
- Block 3 es independiente.
- Block 4 es independiente.
- Block 5 depende de Block 1 (usa `BotonEnvio` para "quitar foto").

Orden sugerido: 1 → 2 → 3 → 4 → 5 (3 y 4 pueden invertirse entre sí, son independientes).

## Block 1 — `BotonEnvio`: botón con estado de carga para formularios sin `useActionState`

**Files**
- `app/componentes/ui/boton-envio.tsx` (new) — Client Component.

**Logic**
`'use client'`. Usa `useFormStatus()` de `react-dom` para leer `pending` del `<form>` padre (el
componente NO puede ser el mismo que declara el `<form>` — restricción del hook). Renderiza un
`<button type="submit">` nativo con spread de todas las props recibidas (`data-*`, `className`,
`children`, cualquier atributo nativo de `<button>`), y `disabled={pending}` — un `disabled`
explícito que la pantalla pase se respeta también (`disabled={pending || props.disabled}`), mismo
criterio defensivo que `disabled={enviando}` en `formulario-edicion.tsx`. Mientras `pending` es
`true`, agrega el texto de carga recibido por prop (`textoEnviando`) en vez de `children`, mismo
patrón que ya usa `formulario-edicion.tsx` (`{enviando ? 'Guardando…' : TEXTO_GUARDAR_EDICION}`).

**Input validation**
No aplica — no acepta datos de la usuaria, sólo props literales que el código de cada pantalla
define (`data-venta="confirmar"`, etc.).

**Tipado (mitigación 2 del threat model FEAT-002b)**
```ts
type PropsBotonEnvio = ButtonHTMLAttributes<HTMLButtonElement> &
  Record<`data-${string}`, string> & { textoEnviando?: string };
```
Nunca `Record<string, unknown>` ni un tipo abierto — el spread queda acotado a atributos nativos de
`<button>` más `data-*`.

**Error handling**
No aplica — el componente no ejecuta lógica que pueda fallar; `useFormStatus()` no lanza.

**Required tests**
- [ ] `test/componentes/boton-envio.test.tsx` (jsdom + RTL): dentro de un `<form action={...}>` con
  una Server Action simulada que tarda, el botón queda `disabled` mientras la acción está pendiente
  y vuelve a habilitarse al resolver — valida FR-03.
- [ ] Mismo archivo: `data-venta="confirmar"` (o cualquier `data-*` pasado) se renderiza en el DOM —
  valida que el spread no pierde el anclaje que usan los tests de `acciones-libro.test.ts`.
- [ ] Mismo archivo: el texto de `textoEnviando` reemplaza a `children` mientras `pending` es
  `true`, y vuelve a mostrar `children` al resolver.
- [ ] Guardia puntual: el archivo fuente no usa `dangerouslySetInnerHTML` ni `innerHTML` (mismo
  criterio que `feedback.test.tsx`).

**Completion criterion**
`app/componentes/ui/boton-envio.tsx` existe, tipa sus props con `ButtonHTMLAttributes` + `data-*`
acotado, y sus 4 tests pasan.

## Block 2 — `page.tsx`: sección de venta con diseño y estado de carga

**Files**
- `app/libros/[id]/page.tsx` (modified).

**Logic**
Clases Tailwind del sistema de diseño (`text-texto`, `bg-fondo`, `border-borde`, espaciados) en la
`<section className="venta">`, su `<h2>` y el párrafo `data-venta="sin-stock"`. El
`<button type="submit" data-venta="confirmar">` pasa a
`<BotonEnvio type="submit" data-venta="confirmar" textoEnviando="Vendiendo…">Confirmar venta</BotonEnvio>`
(el texto exacto del botón se toma de `TEXTO_CONFIRMAR_VENTA` en `app/mensajes.ts`, sin cambiarlo).
Agrega clases `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
focus-visible:outline-foco` al botón (mismas utilidades que ya usan `Boton`/`CampoTexto`).
**Actualiza el docstring de las líneas 42-44** que hoy afirma que el único componente cliente de la
pantalla es el `<Link>` de `DetalleLibro` — deja de ser cierto con `BotonEnvio` en esta misma
pantalla; el docstring debe decir que ahora hay dos: el `<Link>` y `BotonEnvio`, y que sigue sin
haber JavaScript de cliente por fila (no aplica NFR-01 de FEAT-001a, que es sobre el listado).

**Error handling**
No introduce ningún manejo de error nuevo — `ventaDeLibro()` sigue resolviendo en
`redirect()`/`notFound()`/`throw` exactamente igual; este bloque no toca `app/acciones-libro.ts`.

**Required tests**
- [ ] Extiende `test/app/detalle.test.ts` (o agrega un test en el mismo archivo): el botón de venta
  sigue conteniendo `data-venta="confirmar"` tras el cambio de marcado — el guardia que ya usa
  `formularioDeVenta()` en `test/app/acciones-libro.test.ts` no debe romperse (regresión, no test
  nuevo de comportamiento).
- [ ] `test/componentes/boton-envio.test.tsx` (Block 1) ya cubre el comportamiento de carga en
  aislamiento; no se duplica acá.

**Completion criterion**
`app/libros/[id]/page.tsx` usa `BotonEnvio` en la sección de venta, conserva
`data-venta="confirmar"`/`data-venta="sin-stock"`, el docstring queda actualizado, y
`test/app/acciones-libro.test.ts` sigue en verde sin modificaciones propias.

## Block 3 — `detalle-libro.tsx`: sistema de diseño y responsive

**Files**
- `app/componentes/detalle-libro.tsx` (modified).

**Logic**
Clases Tailwind con los tokens del sistema de diseño en `<article>`, `<dl className="datos-del-libro">`
(y sus `<dt>`/`<dd>`), `<section className="operaciones">` y la imagen de portada (borde/redondeo
consistente con `listado-libros.tsx`). Layout responsive: entre 360px y 1280px de ancho, todos los
datos y controles quedan visibles y operables sin scroll horizontal (AC-02) — usa utilidades flex/grid
de Tailwind, sin wrapper `overflow-x-auto` (esta pantalla no tiene una tabla ancha como el listado).
El `<Link href="/">Volver al catálogo</Link>` recibe clases de foco visible
(`focus-visible:outline...-foco`), igual criterio que el resto de elementos interactivos.

**Error handling**
No aplica — Server Component sin lógica nueva, mismos datos que ya recibía por props.

**Required tests**
- [ ] Extiende `test/app/detalle.test.ts`: los cuatro `data-campo` (`titulo`, `editorial`, `stock`,
  `precio`) siguen presentes y con el mismo contenido tras el cambio de clases — regresión de
  marcado, no de diseño visual (los tests de este proyecto no verifican CSS).
- [ ] Nuevo `test/convenciones/sistema-de-diseno-detalle.test.ts`: confirma que `page.tsx` (sección
  de venta, Block 2) y `detalle-libro.tsx` usan al menos una clase de los tokens compartidos
  (`text-texto`, `bg-fondo`, `border-borde` o `focus-visible:outline-foco`) — valida AC-01. Blocks 4
  y 5 **extienden este mismo archivo** (no crean uno nuevo) agregando la aserción sobre sus propios
  archivos, evitando una dependencia hacia adelante desde este bloque hacia bloques que todavía no
  corrieron.

> **AC-02 (responsive, sin scroll horizontal) y AC-05 (foco visible) no se verifican con un assert
> automatizado**: jsdom no calcula layout real ni `:focus-visible` computado — mismo límite ya
> declarado por FEAT-002a (`docs/daw/specs/spec-FEAT-002a.md`, Block 3). Se verifican manualmente a
> 390px de ancho y navegando con Tab, documentado en el reporte de cierre de CODE (ver Final
> verification).

**Completion criterion**
`app/componentes/detalle-libro.tsx` usa los tokens del sistema de diseño, ningún `data-campo` cambia
de contenido, el link de vuelta tiene clases de foco visible, y
`test/convenciones/sistema-de-diseno-detalle.test.ts` pasa para `page.tsx`/`detalle-libro.tsx`.

## Block 4 — `formulario-edicion.tsx`: diseño y `Feedback` conectado

**Files**
- `app/componentes/formulario-edicion.tsx` (modified).

**Logic**
Clases Tailwind sobre los `<input>`/`<label>` **nativos existentes** (sin reemplazarlos por
`CampoTexto` — Out of Scope del PRD): borde/foco/tipografía consistentes con el resto del detalle.
El `<p className="aviso error" aria-live="polite">{aviso}</p>` se reemplaza por:
```tsx
<Feedback
  estado={enviando ? 'cargando' : estado?.ok === false ? 'error' : 'inactivo'}
  mensaje={aviso}
/>
```
(mitigación 1 del threat model: `mensaje` recibe únicamente `avisoDe(estado)`, que ya deriva de
`estado.general` — nunca un error capturado localmente, este componente no tiene `try/catch`.) El
botón `<button type="submit" data-edicion="guardar" disabled={enviando}>` conserva su `data-*` y su
`disabled` sin cambios — no se reemplaza por `Boton` ni por `BotonEnvio` (ya tiene `enviando` de
`useActionState`, no necesita `useFormStatus`). Agrega clases de foco visible a los cuatro `<input>`
y al botón.

**Error handling**
No introduce ningún manejo de error nuevo: `edicionDeLibro()` no se modifica. Los mensajes por campo
(`mensajes.titulo`, etc.) siguen en sus propios `<p className="error-de-campo">`, sin tocar — están
fuera del alcance de `Feedback` (son errores de campo, no el aviso general que `Feedback`
reemplaza). El único cambio observable es que el aviso general se renderiza vía `Feedback` en vez
del `<p className="aviso error">` anterior; cubierto por los tests de abajo.

**Required tests**
- [ ] Nuevo `test/componentes/formulario-edicion.test.tsx` (jsdom + RTL): con `estado=null` (sin
  envío), `Feedback` no renderiza `role="status"` — valida el mapeo a `'inactivo'`.
- [ ] Mismo archivo: simulando un envío en curso (`enviando=true` vía un mock o disparando el
  submit sin resolver la Server Action), `Feedback` muestra `role="status"` con el mensaje de carga
  — valida FR-03.
- [ ] Mismo archivo: con un `estado` de rechazo (`ok: false, general: 'texto curado'`), `Feedback`
  muestra `role="status"` con ese texto exacto — valida FR-04 y la mitigación 1 (nunca un error
  crudo).
- [ ] Extiende `test/app/detalle.test.ts`: `data-edicion="guardar"` y los cuatro `data-operacion`
  siguen presentes — regresión del guardia existente (línea 297 y las de
  `test/app/acciones-libro.test.ts`).
- [ ] Extiende `test/convenciones/sistema-de-diseno-detalle.test.ts` (Block 3): agrega la aserción
  de tokens compartidos sobre `formulario-edicion.tsx` — valida AC-01 para este archivo.

**Completion criterion**
`formulario-edicion.tsx` usa `Feedback` para el aviso general, conserva todos sus `data-*` y
`disabled={enviando}`, y los 4 tests nuevos/extendidos pasan.

## Block 5 — `formulario-portada.tsx`: diseño, `Feedback` y `BotonEnvio`

**Files**
- `app/componentes/formulario-portada.tsx` (modified).

**Logic**
Mismo tratamiento de clases Tailwind que Block 4, sobre el `<input type="file">` y los dos
formularios existentes. El aviso del formulario "cambiar foto" (que sí usa
`useActionState(asignarFoto, null)`) pasa a `Feedback` con el mismo mapeo que Block 4
(`enviando`/`estado?.ok`). El botón `data-portada="cambiar" disabled={enviando}` conserva su
`data-*`/`disabled` sin cambios (mismo criterio que Block 4: ya tiene `enviando` propio). El
`<button type="submit" data-portada="quitar">` del formulario "quitar foto" (`quitarFoto`, sin
`useActionState`) pasa a `<BotonEnvio type="submit" data-portada="quitar"
textoEnviando="Quitando…">{TEXTO_QUITAR_FOTO}</BotonEnvio>` (Block 1) — es el segundo y último
consumidor de `BotonEnvio` en este ticket.

**Error handling**
No introduce ningún manejo de error nuevo: `asignarFoto()`/`quitarFoto()` no se modifican.
`quitarFoto()` sigue sin devolver un resultado inline — no es un error nuevo de este bloque, es el
comportamiento existente, ya documentado y aceptado como riesgo 4 del threat model
(`docs/daw/security/threat-FEAT-002b.md`): sus fallos de infraestructura siguen yendo al
`app/error.tsx` existente, sin cambio.

**Required tests**
- [ ] Nuevo `test/componentes/formulario-portada.test.tsx` (jsdom + RTL): mismos tres casos que
  Block 4 (`Feedback` inactivo/cargando/error) para el formulario "cambiar foto".
- [ ] Mismo archivo: el botón "quitar foto" queda `disabled` mientras su `<form>` está pendiente
  (mismo patrón de Block 1, aplicado en contexto) — valida FR-03 para `quitarFoto`.
- [ ] Extiende `test/app/detalle.test.ts` / `test/app/acciones-libro.test.ts`: `data-portada="cambiar"`
  y `data-portada="quitar"` (condicional a `tienePortada`) siguen presentes — regresión de las
  líneas 1399/1405 de `acciones-libro.test.ts`.
- [ ] Extiende `test/convenciones/sistema-de-diseno-detalle.test.ts` (Block 3): agrega la aserción
  de tokens compartidos sobre `formulario-portada.tsx` — valida AC-01 para este archivo, el último
  de las cuatro superficies del PRD.

**Completion criterion**
`formulario-portada.tsx` usa `Feedback` para el aviso de "cambiar foto" y `BotonEnvio` para "quitar
foto", conserva todos sus `data-*`, y los tests nuevos/extendidos pasan.

## Final verification

- `npm run lint`, `npx tsc --noEmit` y `npm test` (con umbral de cobertura del 80%) en verde,
  incluyendo `test/convenciones/sistema-de-diseno-detalle.test.ts` con las cuatro aserciones
  (`page.tsx`, `detalle-libro.tsx`, `formulario-edicion.tsx`, `formulario-portada.tsx` — AC-01).
- Ningún archivo de `app/acciones-libro.ts` ni `lib/db/` aparece en el diff (NFR-02, AC-07).
- `test/app/acciones-libro.test.ts` y `test/app/detalle.test.ts` pasan sin modificar sus aserciones
  sobre `data-venta`/`data-edicion`/`data-portada` (sólo se extienden si hace falta, nunca se relajan).
- Ningún archivo de `app/` usa `dangerouslySetInnerHTML`, `innerHTML` ni URLs `javascript:` (guardia
  existente de `test/app/acciones.test.ts`, sin acción nueva).
- **Verificación manual, documentada en el reporte de cierre de CODE** (mismo límite de jsdom ya
  declarado por FEAT-002a): a 390px de ancho, el detalle mantiene datos y controles visibles y
  operables sin scroll horizontal (AC-02); navegando con Tab, cada elemento interactivo del detalle
  muestra un estado de foco visible (AC-05).
- Revisión manual del flujo de venta end-to-end (confirmar venta desde el detalle) antes de cerrar
  el ticket — mismo criterio que el PRD fija como mitigación del riesgo de regresión en AC-17 del
  PRD maestro.
