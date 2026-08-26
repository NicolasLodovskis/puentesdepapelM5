# Spec FEAT-002c: Modernizar el front — formularios (alta, edición, portada)

| Field | Value |
|-------|-------|
| Ticket | FEAT-002c |
| PRD | docs/daw/prd/prd-FEAT-002c.md |
| Tier | FEATURE |
| Date | 2026-08-25 |
| Spec loops | 0 |

## Summary

Rediseña los tres formularios de carga individual (alta, edición, portada) con los componentes
compartidos de FEAT-002a: `CampoTexto` para cada campo (a diferencia de FEAT-002b, este PRD SÍ pide
rediseñar los campos) y `Boton` para los botones de submit. `Boton` gana `disabled`/`data-*`
(ADR-002, addendum a ADR-001) porque hoy no soporta ninguna de las dos y los tres formularios los
necesitan (`disabled={enviando}` de `useActionState`, y las anclas `data-edicion="guardar"`/
`data-portada="cambiar"` que ya usan los tests). `Feedback` se conecta por primera vez en
`formulario-alta.tsx`, con un mapeo de **4 estados** (incluido `'exito'`, alcanzable sólo ahí porque
`altaDeLibro()` no redirige en éxito) — en edición y portada ya está conectado desde FEAT-002b y no
se toca. Los `<p className="error-de-campo">` por campo se conservan tal cual junto a cada
`CampoTexto`, que no tiene slot de error.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 1, Block 2, Block 3, Block 4 |
| FR-02 | Block 2, Block 3, Block 4 (layout); Final verification (manual) |
| FR-03 | Block 2 (alta, nuevo); Block 3/Block 4 (ya cumplido por FEAT-002b, sin cambio) |
| FR-04 | Block 2 (alta, nuevo, incl. éxito); Block 3/Block 4 (ya cumplido, sin cambio) |
| FR-05 | Block 1 (Boton), Block 2/3/4 (CampoTexto ya trae foco visible) |
| NFR-01 (Accesibilidad + label) | Strategy: `CampoTexto` siempre renderiza `<label>`; cierra el gap de `formulario-portada.tsx` (Block 4) que hoy no tiene ninguno. Contraste AA: mismos tokens ya validados por FEAT-002a. |
| NFR-02 (No regresión funcional) | Strategy: ningún bloque toca `app/acciones.ts` ni `app/acciones-libro.ts`; los guardias existentes (`test/app/acciones-libro.test.ts`, `test/app/detalle.test.ts`) verifican que las anclas `data-*` sobreviven sin relajarse. |

## Dependencies between blocks

- Block 1 no depende de nada — es la extensión de `Boton`.
- Block 2, Block 3 y Block 4 dependen de Block 1 (usan el `Boton` extendido) y son independientes
  entre sí.

Orden sugerido: 1 → 2 → 3 → 4 (2, 3 y 4 pueden invertirse entre sí).

## Block 1 — Extender `Boton` con `disabled` y `data-*` (ADR-002)

**Files**
- `app/componentes/ui/boton.tsx` (modified).

**Logic**
`PropsBotonComoBoton` gana dos campos: `disabled?: boolean` y `Record<\`data-${string}\`, string>`
(mismo patrón de tipado que `BotonEnvio`). **Ambos viven únicamente en `PropsBotonComoBoton`, nunca
en `PropsComunes` ni en `PropsBotonComoEnlace`** — un `<a>` no tiene `disabled` nativo, y compartir
el tipo dejaría compilar `<Boton as="a" disabled>` sin sentido (mitigación 1 del threat model,
ajuste pedido por el arch-auditor de PLAN). El JSX interno del `<button>` pasa a hacer spread de
`data-*` y a leer `disabled` explícitamente: `<button {...dataAttrs} type={...} disabled={disabled}
className={clases}>`. La variante `as="a"` no cambia una sola línea.

**Input validation**
No aplica — `disabled`/`data-*` son props literales que cada formulario define en su propio código,
nunca datos que la usuaria cargó.

**Error handling**
No aplica — el componente no ejecuta lógica que pueda fallar.

**Required tests**
- [ ] `test/componentes/boton.test.tsx`: con `disabled` en `true` (sin `as`), el `<button>`
  renderizado tiene el atributo `disabled`.
- [ ] Mismo archivo: un `data-*` pasado (ej. `data-edicion="guardar"`) se renderiza en el DOM del
  `<button>`.
- [ ] Mismo archivo: los dos tests existentes (`as="a"` sin `onClick`, `as` ausente → `<button
  type="button">`) siguen en verde sin modificarlos — regresión de que la variante `as="a"` no
  cambió.

**Completion criterion**
`app/componentes/ui/boton.tsx` acepta `disabled`/`data-*` sólo en la variante `button`,
`npx tsc --noEmit` confirma que `<Boton as="a" disabled>` no compila, y los tests nuevos + los 2
existentes pasan.

## Block 2 — `formulario-alta.tsx`: campos, botón y `Feedback` de 4 estados

**Files**
- `app/componentes/formulario-alta.tsx` (modified).
- `test/app/acciones.test.ts` (modified) — ya contiene los tests de `CamposDeAlta`.
- `test/componentes/campo-texto.test.tsx` (modified).
- `test/convenciones/sistema-de-diseno-detalle.test.ts` (modified).

**Logic**
Los 5 pares `<label>+<input>` (título, editorial, stock, precio, foto) pasan a `CampoTexto`,
conservando cada `<p className="error-de-campo">{mensajes.x}</p>` como hermano sin tocarlo
(`CampoTexto` no tiene slot de error — Out of Scope ampliarlo, no lo pide ningún FR/AC). El campo
`foto` ya tiene su texto de label ("Foto de portada"); pasa tal cual a `CampoTexto label="Foto de
portada" type="file" accept="image/*"` (primer uso de esta combinación en el repo). El botón submit
pasa a `<Boton type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Dar de alta'}</Boton>`
(Block 1). El `<p className={estado?.ok ? 'aviso exito' : 'aviso error'}>` se reemplaza por:
```tsx
<Feedback
  estado={
    enviando ? 'cargando'
    : estado?.ok === true ? 'exito'
    : estado?.ok === false ? 'error'
    : 'inactivo'
  }
  mensaje={avisoDe(estado)}
/>
```
(mitigación 2 del threat model: `mensaje` recibe únicamente `avisoDe(estado)`, que ya deriva de
`estado.mensaje`/`estado.general` curados por `altaDeLibro()` — este componente no tiene
`try/catch`.) Es el primer formulario del proyecto donde `'exito'` es alcanzable: `altaDeLibro()`
(`app/acciones.ts`) devuelve `{ ok: true, mensaje: MENSAJE_ALTA_EXITOSA }` sin `redirect()`.

**Error handling**
No introduce ningún manejo de error nuevo — `altaDeLibro()` no se modifica. Los mensajes por campo
siguen en sus propios `<p className="error-de-campo">`, sin tocar.

**Required tests**
- [ ] Actualiza `test/app/acciones.test.ts` (línea ~590): reemplaza la aserción sobre el marcado
  literal `<p class="aviso error" aria-live="polite"></p>` (con `estado=null`, `enviando=true`) por
  una que confirme `role="status"` con `data-estado="cargando"` — el contrato viejo del aviso deja
  de existir con `Feedback` conectado.
- [ ] Mismo archivo: nuevo caso con `estado={ok:true, mensaje:'...'}` — `Feedback` muestra
  `role="status"` con `data-estado="exito"` y el texto de éxito (extiende el test existente "el
  formulario avisa el éxito...", que hoy sólo verifica el texto plano, no el mapeo a `Feedback`).
- [ ] Mismo archivo: nuevo caso con `estado={ok:false, general:'...'}` — `Feedback` muestra
  `role="status"` con `data-estado="error"`.
- [ ] `test/componentes/campo-texto.test.tsx`: nuevo caso con `type="file"` — `CampoTexto` renderiza
  el `<input type="file">` con `accept` y el `<label>` asociado (primer test de esta combinación).
- [ ] Extiende `test/convenciones/sistema-de-diseno-detalle.test.ts` (ya lo extendieron los Blocks 3,
  4 y 5 de FEAT-002b — agrega tu propio `it` al mismo `describe`): aserción de tokens compartidos
  sobre `formulario-alta.tsx`.

**Completion criterion**
`formulario-alta.tsx` usa `CampoTexto`/`Boton`/`Feedback` (4 estados), conserva los 5
`<p className="error-de-campo">`, y los tests actualizados/nuevos pasan.

## Block 3 — `formulario-edicion.tsx`: campos y botón

**Files**
- `app/componentes/formulario-edicion.tsx` (modified).
- `test/componentes/formulario-edicion.test.tsx` (modified).

**Logic**
Los 4 pares `<label>+<input>` (título, editorial, stock, precio) pasan a `CampoTexto`, conservando
cada `<p className="error-de-campo">` como hermano. El botón "Guardar" pasa a `<Boton
type="submit" data-edicion="guardar" disabled={enviando}>{enviando ? 'Guardando…' :
TEXTO_GUARDAR_EDICION}</Boton>` (Block 1). **`Feedback` ya está conectado desde FEAT-002b (Block 4)
y no se toca** — sigue recibiendo `estado={enviando ? 'cargando' : estado?.ok === false ? 'error' :
'inactivo'}`.

**Error handling**
No introduce ningún manejo de error nuevo — `edicionDeLibro()` no se modifica.

**Required tests**
- [ ] Extiende `test/componentes/formulario-edicion.test.tsx` (FEAT-002b): nuevo caso que confirma
  que los 4 campos se renderizan vía `CampoTexto` con su `<label>` y su `defaultValue` a partir del
  `libro` recibido (ej. `screen.getByLabelText('Título')` tiene `value` igual a `libro.titulo`) —
  AC-07 exige un test de componente para todo componente interactivo modificado, y los 3 tests
  existentes del archivo sólo cubren el mapeo a `Feedback`, no el swap de los campos.
- [ ] Corre (sin modificar) los 3 casos existentes de `Feedback` en el mismo archivo — deben seguir
  en verde como regresión.
- [ ] Corre (sin modificar) `test/app/detalle.test.ts` y `test/app/acciones-libro.test.ts`:
  `data-edicion="guardar"` sigue presente — regresión de las anclas existentes.
- [ ] `test/convenciones/sistema-de-diseno-detalle.test.ts`: su `it` sobre `formulario-edicion.tsx`
  (ya existente desde FEAT-002b) sigue pasando — `CampoTexto`/`Boton` usan los mismos tokens que las
  clases copiadas a mano que reemplazan.

**Completion criterion**
`formulario-edicion.tsx` usa `CampoTexto`/`Boton`, conserva `data-edicion="guardar"` y
`disabled={enviando}`, `Feedback` sigue funcionando sin cambios, y los tests existentes (sin
modificar) pasan.

## Block 4 — `formulario-portada.tsx`: campo con label nuevo y botón

**Files**
- `app/componentes/formulario-portada.tsx` (modified).
- `test/componentes/formulario-portada.test.tsx` (modified).

**Logic**
El `<input type="file" name="foto">` (que HOY no tiene ningún `<label>`) pasa a `<CampoTexto
id="portada-foto" label="Foto de portada" type="file" accept="image/*">` — cierra NFR-01 de este
PRD ("cada campo SHALL tener asociado un label accesible"), gap que FEAT-002b dejó explícitamente
fuera de su alcance. El botón "Cambiar foto" pasa a `<Boton type="submit"
data-portada="cambiar" disabled={enviando}>{enviando ? 'Guardando…' :
TEXTO_CAMBIAR_FOTO}</Boton>` (Block 1). **El botón "Quitar foto" (`BotonEnvio`, instalado por
FEAT-002b) no se toca.**

**Error handling**
No introduce ningún manejo de error nuevo — `asignarFoto()`/`quitarFoto()` no se modifican.

**Required tests**
- [ ] Extiende `test/componentes/formulario-portada.test.tsx` (FEAT-002b): nuevo caso que confirma
  que ahora existe un `<label>` asociado al campo de foto (`screen.getByLabelText('Foto de
  portada')`) — regresión positiva sobre el gap de accesibilidad que cierra este bloque.
- [ ] Corre (sin modificar) el resto de `formulario-portada.test.tsx`: los 3 casos de `Feedback` y
  el de `BotonEnvio` en contexto ("quitar foto") siguen en verde como regresión.
- [ ] Corre (sin modificar) `test/app/acciones-libro.test.ts`: `data-portada="cambiar"` y
  `data-portada="quitar"` (condicional a `tienePortada`) siguen presentes.
- [ ] `test/convenciones/sistema-de-diseno-detalle.test.ts`: su `it` sobre
  `formulario-portada.tsx` (ya existente desde FEAT-002b) sigue pasando.

**Completion criterion**
`formulario-portada.tsx` usa `CampoTexto` (con label nuevo) y `Boton` para "cambiar foto", conserva
`BotonEnvio` para "quitar foto" sin tocar, y los tests actualizados/existentes pasan.

## Final verification

- `npm run lint`, `npx tsc --noEmit` y `npm test` (con umbral de cobertura del 80%) en verde.
- Ningún archivo de `app/acciones.ts`, `app/acciones-libro.ts` ni `lib/db/` aparece en el diff
  (NFR-02, AC-08).
- `test/app/acciones-libro.test.ts`, `test/app/detalle.test.ts`,
  `test/componentes/formulario-edicion.test.tsx` y `test/componentes/formulario-portada.test.tsx`
  pasan **sin modificarlos** (regresión pura sobre el trabajo de FEAT-002b).
- Ningún archivo de `app/` usa `dangerouslySetInnerHTML`, `innerHTML` ni URLs `javascript:` (guardia
  existente, sin acción nueva).
- **Verificación manual, documentada en el reporte de cierre de CODE** (mismo límite de jsdom
  declarado por FEAT-002a/FEAT-002b): a 390px de ancho, los tres formularios mantienen sus campos y
  controles visibles y operables sin scroll horizontal (AC-02); navegando con Tab, cada campo/botón
  de los tres formularios muestra un estado de foco visible (AC-06). Incluye puntualmente la
  variante `type="file"` de `CampoTexto` (alta y portada) — primer uso de esa combinación, señalado
  por el arch-auditor de PLAN.
- Revisión manual de los tres flujos (alta, edición, portada) end-to-end antes de cerrar el ticket —
  mismo criterio que el PRD fija como mitigación de su propio riesgo de regresión.
