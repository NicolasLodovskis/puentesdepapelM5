# PRD FEAT-002a: Modernizar el front — base (sistema de diseño y test DOM) y listado/búsqueda

| Field | Value |
|-------|-------|
| Ticket | FEAT-002a |
| Tracker | ninguno |
| Date | 2026-08-23 |
| PRD loops | 0 |

> Sub-ticket `a` del split de FEAT-002 (ver `prd-FEAT-002.md`, ahora índice). Primer sub-ticket:
> establece la base compartida (librería de UI/tema y entorno de test de componentes) que
> FEAT-002b y FEAT-002c van a reutilizar, y la aplica a la pantalla de listado y búsqueda.

## Context and Problem

El listado y la búsqueda de libros (`app/page.tsx`, el buscador, el listado y el estado del
catálogo) usan HTML y estilos básicos sin un sistema de diseño consistente ni componentes
reutilizables. Además, hoy no existe un entorno de test de componentes: Vitest corre sin DOM y sólo
testea Server Actions como funciones async, así que un rediseño con componentes interactivos no
puede testearse en rojo/verde como pide el Principio I de la Constitución del proyecto.

Este sub-ticket resuelve ambas cosas a la vez, porque las pantallas siguientes del split
(FEAT-002b, FEAT-002c) dependen de que la librería de UI y el entorno de test ya existan.

## Goals

- Elegir y dejar instalada una librería de componentes/estilos acorde al stack (Next.js 16 +
  React 19 + TypeScript), con sus tokens de tipografía, color y espaciado.
- Elegir y dejar instalado un entorno de test de componentes (DOM), aislado de los tests actuales
  de Server Actions.
- Aplicar ese sistema de diseño al listado y a la búsqueda, con layout responsive y foco visible.
- Dejar un componente de feedback (carga + éxito/error) reutilizable por las pantallas de
  FEAT-002b y FEAT-002c, que sí disparan Server Actions.

## Functional Requirements

- FR-01: El sistema SHALL presentar el listado y la búsqueda de libros (`app/page.tsx`, el
  buscador, el listado de libros y el estado del catálogo) con un sistema de diseño consistente:
  tipografía, colores, espaciados y componentes de botón/input/tabla de una única librería de
  UI/tema.
- FR-02: El listado y la búsqueda SHALL mantener todos sus datos y controles visibles y operables,
  sin scroll horizontal, en anchos de viewport entre 360px (celular) y 1280px (desktop).
- FR-03: Los elementos interactivos (botones, inputs, links) del listado y la búsqueda SHALL tener
  un estado de foco visible al navegarse con teclado.
- FR-04: El sistema SHALL proveer un componente de feedback (indicador de carga y mensaje de éxito
  o error) reutilizable, para que cualquier pantalla que dispare una Server Action (FEAT-002b,
  FEAT-002c) lo use sin reimplementarlo.

## Non-Functional Requirements

- NFR-01 (Accesibilidad): El texto y los componentes interactivos del listado y la búsqueda SHALL
  cumplir un contraste mínimo AA de WCAG 2.1 (4.5:1 para texto normal, 3:1 para texto grande y
  componentes gráficos).
- NFR-02 (Testing de componentes): El proyecto SHALL contar con un entorno de test de componentes
  (DOM) que no cambie el entorno ni el comportamiento de ningún test existente de Server Actions.
- NFR-03 (No regresión funcional): Ninguna Server Action, validación de negocio, el flujo de excel
  de precios, el de alta masiva, ni la búsqueda por foto SHALL cambiar su comportamiento como
  resultado de este PRD.

## Acceptance Criteria

- AC-01: WHEN se audita el listado y la búsqueda, THE sistema SHALL usar los tokens de tipografía,
  color y espaciado de una única librería de UI/tema (FR-01).
- AC-02: WHEN el usuario abre el listado o la búsqueda en un viewport de 390px de ancho, THE
  sistema SHALL mantener sus datos y controles esenciales visibles y operables sin scroll
  horizontal (FR-02).
- AC-03: WHEN el usuario navega con la tecla Tab por el listado o la búsqueda, THE sistema SHALL
  mostrar un estado de foco visible en cada elemento interactivo enfocado (FR-03).
- AC-04: WHEN una pantalla necesita mostrar el estado de una Server Action en curso o su resultado,
  THE sistema SHALL ofrecer un componente de feedback compartido que cualquier pantalla pueda
  importar sin duplicar su lógica (FR-04).
- AC-05: WHEN se agrega o se modifica un componente interactivo del listado o la búsqueda, THE
  suite de tests SHALL incluir al menos un test de componente (DOM) que cubra su comportamiento
  (NFR-02).
- AC-06: IF un cambio de este PRD modificara el comportamiento de una Server Action, el flujo de
  excel o la búsqueda por foto, THEN THE cambio SHALL rechazarse por estar fuera de alcance
  (NFR-03).

## Out of Scope

- El detalle de libro (`app/libros/[id]`, `detalle-libro.tsx`) no se rediseña en este sub-ticket:
  es FEAT-002b.
- Los formularios de alta, edición y portada no se rediseñan en este sub-ticket: es FEAT-002c.
- `app/error.tsx` y `app/not-found.tsx` no se rediseñan (fuera de alcance del PRD padre).
- Ninguna Server Action, lógica de negocio, validación existente, el ABM de libros o el manejo de
  stock cambia su comportamiento.
- El flujo de excel de precios y el de alta masiva no se modifican.
- La búsqueda por foto no se modifica ni se construye (no está implementada; fuera de alcance).
- No se agrega modo oscuro (dark mode).
- No se agrega login, roles ni soporte multiusuario.

## Risks and Mitigations

- Riesgo: la elección de la librería de UI/tema es una nueva dependencia arquitectónica que
  condiciona a FEAT-002b y FEAT-002c. Mitigación: se decide y valida en PLAN, con un ADR que
  registre la decisión y sus alternativas.
- Riesgo: sumar un entorno de test DOM puede interferir con la configuración actual de Vitest
  (sin DOM). Mitigación: aislarlo por archivo o por proyecto de Vitest (NFR-02), sin tocar la
  configuración de los tests de Server Actions existentes.
- Riesgo: si el componente de feedback (FR-04) queda mal diseñado, FEAT-002b y FEAT-002c heredan
  el problema. Mitigación: se revisa su API en PLAN antes de construir las otras dos pantallas.

## Dependencies

- Ninguna: es el primer sub-ticket del split de FEAT-002.
- FEAT-002b y FEAT-002c dependen de la librería de UI/tema, el entorno de test DOM y el componente
  de feedback que este sub-ticket deja instalados.
