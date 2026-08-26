# ADR-002: `Boton` acepta `disabled` y `data-*` en su variante `button` (addendum a ADR-001)

| Field | Value |
|-------|-------|
| Date | 2026-08-25 |
| Ticket | FEAT-002c |
| Status | Accepted |

## Context

ADR-001 fija `Boton` (`app/componentes/ui/boton.tsx`) como Server Component polimórfico que "nunca
lleva manejadores de evento", y deja anotado que "FEAT-002b y FEAT-002c quedan atados a esta API: un
cambio de contrato ahí es una decisión que también los afecta". FEAT-002b necesitó un botón de
submit con `disabled={enviando}` y `data-edicion="guardar"`/`data-portada="cambiar"` (anclas que ya
usan `test/app/acciones-libro.test.ts` y `test/app/detalle.test.ts`), y como `Boton` no aceptaba
ninguna de las dos cosas, resolvió copiando a mano las clases de `Boton` en un `<button>` nativo
(`formulario-edicion.tsx`, `formulario-portada.tsx`). FEAT-002c — que sí rediseña los campos de esos
mismos formularios con los componentes compartidos — hereda el mismo problema para sus tres
formularios (alta, edición, portada) y es el punto natural para resolverlo de raíz en vez de
repetir la copia manual una tercera vez.

## Options considered

### Option 1: Mantener `<button>` nativo con las clases de `Boton` copiadas a mano
- **Pros:** cero cambios a `Boton`; cero riesgo de romper `listado-libros.tsx`/`buscador.tsx`.
- **Cons:** duplica el string de clases en cada formulario (ya señalado como WARN por el
  arch-auditor de FEAT-002b, Block 2 y Block 5); dos archivos que hay que mantener sincronizados a
  mano; contradice la letra del PRD de FEAT-002c, que pide reusar "componentes de la misma librería
  de UI/tema", no sus clases copiadas.

### Option 2: Componente nuevo (`BotonFormulario`) paralelo a `Boton`
- **Pros:** no toca el componente ya shippeado ni sus tests existentes.
- **Cons:** dos componentes de botón con el mismo propósito visual (variantes, tokens) y contratos
  distintos; el proyecto ya tiene un precedente de "componente nuevo por necesidad puntual"
  (`BotonEnvio`, para `useFormStatus`), pero ahí la razón era técnica (el hook exige un componente
  hijo separado del `<form>`); acá no hay ninguna restricción técnica análoga — es sólo que `Boton`
  no expone dos props opcionales.

### Option 3 (elegida): Extender `Boton` con `disabled?: boolean` y `data-*` en su variante `button`
- **Pros:** un único componente para "botón con los tokens del sistema de diseño"; el cambio es
  aditivo (props opcionales) y no rompe los dos callers existentes (`listado-libros.tsx` con
  `as="a"`, `buscador.tsx` con `as="button"` sin `disabled`/`data-*`); ninguna de las dos props
  nuevas es un manejador de evento, así que no viola la letra de ADR-001 ("nunca lleva manejadores
  de evento").
- **Cons:** cambia el contrato de un componente que ADR-001 ya declaró compartido entre sub-tickets
  — de ahí este addendum, en vez de dejarlo implícito en el código.

## Decision

Se extiende `Boton`: `disabled?: boolean` y `Record<`data-${string}`, string>` se agregan
**únicamente a `PropsBotonComoBoton`**, nunca a `PropsComunes` ni a `PropsBotonComoEnlace` — un
`<a>` no tiene `disabled` nativo, así que compartir el tipo dejaría compilar `<Boton as="a"
disabled>` sin sentido y rompería en silencio la promesa de que la variante `as="a"` queda intacta
(ajuste que pidió el arch-auditor de PLAN de FEAT-002c).

## Consequences

- `app/componentes/ui/boton.tsx`: `PropsBotonComoBoton` gana los dos campos; el JSX interno del
  `<button>` pasa a hacer spread de `data-*` y a leer `disabled` explícitamente.
- `listado-libros.tsx` (`as="a"`) y `buscador.tsx` (`as="button"` sin las props nuevas): sin cambios,
  siguen compilando y comportándose igual.
- `formulario-alta.tsx`, `formulario-edicion.tsx`, `formulario-portada.tsx` (FEAT-002c): sus botones
  de submit dejan de copiar las clases de `Boton` a mano y pasan a usar el componente real con
  `disabled`/`data-*`.
- Cualquier sub-ticket futuro que necesite un botón de submit con estado (`useActionState`) reusa
  `Boton` directamente; sólo los formularios sin `useActionState` (acción `Promise<void>`) siguen
  necesitando `BotonEnvio` (`useFormStatus`), que no se toca.
