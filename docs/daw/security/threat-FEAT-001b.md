# Threat Model — FEAT-001b: Venta y edición

| Campo | Valor |
|---|---|
| Ticket | FEAT-001b |
| Tier | FEATURE |
| Fecha | 2026-08-12 |
| PRD | `docs/daw/prd/prd-FEAT-001b.md` |
| Metodología | STRIDE (F-TM-01 a F-TM-07 de `.daw/rules/validation-rules.instructions.md` §3) |
| Antecedente | `threat-FEAT-001a.md` — este modelo lo continúa, no lo repite |
| Resultado | **PASSED** — todo riesgo HIGH tiene mitigación incorporada a la spec |

---

## 1. Arquitectura analizada

Se analiza el diseño concreto de FEAT-001b (F-TM-06), tal como quedó después de la auditoría de
arquitectura. Lo que FEAT-001a ya modeló —el listado, el alta, la conexión, el archivo `.db`, las
dependencias npm— sigue vigente y no se re-analiza; acá van los componentes **nuevos o modificados**.

| ID | Componente | Novedad |
|---|---|---|
| D1 | Vista de detalle (`app/libros/[id]/`) | **Nuevo.** Server Component con un parámetro de ruta que llega del navegador. Primera superficie del proyecto que recibe un identificador de la URL. |
| D2 | Server Action de venta | **Nuevo.** Escribe stock, historial de stock y la fila de venta. Operación irreversible por diseño (PRD §Out of Scope: no hay deshacer). |
| D3 | Server Action de edición | **Nuevo.** Escribe título, editorial, stock y precio, con sus historiales. |
| D4 | Lectura por id (`lib/db/consultas.ts`) | **Nuevo.** Consulta de una sola fila por clave primaria. |
| D5 | Repositorio de venta y edición (`lib/db/`) | **Nuevo.** Dos caminos de escritura de `libros` que antes no existían. |
| D6 | Derivación de columnas calculadas (`lib/dominio/`) | **Nuevo.** Única función que produce `titulo_normalizado`, `titulo_orden` y `editorial_normalizada`; la consumen el alta, la edición y la migración. |
| D7 | `normalizarTitulo()` | **Modificado.** Cambia la identidad de todo el catálogo (FR-10). |
| D8 | Migración 002 | **Nuevo.** Crea la tabla `ventas` y **reescribe `titulo_normalizado` de todas las filas existentes** en el arranque. |
| D9 | Tabla `ventas` | **Nuevo.** Fecha y precio de venta por ejemplar vendido. |
| D10 | Control de venta en la fila del listado | **Modificado.** `app/componentes/listado-libros.tsx` gana un enlace al detalle. |

### Fronteras de confianza (F-TM-02)

TB-1 a TB-4 se heredan de `threat-FEAT-001a.md` sin cambios. Este sub-ticket agrega una:

| ID | Frontera | Por qué es una frontera |
|---|---|---|
| TB-5 | Navegador → parámetro de ruta `[id]` → consulta a SQLite (D1 → D4) | **Nueva en el proyecto.** Hasta ahora todo lo que llegaba del navegador entraba por un `FormData` que el repositorio validaba campo por campo. Un segmento de URL es entrada no confiable que viaja hasta un `WHERE id = ?` con un solo paso de por medio, y Next lo entrega como `string` arbitrario: `/libros/abc`, `/libros/-1`, `/libros/9e99`, `/libros/1;DROP…`. |

Vale reafirmar TB-1 para las dos acciones nuevas: **un Server Action es un endpoint HTTP invocable
directamente**, sin pasar por la pantalla. Lo que el formulario no manda, un `POST` a mano sí puede
mandar; y lo que la pantalla impide —vender un libro con stock 0, confirmar dos veces— el servidor
tiene que impedirlo por su cuenta.

### Clasificación de datos (F-TM-05)

| Dato | Clasificación | Cifrado |
|---|---|---|
| Título, editorial, precio, stock, historiales de precio y de stock | **Comercial interno** (sin cambios respecto de FEAT-001a). | No aplica F-TM-07. Riesgo aceptado A2. |
| **Historial de ventas** (fecha + precio de venta) — nuevo | **Comercial interno.** Es el dato más sensible que el sistema haya guardado: la serie de ventas reconstruye la facturación del negocio día por día. Sigue sin ser PII. | No aplica F-TM-07: no es PII ni credencial. Queda bajo A2, cuya condición de revisión ya contempla la aparición del módulo de facturación. |
| Datos personales de clientes | **No existen.** La venta registra fecha y precio; no hay comprador, ni medio de pago, ni comprobante (PRD §Out of Scope). | — |
| Credenciales, tokens, claves | **No existen.** | — |

F-TM-07 se satisface por ausencia, igual que en FEAT-001a: ningún dato del alcance es PII ni
credencial. Se deja escrito para que la ausencia no se confunda con un olvido.

---

## 2. Análisis STRIDE por componente (F-TM-01)

### D1 — Vista de detalle (`app/libros/[id]/`)

| Categoría | Análisis |
|---|---|
| **S** Spoofing | Sin identidad que suplantar (A1). |
| **T** Tampering | El `[id]` es texto arbitrario del navegador. No se concatena en SQL —el proyecto liga por `?` posicional y lo vigilan las guardias de `consultas.ts`—, pero un id no numérico o gigantesco llega igual al driver. **R1.** |
| **R** Repudiation | Lectura: nada que repudiar. |
| **I** Information Disclosure | Permite enumerar el catálogo pidiendo `/libros/1`, `/libros/2`… **R2.** Además, un id inexistente puede delatar cuántos libros hay según cómo se responda. |
| **D** Denial of Service | Una sola fila por clave primaria; el costo es constante. Sin riesgo. |
| **E** Elevation of Privilege | No hay privilegios. |

### D2 — Server Action de venta

| Categoría | Análisis |
|---|---|
| **S** Spoofing | A1. |
| **T** Tampering | Dos vectores concretos: **(a)** si el precio de venta viajara en el formulario, un `POST` a mano registraría la venta al precio que quisiera, falseando la serie de facturación — **R3**; **(b)** el reenvío del `POST` (F5, doble click, botón atrás) descuenta stock y registra una venta por cada envío — **R4**. |
| **R** Repudiation | Mono-usuario: no hay atribución (A1). El historial de stock con origen `venta` y la fila de `ventas` con su fecha son el único rastro, y son suficientes para reconstruir *qué* pasó, no *quién* lo hizo. |
| **I** Information Disclosure | El error de una venta fallida no debe exponer texto del motor ni rutas del disco. **R7.** |
| **D** Denial of Service | Un `POST` repetido en bucle escribe filas de `ventas` sin límite y agota el disco. Alcance: quien ya llega al puerto local (A1). Bajo. |
| **E** Elevation of Privilege | No hay privilegios. |

### D3 — Server Action de edición

| Categoría | Análisis |
|---|---|
| **S** Spoofing | A1. |
| **T** Tampering | La edición puede fijar precio y stock a cualquier valor que pase la validación; es su función. El vector real es el **check-then-act**: leer el valor vigente fuera de la transacción y escribir el `precio_anterior` con un dato ya viejo corrompe el historial sin que nada falle. **R5.** |
| **R** Repudiation | Origen `edición manual` en cada entrada: el cambio queda registrado con su valor anterior. Es lo máximo que se puede pedir sin usuarios. |
| **I** Information Disclosure | El mensaje de título duplicado **nombra el libro en conflicto** (AC-09/AC-14). Es un requisito de producto y el catálogo ya es visible entero para quien llega; no agrega exposición. |
| **D** Denial of Service | Igual que D2, bajo. |
| **E** Elevation of Privilege | No hay privilegios. |

### D4/D5 — Lectura por id y repositorio de escritura

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No aplica. |
| **T** Tampering | SQL en constantes literales con `?` posicionales, como todo el repositorio; lo afirman las guardias de `libros.ts` y `consultas.ts`, que hay que replicar para los módulos nuevos. **M9.** El filtro `estado = 'activo'` debe seguir aplicando también a la lectura por id: es la única de las tres reglas de esa guardia que ningún test de negocio cubre. **R6.** |
| **R** Repudiation | Las escrituras y sus historiales van en la misma transacción `immediate` (NFR-01): no hay forma de que quede el efecto sin el registro. |
| **I** Information Disclosure | Los rechazos salen estructurados por campo, sin texto del motor. |
| **D** Denial of Service | `immediate` toma el lock de escritura desde el principio; en un proceso único no hay contención real. |
| **E** Elevation of Privilege | No aplica. |

### D6/D7 — Derivación e identidad de títulos

| Categoría | Análisis |
|---|---|
| **S** Spoofing | **La identidad es literalmente el mecanismo antisuplantación del catálogo.** Un título que normaliza distinto del mismo libro es un libro fantasma con su propio stock y su propio precio: es el agujero que FR-10 cierra. |
| **T** Tampering | Si un camino de escritura futuro deriva las columnas por su cuenta en vez de usar D6, la identidad almacenada se desincroniza de la calculada **sin un solo test rojo**, y el `UNIQUE` pasa a proteger una clave que ya nadie calcula. **R8** — es el hallazgo del auditor de arquitectura, y es de seguridad, no sólo de diseño. |
| **R** Repudiation | No aplica: funciones puras. |
| **I** Information Disclosure | No aplica. |
| **D** Denial of Service | El recorte de puntuación es una clase de caracteres anclada al final, sin cuantificadores anidados: costo lineal, sin ReDoS (misma propiedad que el patrón de artículo pospuesto de FEAT-001a). |
| **E** Elevation of Privilege | No aplica. |

### D8/D9 — Migración 002 y tabla `ventas`

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No aplica. |
| **T** Tampering | **Es la operación más destructiva que el proyecto haya ejecutado: reescribe una columna de identidad de todas las filas del inventario, en el arranque, sin intervención de la usuaria.** Un fallo a mitad de camino dejaría el catálogo con identidades mezcladas y el `UNIQUE` protegiendo un conjunto inconsistente. **R9.** |
| **R** Repudiation | La migración no escribe historial, y es correcto: no cambia stock ni precio (Principio III no aplica a una columna derivada). Pero tampoco deja rastro de haber corrido más allá de `user_version`. Aceptable: `user_version` **es** el rastro. |
| **I** Information Disclosure | El aviso de colisión no enumera los libros en conflicto (AC-16, decisión de la usuaria). Además de ser lo pedido, evita que un canal de error liste títulos del inventario. **M7.** |
| **D** Denial of Service | **El escenario de fallo elegido convierte un error de datos en un agotamiento de recursos:** `obtenerDb()` no cachea ni cierra el handle cuando `migrar()` lanza, así que cada navegación y cada Server Action abre un `Database` nuevo sobre el mismo archivo con WAL activo, y ninguno se cierra. **R10.** |
| **E** Elevation of Privilege | No aplica. |

### D10 — Control de venta en la fila del listado

| Categoría | Análisis |
|---|---|
| **T** Tampering | El enlace no ejecuta nada: lleva al detalle. AC-17 exige que accionar desde la fila no escriba, y eso es también el control contra el click accidental. |
| **I** Information Disclosure | El listado ya muestra el inventario completo; un enlace más no agrega superficie. |
| **D** Denial of Service | Un `<button>` con estado por fila metería JavaScript de cliente en 2.000 filas y tiraría abajo NFR-01 de FEAT-001a **sin que el bench lo vea**, porque mide el armado del HTML en Node. Riesgo de rendimiento con forma de regresión silenciosa. **M11.** |

---

## 3. Riesgos y mitigaciones

| ID | Riesgo | STRIDE | Probab. | Impacto | Mitigación |
|---|---|---|---|---|---|
| R1 | El `[id]` de la ruta llega al driver sin ser un entero (`abc`, `-1`, `9e99`, `1e400`) | T | Alta | Medio | **M1** |
| R2 | Enumeración del catálogo por id secuencial | I | Alta | Bajo | Sin mitigación propia: quien alcanza el proceso ya ve el listado entero. Cae bajo **A1**. |
| R3 | El precio de venta enviado desde el cliente falsea la serie de facturación | T | Media | **Alto** | **M2** |
| R4 | Reenvío del `POST` de venta: cada envío descuenta stock y registra una venta | T | **Alta** | **Alto** | **M3** |
| R5 | Check-then-act en venta y edición: el valor "anterior" del historial se lee fuera de la transacción | T | Media | **Alto** | **M4** |
| R6 | La lectura por id deja de filtrar `estado = 'activo'` al acotar la guardia | T | Media | Medio | **M5** |
| R7 | Un error de venta o de edición expone texto del motor SQLite o rutas del disco | I | Media | Medio | **M8** |
| R8 | La identidad almacenada se desincroniza de la calculada en un cambio futuro, sin test rojo | T | **Alta** | **Alto** | **M6** |
| R9 | Fallo parcial del recálculo: identidades mezcladas en el catálogo | T | Baja | **Crítico** | **M7** |
| R10 | Fuga de handles de conexión ante el fallo de migración: un `Database` sin cerrar por request | D | **Alta** (dado el escenario) | **Alto** | **M10** |
| R11 | El control de la fila introduce JavaScript de cliente y tira abajo NFR-01 sin poner rojo el bench | D | Media | Medio | **M11** |
| R12 | Las guardias recursivas de `app/` no alcanzan la ruta nueva | T/I | Baja | **Alto** | **M9** |

---

## 4. Riesgos aceptados (F-TM-04)

**A1 — Ausencia de autenticación** y **A2 — Base sin cifrar y sin resguardo automático** se heredan
de `threat-FEAT-001a.md` §4 sin cambios en su sustancia: mismo aceptante (Nicolás Lodovskis, sobre
la decisión de producto de PRD-001 §6 y §7), misma justificación, mismo control compensatorio
(`127.0.0.1`, resguardo manual) y misma fecha de revisión máxima, **2027-02-07**.

Este sub-ticket agrega un dato al alcance de A2 —el historial de ventas, que reconstruye la
facturación día por día— y no cambia su clasificación: sigue siendo comercial interno, no PII. La
condición de revisión de A2 ya contempla explícitamente la aparición del módulo de facturación,
que es el momento en que este dato pasaría a otra categoría.

**A3 — La venta no se puede deshacer**

| Campo | Valor |
|---|---|
| Riesgo | Una venta confirmada por error descuenta stock y escribe una fila de `ventas` que el sistema no ofrece revertir (PRD §Out of Scope). Corregir exige una edición manual de stock, que deja su propia entrada de historial: el rastro queda, pero la serie de ventas conserva la venta que no ocurrió. |
| Quién lo acepta | Nicolás Lodovskis, en este ticket. |
| Justificación | Deshacer una venta exigiría borrar o anular una entrada de historial, y el Principio III lo prohíbe. La alternativa —una venta anulada como entrada nueva— es una feature con su propia semántica contable, fuera del alcance de este sub-ticket. |
| Control compensatorio | **M3** (confirmación en el detalle + redirección tras el POST) reduce la probabilidad de la venta accidental, que era el riesgo abierto del PRD. La fila de `ventas` con su fecha permite detectar la venta espuria y compensarla con una edición de stock. |
| Condiciones de revisión | Se reevalúa cuando aparezcan las pantallas de consulta de historiales (PRD-001 RF-15), que es cuando la serie de ventas empieza a leerse y una venta espuria pasa a ser visible. Revisión máxima: **2027-02-12**. |

---

## 5. Mitigaciones a incorporar a la spec

Entran como requisitos de implementación, no como recomendaciones. Cada una lleva el bloque donde
vive y el riesgo que cierra.

1. **M1 — El `[id]` se valida antes de tocar la base.** Se acepta únicamente un entero seguro y
   positivo (`Number.isSafeInteger` sobre el valor parseado, y rechazo de todo lo que no sea dígitos);
   cualquier otra cosa responde 404 sin consultar. Cierra **R1**. *(Bloque 3)*
2. **M2 — El precio de venta no viaja en el formulario.** Se lee de la fila del libro **dentro de la
   misma transacción** que descuenta el stock. El cliente no puede fijar a qué precio se vendió.
   Cierra **R3**. *(Bloque 4)*
3. **M3 — Redirección después de la venta y de la edición** (POST-Redirect-GET): el reenvío del
   navegador no puede repetir la operación. Sumado a la confirmación en el detalle (AC-17), es el
   control contra la venta accidental y contra la venta duplicada. Cierra **R4**. *(Bloques 4 y 5)*
4. **M4 — Venta y edición leen la fila vigente dentro de su propia transacción `immediate`.** El
   stock ≥ 1 de la venta, el valor anterior de cada historial y la comparación de no-cambio (FR-09)
   se resuelven con datos leídos dentro de la transacción, nunca antes de abrirla. Cierra **R5**.
   *(Bloques 4 y 5)*
5. **M5 — La guardia de `consultas.ts` se acota sólo en el `ORDER BY`.** `estado = 'activo'` y la
   prohibición de ordenar por `titulo_normalizado` siguen aplicando a **toda** sentencia del módulo,
   sin excepciones; el requisito de `ORDER BY titulo_orden` se exceptúa de forma **sintáctica y
   mecánica** para las sentencias que filtran por clave primaria, con una meta-guardia que verifica
   que el conjunto no exceptuado no quedó vacío. Cierra **R6**. *(Bloque 3)*
6. **M6 — Guardia de coherencia de la identidad.** Sobre una base sembrada, para todo libro debe
   valer `titulo_normalizado === normalizarTitulo(titulo)`. Se acompaña de la convención escrita:
   todo cambio a la derivación exige su migración de recálculo. Cierra **R8**. *(Bloque 2)*
7. **M7 — El recálculo es atómico y detecta antes de escribir.** Una sola transacción; las
   identidades nuevas se calculan en memoria y se buscan duplicados **antes** de la primera
   escritura; el `UPDATE` va en **dos pasadas con centinela por fila**, porque precalcular descarta
   la colisión del estado final pero no la del estado intermedio cuando dos libros intercambian
   identidad. Ante colisión: revierte entero, `user_version` no avanza, y el aviso **no enumera** los
   libros en conflicto. Cierra **R9**. *(Bloque 2)*
8. **M8 — Ningún mensaje nuevo expone texto del motor ni rutas del disco.** Extiende la mitigación 8
   de FEAT-001a a las superficies nuevas: los rechazos de venta y de edición son motivos tipados con
   su texto curado, y el aviso de colisión es una constante propia, no el `message` de la excepción.
   Cierra **R7**. *(Bloques 2, 4 y 5)*
9. **M9 — Las guardias existentes deben alcanzar el código nuevo, y hay que probarlo.** Las de `app/`
   son recursivas y cubren la ruta nueva sola, pero eso se verifica en vez de suponerse; las de
   `lib/db/` son por archivo y hay que replicarlas para cada módulo nuevo (SQL sin interpolación,
   `import 'server-only'` como primer import, alta en la lista fija de `migrar.test.ts`). Cierra
   **R12**. *(Todos los bloques)*
10. **M10 — `obtenerDb()` cierra el handle si la migración falla.** Sin eso, "la app no arranca" es
    en realidad "la app falla y filtra un descriptor por navegación". Cierra **R10**. *(Bloque 2)*
11. **M11 — El control de la fila es un enlace, y una guardia lo sostiene.** `listado-libros.tsx` no
    puede ganar `'use client'`; se agrega el test que lo afirma, porque el bench mide el armado del
    HTML en Node y no vería la regresión. Cierra **R11**. *(Bloque 3)*

---

## 6. Resultado

```
┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling FEAT-001b — PASSED                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Superficies de ataque identificadas: 10                 │
│  Fronteras de confianza declaradas: 5 (4 heredadas + 1)  │
│                                                          │
│  🔴 CRÍTICO: R9 recálculo parcial → M7                   │
│  🟠 ALTO:    R3 precio de venta desde el cliente → M2     │
│  🟠 ALTO:    R4 reenvío del POST de venta → M3            │
│  🟠 ALTO:    R5 check-then-act en historiales → M4        │
│  🟠 ALTO:    R8 identidad desincronizada → M6             │
│  🟠 ALTO:    R10 fuga de handles de conexión → M10        │
│  🟠 ALTO:    R12 guardias que no alcanzan → M9            │
│  🟡 MEDIO:   R1 · R6 · R7 · R11 → M1 · M5 · M8 · M11      │
│  🟢 BAJO:    R2 (bajo A1)                                 │
│                                                          │
│  Riesgos aceptados: A1, A2 (heredados) · A3 (nuevo)      │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│  Riesgos: C:1 H:6 M:4 L:1                                │
│  Mitigaciones a la spec: 11                              │
└─────────────────────────────────────────────────────────┘
```

Todo riesgo CRÍTICO y ALTO tiene mitigación concreta asignada a un bloque de la spec (F-TM-03), y
los tres riesgos aceptados llevan sus tres campos: quién acepta, justificación y condiciones de
revisión (F-TM-04).
