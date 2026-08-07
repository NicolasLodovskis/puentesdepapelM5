# PRD FEAT-001c: Portadas

| Field | Value |
|-------|-------|
| Ticket | FEAT-001c |
| Tracker | ninguno |
| Date | 2026-08-07 |
| PRD loops | 0 |

> Sub-ticket `c` de FEAT-001 (ver `prd-FEAT-001.md`). Depende de FEAT-001a y de FEAT-001b. Recorte
> de `PRD.md` (PRD-001, el PRD del producto): cada FR indica de qué RF proviene.

---

## Context and Problem

Con FEAT-001a y FEAT-001b la librera ya carga, busca, vende y corrige libros, pero el listado es una
lista de texto. La decisión de la propietaria registrada en PRD-001 (enmienda del 2026-08-07) es que
**los listados de libros muestran la portada**: es como ella reconoce un libro cuando lo tiene en la
mano.

Este sub-ticket agrega la foto de portada de punta a punta: adjuntarla al dar de alta, verla como
miniatura en cada fila del listado, y poder cambiarla o quitarla desde la vista de detalle. Y agrega
lo que hace falta para que el listado no dependa de que la foto exista: los libros sin foto y los
que tienen una foto ilegible muestran el logo de la aplicación, sin que el listado se rompa.

Es también donde el presupuesto de rendimiento se vuelve exigente de verdad. PRD-001 RNF-01 mide el
segundo de respuesta **sobre el listado ya renderizado con sus miniaturas**: acá se paga el costo de
2.000 imágenes, no el de una consulta.

## Goals

- Que la librera **reconozca un libro por su tapa** en el listado, sin leer el título.
- Que pueda **adjuntar la foto al cargar** un libro, y **cambiarla o quitarla** después.
- Que un libro sin foto, o con una foto que no se puede leer, **no rompa ni vacíe** el listado.
- Que el listado con portadas **siga respondiendo en menos de un segundo** sobre el catálogo real.

## Functional Requirements

**Carga y gestión de la foto**

- **FR-01** (PRD-001 RF-01): El sistema debe permitir adjuntar una foto de portada, de forma
  opcional, al dar de alta un libro. Un alta sin foto debe seguir siendo válida.
- **FR-02** (PRD-001 RF-35): El sistema debe permitir asignar o reemplazar la foto de portada de un
  libro existente desde su vista de detalle.
- **FR-03** (PRD-001 RF-36): El sistema debe permitir quitar la foto de portada de un libro
  existente, dejándolo sin foto y sin alterar ningún otro de sus datos.
- **FR-04** (PRD-001 RF-35, RF-36): El sistema no debe escribir ninguna entrada en los historiales
  de ventas, stock o precio al adjuntar, reemplazar o quitar la foto de portada. Los historiales
  trazan ventas, stock y precio; no la portada.

**Miniaturas en el listado**

- **FR-05** (PRD-001 RF-32): El sistema debe mostrar en cada fila del listado una miniatura de la
  foto de portada del libro, dentro de un recuadro de tamaño uniforme de 96 px de lado mayor, igual
  en todas las filas, para que el listado conserve un alto de fila constante.
- **FR-06** (PRD-001 RF-33): El sistema debe mostrar la imagen por defecto de la aplicación —el logo
  de "Puentes de Papel"— en el mismo recuadro y con el mismo tamaño que una miniatura cuando el
  libro no tiene foto de portada. El logo es un recurso fijo de la aplicación: mostrarlo no debe
  guardar ninguna foto en el libro ni convertirlo en un libro con foto.
- **FR-07** (PRD-001 RF-34): El sistema debe mostrar la imagen por defecto cuando el libro tiene una
  foto registrada pero su archivo no se puede leer, y debe completar el listado sin truncarlo, sin
  dejar filas vacías y sin fallar.

## Non-Functional Requirements

- **NFR-01** (PRD-001 RNF-01): La búsqueda por nombre o por editorial y el listado del catálogo
  completo deben responder en **< 1 s (p95)** sobre un catálogo de **2.000 libros**, medido sobre el
  listado **ya renderizado con sus miniaturas**. El presupuesto incluye el costo de las imágenes, no
  sólo el de la consulta.
- **NFR-02**: La cobertura de tests del código nuevo debe ser **≥ 80 %** en líneas, ramas y
  funciones.

## Acceptance Criteria

*(EARS — `.daw/rules/validation-rules.instructions.md` §1)*

- **AC-01** (FR-01): WHEN el usuario adjunta una foto al dar de alta un libro, THE sistema SHALL
  persistir el libro con esa foto y SHALL mostrarla como miniatura en su fila del listado; y WHEN el
  usuario da de alta un libro sin adjuntar foto, THE sistema SHALL aceptar el alta igual.
- **AC-02** (FR-05): WHEN un libro con foto de portada aparece en el listado, THE sistema SHALL
  mostrar en su fila una miniatura de esa foto dentro de un recuadro de 96 px de lado mayor, y SHALL
  usar el mismo tamaño de recuadro en todas las filas del listado.
- **AC-03** (FR-06): WHERE el libro no tiene foto de portada, THE sistema SHALL mostrar en su fila
  el logo de la aplicación en el mismo recuadro y con el mismo tamaño que una miniatura, y SHALL
  mantener el libro registrado sin foto: una consulta posterior no devuelve ninguna foto para él.
- **AC-04** (FR-07): IF el archivo de la foto de un libro no se puede leer, THEN THE sistema SHALL
  mostrar el logo en esa fila y SHALL devolver el listado completo, con todas las demás filas
  presentes y el orden alfabético intacto.
- **AC-05** (FR-02, FR-04): WHEN el usuario asigna una foto a un libro sin foto, o reemplaza la foto
  F de un libro por F', THE sistema SHALL persistir la foto resultante, SHALL mostrarla como
  miniatura en la fila del listado en lugar del logo o de la foto anterior, y SHALL no agregar
  ninguna entrada a los historiales de ventas, stock o precio.
- **AC-06** (FR-03, FR-04): WHEN el usuario quita la foto de un libro, THE sistema SHALL dejarlo
  registrado sin foto, SHALL pasar a mostrar el logo en su fila del listado, y SHALL dejar sin
  cambios su título, editorial, stock, precio e historiales.
- **AC-07** (FR-02): IF el archivo que el usuario intenta adjuntar no es una imagen de un formato
  admitido, THEN THE sistema SHALL rechazarlo con un mensaje y SHALL dejar la foto anterior del
  libro sin cambios.
- **AC-08** (NFR-01, FR-05, FR-06): WHILE el catálogo tiene 2.000 libros, WHEN el usuario busca o
  abre el catálogo completo, THE sistema SHALL devolver el listado renderizado con sus miniaturas en
  menos de 1 s en el percentil 95.
- **AC-09** (NFR-02): THE suite de tests SHALL alcanzar una cobertura ≥ 80 % en líneas, ramas y
  funciones sobre el código introducido por este sub-ticket.

## Out of Scope

- **Búsqueda por foto** (PRD-001 RF-11) y su presupuesto RNF-02. Este sub-ticket guarda y muestra
  fotos; no las compara ni busca con ellas. La librería de reconocimiento sigue sin definir.
- **Miniaturas en la lista de candidatos de la búsqueda por foto** (PRD-001 RF-32, tercer listado) y
  en la **consulta de archivados** (RF-25): esos dos listados no existen todavía. Cuando se
  implementen, heredan las reglas de FR-05, FR-06 y FR-07.
- **Edición de la imagen**: recortar, rotar, ajustar. La foto se guarda como la carga la usuaria.
- **Baja lógica y archivados** (PRD-001 RF-04, RF-25, RF-26), y por lo tanto RF-29: gestionar la
  foto de un libro archivado no aplica mientras no exista el archivado.
- **Los dos flujos de Excel** (PRD-001 RF-06 a RF-09, RF-18 a RF-22): ninguno de los dos carga
  fotos.
- **Pantallas de consulta de historiales** (PRD-001 RF-15, RF-16).
- Todo lo que PRD-001 declara fuera de alcance en su sección 7.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El logo versionado en `public/logo-puentes-de-papel.jpg` pesa 690 KB, y FR-06 lo repite en cada fila sin foto del catálogo completo. | Incumplimiento directo de NFR-01: 2.000 filas contra un asset de 690 KB. | Servir una versión optimizada del logo al tamaño del recuadro (96 px). Decisión de PLAN; NFR-01 y AC-08 la vuelven verificable en vez de opinable. |
| El catálogo completo renderiza 2.000 filas con 2.000 imágenes. | NFR-01 inalcanzable, y el listado del catálogo completo —que es la vista por defecto— queda inusable. | AC-08 mide exactamente ese caso. Si falla, PLAN decide entre miniaturas pregeneradas, carga diferida, virtualización o paginación. Es el riesgo que PRD-001 sección 8 ya anticipa. |
| Las fotos son archivos subidos por la usuaria y servidos por la aplicación. | Path traversal al construir la ruta del archivo, o servir contenido arbitrario disfrazado de imagen. | AC-07 valida el formato en la carga. La ruta de guardado y la forma de servir las imágenes son decisiones de PLAN, sujetas al threat model. |
| Una foto puede desaparecer del disco sin que la base se entere. | Filas vacías o listado roto para la usuaria. | FR-07 y AC-04 hacen de la foto ilegible un caso normal y no un error: se muestra el logo y el listado se completa. |
| Las fotos viven fuera de la base y el `.db` no las contiene. | Un resguardo del `.db` sin las fotos restaura un catálogo sin portadas. | Consistente con PRD-001 sección 7: el resguardo es responsabilidad de la usuaria y está fuera de alcance. Se documenta dónde quedan los archivos. |

## Dependencies

- **FEAT-001a** (`prd-FEAT-001a.md`): **dependencia bloqueante**. Aporta el alta que FR-01 amplía y
  el listado sobre el que FR-05, FR-06 y FR-07 dibujan las miniaturas.
- **FEAT-001b** (`prd-FEAT-001b.md`): **dependencia bloqueante**. Aporta la vista de detalle desde
  la cual FR-02 y FR-03 gestionan la foto.
- **`public/logo-puentes-de-papel.jpg`**: imagen por defecto de la aplicación, requerida por FR-06 y
  FR-07. Ya versionada en el repositorio. Sin ella, esos dos requerimientos no se pueden cumplir.
- **PRD-001** (`docs/daw/prd/PRD.md`): documento de producto del que este PRD es un recorte.
- **`prd-FEAT-001.md`**: PRD padre del split.
- **Almacenamiento de las fotos de portada**: dónde se guardan los archivos y cómo se sirven no está
  definido en PRD-001. Es una decisión de PLAN de la que dependen FR-01, FR-02, FR-03, FR-05 y
  FR-07.
- **Stack declarado en `AGENTS.md`**: Next.js 15 con App Router, React 19, TypeScript 5.9,
  better-sqlite3 sin ORM, Vitest, ESLint + Prettier.
