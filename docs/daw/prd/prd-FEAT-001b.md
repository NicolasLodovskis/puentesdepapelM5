# PRD FEAT-001b: Venta y edición

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| Tracker | ninguno |
| Date | 2026-08-07 |
| PRD loops | 2 |

> Sub-ticket `b` de FEAT-001 (ver `prd-FEAT-001.md`). Depende de FEAT-001a. Recorte de `PRD.md`
> (PRD-001, el PRD del producto): cada FR indica de qué RF proviene.

---

## Context and Problem

Con FEAT-001a la librera puede cargar libros y encontrarlos, pero no puede hacer nada con ellos: un
libro cargado con un precio equivocado queda equivocado para siempre, y vender un ejemplar no
descuenta nada.

Este sub-ticket cierra el circuito del día a día. Agrega la **vista de detalle** —entrar al libro
desde su fila en el listado— y, desde ahí, las dos cosas que la librera hace todo el tiempo:
**vender** y **corregir**.

Es también donde los historiales empiezan a valer: hasta ahora sólo registraban altas. Acá aparecen
la venta y la edición manual, que son los movimientos que la librera va a querer reconstruir cuando
existan las pantallas de consulta.

Y cierra un agujero que FEAT-001a dejó documentado y abierto: la identidad de un libro se calcula
sobre su título, y un título con puntuación al final (`"Principito, El."`, o el mismo entre comillas
de un pegado de Excel) normaliza distinto de `"El Principito"`. Son dos claves distintas, así que el
`UNIQUE` no impide que el mismo libro entre dos veces. Acá duele en la edición de título (FR-06), que
usa esa misma identidad para detectar duplicados; cuando lleguen los flujos de Excel va a doler en
volumen. Se cierra en este sub-ticket, antes de que la librera cargue su inventario real, porque
recalcular la identidad sobre una base chica cuesta lo que no cuesta después.

## Goals

- Que la librera pueda **entrar a un libro** desde el listado y ver todos sus datos juntos.
- Que pueda **vender** un ejemplar sin rodeos —empezando desde la fila del listado, donde está
  mirando— pero que la venta quede confirmada antes de tocar el stock, para que un click de más no
  descuente nada.
- Que pueda **corregir cualquier dato** de un libro ya cargado: precio, stock, título y editorial.
- Que ningún cambio de precio o de stock ocurra sin su entrada de historial, y que una operación que
  no cambia nada no ensucie ese historial.
- Que un título con puntuación al final sea **el mismo libro** que el título sin ella, para que el
  catálogo no admita el mismo libro dos veces por cómo esté escrita la puntuación.

## Functional Requirements

**Vista de detalle**

- **FR-01** (pedido del usuario): El sistema debe ofrecer una vista de detalle por libro, alcanzable
  desde su fila en el listado, que muestre su título, editorial, stock y precio, y desde la cual se
  realizan las operaciones de FR-02 a FR-06.

**Venta**

- **FR-02** (PRD-001 RF-05): El sistema debe permitir iniciar la venta de un libro desde su fila en
  el listado, y debe exigir una confirmación en la vista de detalle antes de descontar 1 de su
  stock. El sistema no debe permitir la venta de un libro con stock 0.

**Edición**

- **FR-03** (PRD-001 RF-02): El sistema debe permitir modificar el precio de un libro desde su vista
  de detalle, aceptando únicamente un entero > 0 y aplicando las mismas reglas de interpretación del
  precio que el alta (FEAT-001a FR-03, PRD-001 RF-31).
- **FR-04** (PRD-001 RF-03): El sistema debe permitir modificar manualmente la cantidad en stock de
  un libro desde su vista de detalle, aceptando únicamente un entero ≥ 0.
- **FR-05** (PRD-001 RF-23): El sistema debe permitir modificar el título y la editorial de un libro
  desde su vista de detalle. Ambos deben quedar no vacíos.
- **FR-06** (PRD-001 RF-24): El sistema debe impedir modificar el título de un libro cuando el nuevo
  título, una vez normalizado con la función compartida de FEAT-001a (FR-08), coincida con el de
  cualquier otro libro existente.

**Historiales (escritura)**

- **FR-07** (PRD-001 RF-12): El sistema debe registrar la venta en el historial de ventas, con fecha
  y precio de venta igual al precio vigente del libro en ese momento, en la misma transacción que
  descuenta el stock.
- **FR-08** (PRD-001 RF-13, RF-14): El sistema debe registrar el origen `edición manual` en las
  entradas de historial de precio y de stock que produce la edición, y el origen `venta` en la
  entrada de historial de stock que produce la venta, usando los historiales creados en FEAT-001a.
- **FR-09** (PRD-001 RF-13, RF-14): El sistema no debe modificar el libro ni escribir entrada de
  historial cuando la operación deja el precio o el stock igual al vigente.

**Identidad de títulos** *(requisito de entrada heredado de FEAT-001a, `prd-FEAT-001.md`)*

- **FR-10** (PRD-001 RF-24): El sistema debe calcular la misma identidad para dos títulos que
  difieren únicamente en signos de puntuación al final del texto. `"Principito, El."` y
  `"Principito, El"` entre comillas deben quedar con la misma identidad que `"El Principito"`. La
  identidad la calcula la función compartida de FEAT-001a (FR-08), de modo que el cambio alcanza
  también al alta y a la búsqueda que ya la consumen.
- **FR-11**: El sistema debe recalcular la identidad de todos los libros ya cargados al incorporar
  FR-10, en una única transacción. Si al recalcular dos o más libros pasan a compartir identidad, el
  sistema debe revertir el recálculo completo e informar que existen colisiones, sin modificar
  ningún libro ni ninguna entrada de historial.

## Non-Functional Requirements

- **NFR-01**: La escritura del libro y la de sus entradas de historial deben ocurrir en una **única
  transacción atómica**: ante un fallo, deben persistir **0** de las escrituras. Aplica a la venta,
  que escribe tres cosas —stock, historial de stock e historial de ventas— y a cada edición.
- **NFR-02**: La cobertura de tests del código nuevo debe ser **≥ 80 %** en líneas, ramas y
  funciones.

## Acceptance Criteria

*(EARS — `.daw/rules/validation-rules.instructions.md` §1)*

- **AC-01** (FR-01): WHEN el usuario abre un libro desde su fila en el listado, THE sistema SHALL
  mostrar su título, editorial, stock y precio, y SHALL ofrecer desde esa vista las operaciones de
  FR-03, FR-04, FR-05 y FR-06.
- **AC-02** (FR-02, FR-07, FR-08): WHILE el libro tiene stock S ≥ 1, WHEN el usuario confirma la
  venta desde la vista de detalle, THE sistema SHALL descontar 1 de su stock, SHALL registrar la
  venta en el historial de
  ventas con fecha y precio de venta igual al precio vigente, y SHALL registrar el cambio en el
  historial de stock con fecha, cantidad anterior S, cantidad resultante S − 1 y origen `venta`.
- **AC-03** (FR-02): IF el libro tiene stock 0, THEN THE sistema SHALL impedir la venta con un
  mensaje, SHALL no modificar el stock y SHALL no registrar venta ni entrada de historial.
- **AC-04** (FR-03, FR-08): WHEN el usuario cambia el precio de un libro de P a P' con P' ≠ P, THE
  sistema SHALL persistir P' y SHALL agregar una entrada en el historial de precio con fecha, precio
  anterior P, precio nuevo P' y origen `edición manual`.
- **AC-05** (FR-03): IF el precio ingresado no es un entero > 0 —incluido un valor con parte decimal
  distinta de cero, con separador de miles, no numérico o ausente—, THEN THE sistema SHALL rechazar
  la edición sin redondear ni completar el valor, SHALL informar el motivo, y SHALL no modificar el
  libro ni escribir historial.
- **AC-06** (FR-04, FR-08): WHEN el usuario cambia el stock de un libro de S a S' con S' ≠ S, THE
  sistema SHALL persistir S' y SHALL agregar una entrada en el historial de stock con fecha,
  cantidad anterior S, cantidad resultante S' y origen `edición manual`.
- **AC-07** (FR-05): WHEN el usuario cambia el título y/o la editorial de un libro por valores no
  vacíos, THE sistema SHALL persistir los nuevos valores y SHALL dejar el libro recuperable por
  ellos en la búsqueda.
- **AC-08** (FR-05): IF el nuevo título o la nueva editorial quedan vacíos, THEN THE sistema SHALL
  rechazar la edición con un mensaje y SHALL no modificar el libro.
- **AC-09** (FR-06): IF el nuevo título de un libro normaliza al mismo valor que el de otro libro
  existente, THEN THE sistema SHALL impedir la edición con un mensaje que nombre el libro en
  conflicto y SHALL no modificar el libro.
- **AC-10** (FR-09): IF el precio o el stock enviados en una edición son iguales a los vigentes,
  THEN THE sistema SHALL no modificar el libro y SHALL no agregar ninguna entrada de historial.
- **AC-11** (NFR-01, FR-07, FR-08): IF la escritura de una entrada de historial falla durante una
  venta o una edición, THEN THE sistema SHALL revertir también la escritura del libro, de modo que
  no persista ninguna de las escrituras.
- **AC-12** (NFR-02): THE suite de tests SHALL alcanzar una cobertura ≥ 80 % en líneas, ramas y
  funciones sobre el código introducido por este sub-ticket.
- **AC-13** (FR-10): WHEN el sistema calcula la identidad de un título que termina en uno o más
  signos de puntuación, THE sistema SHALL producir la misma identidad que para ese mismo título sin
  esa puntuación final, incluidos los casos `"Principito, El."` y `"Principito, El"` entre comillas
  contra `"El Principito"`.
- **AC-14** (FR-10, FR-06): IF el nuevo título de una edición difiere del de otro libro existente
  únicamente en signos de puntuación al final, THEN THE sistema SHALL impedir la edición con un
  mensaje que nombre el libro en conflicto y SHALL no modificar el libro.
- **AC-15** (FR-11): WHEN se incorpora la identidad de FR-10 sobre una base con libros ya cargados y
  ninguno de ellos colisiona, THE sistema SHALL recalcular la identidad de todos ellos en una única
  transacción y SHALL dejar cada libro recuperable por su título en la búsqueda.
- **AC-16** (FR-11): IF al recalcular dos o más libros pasan a compartir identidad, THEN THE sistema
  SHALL revertir el recálculo completo, SHALL informar que existen colisiones sin enumerarlas, y
  SHALL no modificar ningún libro ni ninguna entrada de historial.
- **AC-17** (FR-02): WHEN el usuario acciona la venta desde la fila del listado, THE sistema SHALL
  llevarlo a la vista de detalle de ese libro con la venta pendiente de confirmación, SHALL no
  modificar el stock y SHALL no registrar venta ni entrada de historial.

## Out of Scope

- **Foto de portada**: la vista de detalle de este sub-ticket no la muestra ni la gestiona. La
  incorpora FEAT-001c, sobre esta misma vista.
- **Baja lógica del libro** (PRD-001 RF-04), **consulta de archivados** (RF-25) y **reactivación**
  (RF-26). En consecuencia, las restricciones sobre libros archivados (RF-29) tampoco aplican: en
  este sub-ticket todos los libros están activos.
- **Alta de libros**: la entrega FEAT-001a. Acá sólo se modifica lo ya cargado. La excepción es
  indirecta y deliberada: FR-10 cambia la función de identidad que el alta ya consume, así que el
  alta pasa a rechazar duplicados que antes admitía. El flujo de alta en sí no se toca.
- **Enumerar los libros en conflicto** cuando el recálculo de FR-11 encuentra colisiones: el sistema
  informa que las hay, no cuáles.
- **Fusionar dos libros** que resulten ser el mismo: exigiría borrar historial, que el Principio III
  prohíbe.
- **Pantallas de consulta de historiales** (PRD-001 RF-15) y su filtrado (RF-16). Este sub-ticket
  escribe los historiales de venta y de edición; leerlos desde la interfaz es una feature posterior.
- **Los dos flujos de Excel** (PRD-001 RF-06 a RF-09, RF-18 a RF-22, RF-27, RF-28, RF-30) y la
  **búsqueda por foto** (RF-11).
- **Deshacer una venta o revertir una edición**: los historiales dejan el rastro, pero el sistema no
  ofrece revertir la operación.
- Todo lo que PRD-001 declara fuera de alcance en su sección 7.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La venta escribe tres cosas —stock, historial de stock e historial de ventas— y un fallo parcial deja el inventario mintiendo. | Stock descontado sin venta registrada, o al revés: el historial deja de servir para reconstruir nada. | NFR-01 y AC-11 exigen la transacción única y la verifican forzando el fallo de la última escritura. |
| Un click de más sobre la fila del listado descontaría stock y registraría una venta que no ocurrió, sin forma de deshacerla. | Inventario y historial de ventas corrompidos por un error de la usuaria. | **Cerrado en PLAN:** FR-02 y AC-17 exigen que la fila sólo lleve al detalle y que el descuento ocurra recién al confirmar ahí. El click accidental no escribe nada. El costo es un gesto más por venta, aceptado a cambio de que la operación irreversible no dependa de la puntería. |
| La regla de no-cambio (FR-09) y la venta conviven: vender deja el stock distinto, editar al mismo valor no. | Una implementación que compare mal deja ventas sin registrar. | AC-02 y AC-10 cubren los dos lados por separado: la venta siempre escribe, la edición sin cambio nunca. |
| La normalización de títulos de FR-06 es la misma de FEAT-001a. | Reimplementarla acá produciría dos identidades distintas para el mismo catálogo. | FEAT-001a FR-08 la deja en una función compartida; este sub-ticket la modifica en un solo lugar (FR-10) y la consume desde ahí, sin duplicarla. |
| FR-10 cambia una función que el alta y la búsqueda de FEAT-001a ya consumen. | Una regresión acá rompe funcionalidad ya entregada y verificada. | AC-13 fija el comportamiento nuevo y la suite existente de FEAT-001a queda como red de regresión: ninguno de sus tests puede cambiar para que FR-10 pase. |
| El recálculo de FR-11 aborta sin decir qué libros colisionan (AC-16). | La librera sabe que hay un problema y no qué revisar; con inventario cargado, encontrarlo a ojo es inviable. | **Riesgo aceptado por decisión explícita del usuario.** El rastro no se pierde: los pares se recuperan con una consulta manual sobre `titulo_normalizado`. Se acota corriendo el recálculo antes de que entre el inventario real, cuando la probabilidad de colisión es mínima. |

## Dependencies

- **FEAT-001a** (`prd-FEAT-001a.md`): **dependencia bloqueante**. Aporta el esquema de base, los
  libros sobre los que operar, el listado desde el que se entra al detalle, los historiales de precio
  y de stock, y la función compartida de normalización de títulos que consume FR-06 y que modifica
  FR-10. Su suite de tests es la red de regresión de ese cambio.
- **`docs/daw/reports/verify-FEAT-001a.md`**: de donde sale el requisito de entrada que FR-10 y
  FR-11 cierran, recogido en `prd-FEAT-001.md` §«Requisitos de entrada heredados de FEAT-001a».
- **PRD-001** (`docs/daw/prd/PRD.md`): documento de producto del que este PRD es un recorte.
- **`prd-FEAT-001.md`**: PRD padre del split.
- **Stack declarado en `AGENTS.md`**: Next.js 16.3.0 con App Router, React 19.2, TypeScript 5.9.3,
  better-sqlite3 13 sin ORM, Vitest 4, ESLint 9 + Prettier 3.
