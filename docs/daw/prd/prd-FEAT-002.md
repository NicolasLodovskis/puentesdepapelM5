# Parent PRD: Modernizar el front — rediseño visual y mejoras de UX

| Metric | Value |
|--------|-------|
| Ticket | FEAT-002 |
| Date | 2026-08-23 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status |
|---|---|---|---|---|
| FEAT-002a | Base (sistema de diseño y test DOM) y listado/búsqueda | prd-FEAT-002a.md | ninguna | done — mergeado a main vía PR #4 |
| FEAT-002b | Detalle de libro | prd-FEAT-002b.md | depende de a | done — se mergea cuando se apruebe el PR #7 |
| FEAT-002c | Formularios (alta, edición, portada) | prd-FEAT-002c.md | depende de a, independiente de b | active |

## Suggested implementation order

a → b → c (b y c pueden invertirse o hacerse en paralelo entre sí una vez cerrado a)

## Original context

El front actual (listado y búsqueda, detalle de libro, formularios de alta/edición/portada) usa
HTML y estilos básicos sin sistema de diseño ni componentes reutilizables, lo que hace incómodo el
uso desde tablet/celular en el mostrador de la librería y no da feedback claro de las acciones que
disparan Server Actions. El PRD original completo (7 FR, 3 NFR, 7 AC) cubría las tres pantallas y
la base compartida (librería de UI/tema + entorno de test de componentes) en un solo ticket. En
DEFINE, el scope check lo encontró en el límite (7 AC, 3 áreas de pantalla + una base compartida) y
el usuario aprobó dividirlo siguiendo el mismo patrón que FEAT-001 (a/b/c): `a` deja la base y
resuelve el listado, `b` el detalle, `c` los formularios.

Durante la conversación de DEFINE se descartó explícitamente sumar la búsqueda por foto (RF-11 del
PRD maestro): no está implementada en el código (no hay librería de reconocimiento de imagen ni
ruta ni componente), así que agregarle un enlace al detalle no es un ajuste de UX sino construir la
funcionalidad completa desde cero. Queda fuera de los tres sub-tickets y de cualquier PRD futuro que
la aborde.
