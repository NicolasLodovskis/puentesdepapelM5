# PRD FEAT-001a: Cimientos y catálogo

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a |
| Tracker | ninguno |
| Date | 2026-08-07 |
| PRD loops | 0 |

> Sub-ticket `a` de FEAT-001 (ver `prd-FEAT-001.md`). Recorte de `PRD.md` (PRD-001, el PRD del
> producto): cada FR indica de qué RF proviene.

---

## Context and Problem

El repositorio no tiene código. Esta es la primera vez que la aplicación existe: se crean acá la
estructura del proyecto Next.js, el esquema de la base SQLite y la función de normalización de
títulos que define la identidad de un libro en todo el producto.

Sobre esos cimientos, este sub-ticket entrega el circuito mínimo con el que la librería empieza a
funcionar: **cargar un libro a mano y encontrarlo después**. Sin esto no hay ningún libro en el
sistema y ninguna otra feature tiene sobre qué operar.

Dos decisiones de este sub-ticket condicionan todo lo que venga:

- **La normalización de títulos.** Es la clave de identidad del catálogo (PRD-001 RF-17) y, más
  adelante, lo que decide qué fila de un Excel corresponde a qué libro (PRD-001 RF-07). Dos
  implementaciones distintas producirían identidades divergentes.
- **El esquema de la base.** Debe prever desde ahora lo que este sub-ticket todavía no usa: el
  estado activo/archivado del libro y el campo de origen de los historiales.

## Goals

- Que la aplicación exista y corra, con su base de datos creada.
- Que la librera pueda **cargar un libro a mano** sin poder duplicarlo.
- Que pueda **ver su catálogo completo** y **buscar** dentro de él por nombre o por editorial.
- Que el alta deje su rastro en los historiales de stock y de precio desde el primer libro cargado.

## Functional Requirements

**Alta manual**

- **FR-01** (PRD-001 RF-01): El sistema debe permitir dar de alta un libro con título, editorial,
  cantidad en stock y precio. El título y la editorial no deben estar vacíos, el stock debe ser un
  entero ≥ 0 y el precio debe ser un entero > 0. La foto de portada no se maneja en este
  sub-ticket: la incorpora FEAT-001c.
- **FR-02** (PRD-001 RF-17): El sistema debe impedir el alta de un libro cuyo título, una vez
  normalizado, coincida con el de cualquier otro libro existente. La normalización debe pasar el
  título a minúsculas, quitar acentos y puntuación e ignorar el orden del artículo. La editorial no
  forma parte de la clave: dos libros con el mismo título y distinta editorial no pueden coexistir.
- **FR-03** (PRD-001 RF-31): El sistema debe interpretar el precio aceptando un valor cuya parte
  decimal sea cero (`1234`, `1234,00`, `1234.0`) como ese entero, y debe rechazar —sin redondear ni
  completar— todo valor con parte decimal distinta de cero, con separador de miles, no numérico o
  ausente. El motivo del rechazo debe distinguir el precio ausente del no numérico y del decimal.

**Búsqueda y catálogo**

- **FR-04** (PRD-001 RF-10): El sistema debe permitir buscar libros por nombre o por editorial y
  debe devolver los coincidentes con su precio y su stock, ordenados alfabéticamente por título con
  comparación en español, insensible a mayúsculas y acentos. Con el campo de búsqueda vacío debe
  listar el catálogo completo con el mismo orden.

**Historiales (escritura)**

- **FR-05** (PRD-001 RF-14): El sistema debe registrar una entrada en el historial de precio —con
  fecha, precio anterior, precio nuevo y origen— en la misma transacción que escribe el precio del
  libro. El único origen de este sub-ticket es `alta manual`.
- **FR-06** (PRD-001 RF-13): El sistema debe registrar una entrada en el historial de stock —con
  fecha, cantidad anterior, cantidad resultante y origen— en la misma transacción que escribe el
  stock del libro. El único origen de este sub-ticket es `alta manual`.

**Cimientos**

- **FR-07**: El esquema de la base debe contemplar el estado activo/archivado de cada libro y el
  campo de origen de cada entrada de historial, aunque este sub-ticket sólo escriba el estado
  `activo` y el origen `alta manual`. FEAT-001b agrega los orígenes `edición manual` y `venta`, y la
  baja lógica usa el estado en una feature posterior.
- **FR-08**: La normalización de títulos de FR-02 debe estar implementada en una única función
  compartida y reutilizable, no duplicada en cada punto de uso, porque los flujos de Excel de
  PRD-001 (RF-07, RF-19) dependen de que la identidad de un libro se calcule siempre igual.

## Non-Functional Requirements

- **NFR-01** (PRD-001 RNF-01): La búsqueda por nombre o por editorial y el listado del catálogo
  completo deben responder en **< 1 s (p95)** sobre un catálogo de **2.000 libros**. FEAT-001c
  vuelve a medir este presupuesto con las miniaturas renderizadas, que es como lo exige PRD-001
  RNF-01.
- **NFR-02**: La escritura del libro y la de sus entradas de historial deben ocurrir en una **única
  transacción atómica**: ante un fallo, deben persistir **0** de las escrituras.
- **NFR-03**: La cobertura de tests del código nuevo debe ser **≥ 80 %** en líneas, ramas y
  funciones.

## Acceptance Criteria

*(EARS — `.daw/rules/validation-rules.instructions.md` §1)*

- **AC-01** (FR-01, FR-05, FR-06): WHEN el usuario confirma un alta con título y editorial no
  vacíos, stock entero S ≥ 0 y precio entero P > 0, THE sistema SHALL persistir el libro, dejarlo
  recuperable en una consulta posterior, y agregar una entrada en el historial de stock (fecha,
  cantidad anterior 0, cantidad resultante S, origen `alta manual`) y una en el historial de precio
  (fecha, precio anterior 0, precio nuevo P, origen `alta manual`).
- **AC-02** (FR-01): IF el título o la editorial están vacíos, o el stock no es un entero ≥ 0, o el
  precio no es un entero > 0, THEN THE sistema SHALL rechazar el alta con un mensaje que indique el
  campo inválido y SHALL no persistir el libro ni ninguna entrada de historial.
- **AC-03** (FR-02, FR-08): IF el título de un alta normaliza al mismo valor que el de un libro ya
  existente, THEN THE sistema SHALL impedir el alta con un mensaje que nombre el libro en conflicto
  y SHALL no crear el segundo libro — incluso cuando la editorial declarada sea distinta.
- **AC-04** (FR-03): WHEN el precio ingresado es `1234`, `1234,00` o `1234.0`, THE sistema SHALL
  interpretarlo como el entero 1234 y aplicar el alta.
- **AC-05** (FR-03): IF el precio ingresado tiene parte decimal distinta de cero (`1234,50`), trae
  separador de miles (`1.234,50`), no es numérico o está ausente, THEN THE sistema SHALL rechazar el
  alta sin redondear ni completar el valor, y SHALL informar el motivo distinguiendo el precio
  ausente del no numérico y del decimal.
- **AC-06** (FR-04): WHEN el usuario busca por nombre o por editorial, THE sistema SHALL devolver
  los libros coincidentes con su precio y su stock, ordenados alfabéticamente por título, tratando
  como iguales las mayúsculas y los acentos.
- **AC-07** (FR-04): WHEN el campo de búsqueda está vacío, THE sistema SHALL listar el catálogo
  completo con el mismo orden alfabético.
- **AC-08** (FR-07): WHEN se crea un libro, THE sistema SHALL persistirlo con estado `activo`, y el
  esquema SHALL admitir el estado archivado y los orígenes de historial `edición manual`, `venta`,
  `reactivación`, `actualización masiva por Excel` y `alta por Excel` sin requerir una migración
  posterior.
- **AC-09** (NFR-01): WHILE el catálogo tiene 2.000 libros, WHEN el usuario busca o abre el catálogo
  completo, THE sistema SHALL devolver el listado en menos de 1 s en el percentil 95.
- **AC-10** (NFR-02, FR-05, FR-06): IF la escritura de una entrada de historial falla, THEN THE
  sistema SHALL revertir también la escritura del libro, de modo que no persista ninguna de las
  escrituras.
- **AC-11** (NFR-03): THE suite de tests SHALL alcanzar una cobertura ≥ 80 % en líneas, ramas y
  funciones sobre el código introducido por este sub-ticket.

## Out of Scope

- **Foto de portada** en cualquiera de sus formas: adjuntarla en el alta, miniaturas en el listado,
  imagen por defecto. Todo eso es FEAT-001c.
- **Vista de detalle del libro, venta y edición** de cualquier dato ya cargado. Es FEAT-001b. En
  este sub-ticket un libro se crea y se consulta, no se modifica.
- **Baja lógica, consulta de archivados y reactivación** (PRD-001 RF-04, RF-25, RF-26). El esquema
  los prevé (FR-07), la interfaz no los ofrece.
- **Los dos flujos de Excel** (PRD-001 RF-06 a RF-09, RF-18 a RF-22, RF-27, RF-28, RF-30) y la
  **búsqueda por foto** (RF-11).
- **Pantallas de consulta de historiales** (PRD-001 RF-15, RF-16). Se escriben, no se leen.
- **Paginación del listado**: el catálogo completo se devuelve en una sola vista. Si NFR-01 no se
  alcanza sin paginar, la solución se decide en PLAN.
- Todo lo que PRD-001 declara fuera de alcance en su sección 7.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La normalización de títulos se define acá y la consumen features que todavía no existen. | Dos implementaciones divergentes harían que un Excel actualice el precio del libro equivocado. | FR-08 la obliga a vivir en una única función compartida, con su propio set de tests sobre casos conocidos (acentos, puntuación, artículo antepuesto o pospuesto). |
| El esquema se crea sin que existan la baja lógica ni los flujos de Excel. | Una migración de datos en la feature siguiente, sobre una base que ya tiene el inventario real. | FR-07 y AC-08 obligan a que el estado y los orígenes de historial estén desde el principio. |
| El catálogo completo sin paginar renderiza 2.000 filas. | NFR-01 inalcanzable. | AC-09 mide exactamente ese caso. Si falla, PLAN decide entre paginación, virtualización o índices. |
| SQLite es un único archivo local sin resguardo automático (PRD-001 sección 7). | Perder el inventario completo ante una falla de disco. | Riesgo asumido y declarado en PRD-001. Fuera de alcance del producto; el resguardo del `.db` es responsabilidad de la usuaria. |

## Dependencies

- **PRD-001** (`docs/daw/prd/PRD.md`): documento de producto del que este PRD es un recorte.
- **`prd-FEAT-001.md`**: PRD padre del split, con el reparto de requerimientos entre a, b y c.
- **Stack declarado en `AGENTS.md`**: Next.js 15 con App Router, React 19, TypeScript 5.9,
  better-sqlite3 sin ORM, Vitest, ESLint + Prettier.
- **Ninguna dependencia de otro sub-ticket**: `a` es el primero y no depende de `b` ni de `c`.
