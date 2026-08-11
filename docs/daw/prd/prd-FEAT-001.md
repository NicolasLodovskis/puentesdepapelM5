# Parent PRD: Pantalla principal — búsqueda, venta, alta manual y edición de libros

| Metric | Value |
|--------|-------|
| Ticket | FEAT-001 |
| Tracker | ninguno |
| Date | 2026-08-07 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status | Integración |
|---|---|---|---|---|---|
| FEAT-001a | Cimientos y catálogo | `prd-FEAT-001a.md` | ninguna | done | mergeada a `main` vía PR #1 el 2026-08-11 |
| FEAT-001b | Venta y edición | `prd-FEAT-001b.md` | depende de a | active | — |
| FEAT-001c | Portadas | `prd-FEAT-001c.md` | depende de a y de b | pending | — |

### Requisitos de entrada heredados de FEAT-001a

Los dejó escritos la verificación de ese sub-ticket (`docs/daw/reports/verify-FEAT-001a.md`) y no
viven en ningún otro lado:

- **FEAT-001b** — un título con puntuación final (`"Principito, El."`) normaliza distinto de
  `"El Principito"`, así que el `UNIQUE` no impide que el mismo libro entre dos veces. En el excel de
  precios sólo produce fricción (la fila se reporta como no encontrada), pero en el **excel de alta
  masiva** entra como libro nuevo, con su propio stock, precio e historiales: queda el mismo libro
  dos veces, con dos ids, y las actualizaciones de precio se reparten entre los dos según cómo esté
  escrita cada fila. No se detecta al ojo en 2.000 títulos y no se puede fusionar sin borrar
  historial, que el Principio III prohíbe.
- **Ticket propio, antes de que la librera cargue su inventario real** — FR-04 pide comparación «en
  español» y el orden es la colación binaria de SQLite, así que la `ñ` y los diacríticos que el
  plegado preserva ordenan después de la Z. Es una migración de esquema: hecha sobre la base vacía
  cuesta lo que costó la migración inicial; hecha después cae bajo la cláusula de *Rollback* de la
  spec de FEAT-001a — migración sobre el activo, sin resguardo automático y sin copia a la que
  volver (PRD-001 §7).

## Suggested implementation order

a → b → c

`c` depende de `b` porque la gestión de la foto (asignar, reemplazar, quitar) se hace desde la vista
de detalle del libro, y esa vista la construye `b`.

## Original context

FEAT-001 nació como la primera feature de la aplicación: el recorte de `PRD.md` (PRD-001, el PRD del
producto) que le permite a la librera **encontrar un libro, venderlo, cargarlo a mano y corregir sus
datos**. Los flujos de Excel, la búsqueda por foto, la baja lógica con archivados y las pantallas de
consulta de historiales quedaron explícitamente fuera.

El PRD completo salió con **20 FR, 3 NFR y 24 AC**, y pasó la validación (`F-PRD-01` a `F-PRD-09`,
0 FAILs). Lo que no pasó fue el control de alcance: 24 criterios contra una guía de 5–7, y nueve
módulos distintos en un solo ticket.

El motivo real del split no es el número. Es que este ticket **crea el esquema de base de datos y la
normalización de títulos**, y esas dos decisiones condicionan todas las features del producto — los
dos flujos de Excel dependen de la misma normalización para decidir qué fila coincide con qué libro.
Partirlo pone esos cimientos a prueba con datos reales antes de que haya media aplicación encima.

Reparto de los requerimientos del PRD original entre los sub-tickets:

| Sub-ticket | FR del PRD original FEAT-001 |
|---|---|
| FEAT-001a | FR-01 (sin foto), FR-02, FR-03, FR-04, FR-16, FR-17 |
| FEAT-001b | FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-18, FR-19 |
| FEAT-001c | FR-01 (la foto), FR-05, FR-06, FR-07, FR-14, FR-15, FR-20 |

NFR-01 (< 1 s p95 sobre 2.000 libros) aparece en `a` medido sobre el listado sin imágenes, y vuelve
en `c` medido sobre el listado ya renderizado con sus miniaturas, que es como lo exige PRD-001
RNF-01. La atomicidad de la escritura con su historial y el piso de cobertura del 80 % se repiten en
los tres, porque los tres escriben.

Decisiones de alcance tomadas con el usuario durante DEFINE, y que siguen valiendo para los tres
sub-tickets:

- **La baja lógica sale.** Se implementa después junto con la consulta de archivados y la
  reactivación, como una feature completa. Sin ella, ningún libro puede llegar a estar archivado.
- **La foto entra completa**: en el alta, y con reemplazo y borrado desde la vista de detalle.
- **Los historiales sólo se escriben.** Las pantallas para consultarlos y filtrarlos llegan después.
