# PRD FEAT-002c: Modernizar el front — formularios (alta, edición, portada)

| Field | Value |
|-------|-------|
| Ticket | FEAT-002c |
| Tracker | ninguno |
| Date | 2026-08-23 |
| PRD loops | 0 |

> Sub-ticket `c` del split de FEAT-002 (ver `prd-FEAT-002.md`, ahora índice). Depende de FEAT-002a:
> reutiliza su librería de UI/tema, su entorno de test DOM y su componente de feedback compartido.
> Independiente de FEAT-002b.

## Context and Problem

Los formularios de alta (`formulario-alta.tsx`), edición (`formulario-edicion.tsx`) y carga de
portada (`formulario-portada.tsx`) usan HTML y estilos básicos sin el sistema de diseño que
FEAT-002a deja instalado. Tampoco dan feedback visible mientras su Server Action está en curso, ni
un mensaje claro si falla — lo que es más grave acá que en el resto de la app porque estos
formularios son la única forma de cargar o corregir datos: un error silencioso hace pensar que el
libro se guardó cuando no fue así.

## Goals

- Dar a los tres formularios el mismo sistema de diseño que FEAT-002a y FEAT-002b usan en el resto
  de la app.
- Que se usen cómodamente en desktop, tablet y celular.
- Mostrar feedback claro (carga, éxito, error) en sus Server Actions (dar de alta, editar, asignar
  o quitar portada), usando el componente compartido de FEAT-002a.

## Functional Requirements

- FR-01: El sistema SHALL presentar los formularios de alta, edición y carga de portada con el
  sistema de diseño de FEAT-002a: tipografía, colores, espaciados y componentes de la misma
  librería de UI/tema.
- FR-02: Los tres formularios SHALL mantener todos sus campos y controles visibles y operables, sin
  scroll horizontal, en anchos de viewport entre 360px (celular) y 1280px (desktop).
- FR-03: Cada Server Action que estos formularios disparen (dar de alta, editar, asignar o quitar
  portada) SHALL mostrar, con el componente de feedback de FEAT-002a, un indicador de carga
  mientras esa Server Action está en curso.
- FR-04: Cada Server Action que estos formularios disparen SHALL mostrar, con el mismo componente,
  un mensaje de éxito o de error legible con el resultado ya devuelto por esa Server Action.
- FR-05: Los campos y controles de estos formularios SHALL tener un estado de foco visible al
  navegarse con teclado.

## Non-Functional Requirements

- NFR-01 (Accesibilidad): El texto y los campos de estos formularios SHALL cumplir un contraste
  mínimo AA de WCAG 2.1 (4.5:1 para texto normal, 3:1 para texto grande y componentes gráficos), y
  cada campo SHALL tener asociado un `label` accesible.
- NFR-02 (No regresión funcional): Ninguna Server Action, validación de negocio, el flujo de excel
  de precios, el de alta masiva, ni la búsqueda por foto SHALL cambiar su comportamiento como
  resultado de este PRD.

## Acceptance Criteria

- AC-01: WHEN se audita el formulario de alta, el de edición y el de portada, THE sistema SHALL
  usar los mismos tokens de tipografía, color y espaciado que el resto de la app (FR-01).
- AC-02: WHEN el usuario abre cualquiera de los tres formularios en un viewport de 390px de ancho,
  THE sistema SHALL mantener sus campos y controles visibles y operables sin scroll horizontal
  (FR-02).
- AC-03: WHEN el usuario envía el formulario de alta, de edición o de portada, THE sistema SHALL
  mostrar un indicador de carga mientras la Server Action correspondiente está en curso (FR-03).
- AC-04: IF la Server Action de alta, edición o portada devuelve un error, THEN THE sistema SHALL
  mostrar un mensaje de error legible sin perder los datos ya ingresados en el formulario (FR-04).
- AC-05: WHEN la Server Action de alta, edición o portada finaliza sin error, THE sistema SHALL
  mostrar un mensaje de éxito legible (FR-04).
- AC-06: WHEN el usuario navega con la tecla Tab por cualquiera de los tres formularios, THE
  sistema SHALL mostrar un estado de foco visible en cada campo o control enfocado (FR-05).
- AC-07: WHEN se agrega o se modifica un componente interactivo de estos formularios, THE suite de
  tests SHALL incluir al menos un test de componente (DOM) que cubra su comportamiento.
- AC-08: IF un cambio de este PRD modificara el comportamiento de una Server Action, el flujo de
  excel o la búsqueda por foto, THEN THE cambio SHALL rechazarse por estar fuera de alcance
  (NFR-02).

## Out of Scope

- El listado, la búsqueda, el detalle de libro, la librería de UI/tema y el entorno de test DOM no
  se definen acá: los aporta FEAT-002a (y FEAT-002b para el detalle).
- `app/error.tsx` y `app/not-found.tsx` no se rediseñan (fuera de alcance del PRD padre).
- Ninguna Server Action, validación existente (por ejemplo las reglas de precio o de título único),
  el ABM de libros o el manejo de stock cambia su comportamiento.
- El flujo de excel de precios y el de alta masiva no se modifican: sólo se tocan los formularios de
  carga individual (alta, edición, portada), no la carga por Excel.
- La búsqueda por foto no se modifica ni se construye.
- No se agrega modo oscuro (dark mode), login, roles ni soporte multiusuario.

## Risks and Mitigations

- Riesgo: si FEAT-002a cambia su librería de UI/tema o el componente de feedback después de que
  este sub-ticket arranque, hay que ajustar los formularios en consecuencia. Mitigación: este
  sub-ticket no empieza CODE hasta que FEAT-002a esté cerrado y mergeado.
- Riesgo: un rediseño de los formularios puede introducir una regresión en una validación existente
  (por ejemplo, dejar pasar un precio inválido). Mitigación: NFR-02 lo deja explícito, y en VERIFY
  se revisan manualmente los tres flujos (alta, edición, portada) antes de cerrar el ticket.

## Dependencies

- Depende de FEAT-002a: la librería de UI/tema, el entorno de test DOM y el componente de feedback
  compartido.
- Independiente de FEAT-002b: no comparte componentes con el detalle más allá de la base de
  FEAT-002a, así que puede implementarse en paralelo o en cualquier orden respecto de ese
  sub-ticket.
- Depende de las Server Actions de alta, edición y portada ya implementadas en
  FEAT-001a/FEAT-001b/FEAT-001c: este PRD las reviste visualmente, no las reemplaza.
