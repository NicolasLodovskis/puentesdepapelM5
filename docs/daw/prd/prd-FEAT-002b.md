# PRD FEAT-002b: Modernizar el front — detalle de libro

| Field | Value |
|-------|-------|
| Ticket | FEAT-002b |
| Tracker | ninguno |
| Date | 2026-08-23 |
| PRD loops | 0 |

> Sub-ticket `b` del split de FEAT-002 (ver `prd-FEAT-002.md`, ahora índice). Depende de FEAT-002a:
> reutiliza su librería de UI/tema, su entorno de test DOM y su componente de feedback compartido.

## Context and Problem

El detalle de libro (`app/libros/[id]/page.tsx`, `detalle-libro.tsx`) — donde se edita el libro y
se confirma una venta — usa HTML y estilos básicos sin el sistema de diseño que FEAT-002a deja
instalado para el resto de la app. Tampoco da feedback visible mientras la Server Action de editar
o de vender está en curso, ni un mensaje claro si esa Server Action falla.

## Goals

- Dar al detalle de libro el mismo sistema de diseño que FEAT-002a aplicó al listado y la
  búsqueda.
- Que el detalle se use cómodamente en desktop, tablet y celular.
- Mostrar feedback claro (carga, éxito, error) en las Server Actions que el detalle dispara
  (editar, vender), usando el componente compartido de FEAT-002a.

## Functional Requirements

- FR-01: El sistema SHALL presentar el detalle de libro (`app/libros/[id]/page.tsx` y
  `detalle-libro.tsx`) con el sistema de diseño de FEAT-002a: tipografía, colores, espaciados y
  componentes de la misma librería de UI/tema.
- FR-02: El detalle SHALL mantener todos sus datos y controles visibles y operables, sin scroll
  horizontal, en anchos de viewport entre 360px (celular) y 1280px (desktop).
- FR-03: Cada acción del detalle que dispare una Server Action (editar, marcar venta) SHALL
  mostrar, con el componente de feedback de FEAT-002a, un indicador de carga mientras esa Server
  Action está en curso.
- FR-04: Cada acción del detalle que dispare una Server Action SHALL mostrar, con el mismo
  componente, un mensaje de éxito o de error legible con el resultado ya devuelto por esa Server
  Action.
- FR-05: Los elementos interactivos del detalle SHALL tener un estado de foco visible al
  navegarse con teclado.

## Non-Functional Requirements

- NFR-01 (Accesibilidad): El texto y los componentes interactivos del detalle SHALL cumplir un
  contraste mínimo AA de WCAG 2.1 (4.5:1 para texto normal, 3:1 para texto grande y componentes
  gráficos).
- NFR-02 (No regresión funcional): Ninguna Server Action, validación de negocio, el flujo de excel
  de precios, el de alta masiva, ni la búsqueda por foto SHALL cambiar su comportamiento como
  resultado de este PRD.

## Acceptance Criteria

- AC-01: WHEN se audita el detalle de libro, THE sistema SHALL usar los mismos tokens de
  tipografía, color y espaciado que el listado y la búsqueda de FEAT-002a (FR-01).
- AC-02: WHEN el usuario abre el detalle en un viewport de 390px de ancho, THE sistema SHALL
  mantener sus datos y controles esenciales visibles y operables sin scroll horizontal (FR-02).
- AC-03: WHEN el usuario dispara la Server Action de editar o de marcar venta desde el detalle, THE
  sistema SHALL mostrar un indicador de carga mientras esa Server Action está en curso (FR-03).
- AC-04: IF la Server Action de editar o de marcar venta devuelve un error, THEN THE sistema SHALL
  mostrar un mensaje de error legible sin perder los datos ya ingresados en el formulario de
  edición (FR-04).
- AC-05: WHEN el usuario navega con la tecla Tab por el detalle, THE sistema SHALL mostrar un
  estado de foco visible en cada elemento interactivo enfocado (FR-05).
- AC-06: WHEN se agrega o se modifica un componente interactivo del detalle, THE suite de tests
  SHALL incluir al menos un test de componente (DOM) que cubra su comportamiento.
- AC-07: IF un cambio de este PRD modificara el comportamiento de una Server Action, el flujo de
  excel o la búsqueda por foto, THEN THE cambio SHALL rechazarse por estar fuera de alcance
  (NFR-02).

## Out of Scope

- El listado, la búsqueda, la librería de UI/tema y el entorno de test DOM no se definen acá: los
  aporta FEAT-002a, del que este sub-ticket depende.
- Los formularios de alta, edición y portada como componentes propios no se rediseñan en este
  sub-ticket: es FEAT-002c. (El formulario de edición embebido en el detalle sólo recibe el
  feedback de FR-03/FR-04 sobre la acción que dispara desde acá, no un rediseño de sus campos.)
- `app/error.tsx` y `app/not-found.tsx` no se rediseñan (fuera de alcance del PRD padre).
- Ninguna Server Action, lógica de negocio, validación existente, el ABM de libros o el manejo de
  stock cambia su comportamiento.
- El flujo de excel de precios y el de alta masiva no se modifican.
- La búsqueda por foto no se modifica ni se construye.
- No se agrega modo oscuro (dark mode), login, roles ni soporte multiusuario.

## Risks and Mitigations

- Riesgo: si FEAT-002a cambia su librería de UI/tema o el componente de feedback después de que
  este sub-ticket arranque, hay que ajustar el detalle en consecuencia. Mitigación: este sub-ticket
  no empieza CODE hasta que FEAT-002a esté cerrado y mergeado.
- Riesgo: un rediseño del detalle puede introducir una regresión en la confirmación de venta (única
  vía para vender, AC-17 del PRD maestro). Mitigación: NFR-02 lo deja explícito, y en VERIFY se
  revisa manualmente el flujo de venta antes de cerrar el ticket.

## Dependencies

- Depende de FEAT-002a: la librería de UI/tema, el entorno de test DOM y el componente de feedback
  compartido.
- Depende de las Server Actions de edición y venta ya implementadas en FEAT-001a/FEAT-001b: este
  PRD las reviste visualmente, no las reemplaza.
