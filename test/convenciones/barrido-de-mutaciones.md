# Barrido de mutaciones

Cada punto de este archivo es un **cambio de una línea sobre el código** y el test que se pone rojo
cuando ese cambio existe. Sirve para lo que un test verde no puede decir por sí solo: si la suite se
pone roja **por el motivo correcto**.

## Por qué vive acá y no en un reporte

El barrido nació en una revisión y quedó escrito sólo en el reporte de un agente. Un contrato que no
está en el árbol no obliga a nadie: la revisión siguiente no lo puede leer, no lo puede correr y no
se entera de que un punto se perdió. Está junto a las guardias que lo sostienen —y no en
`docs/daw/specs/`— porque describe el comportamiento de estos tests, no el alcance de un ticket.

## La guardia que lo sostiene

`test/convenciones/barrido-de-mutaciones.test.ts` comprueba que **cada nombre de test citado acá
existe en la suite recolectada**. Los nombres se le preguntan a Vitest (`vitest list`, que colecta
sin ejecutar), no se deducen del fuente: los describes se arman con plantillas y los `it.each`
interpolan la ruta del módulo, así que la única lista fiel es la del propio runner.

La regla de la cita es una sola: **un tramo entre acentos graves que contenga el separador de Vitest
—espacio, mayor, espacio— es un nombre de test**, porque los nombres se citan siempre completos, con
su describe adelante. Los bloques de código quedan afuera de la extracción. Borrar o renombrar un
test citado pone rojo, en vez de dejar este archivo mintiendo: eso es lo que lo separa de un
comentario.

## Cómo se leen los puntos: anclas, no números de línea

Los puntos nombran **el archivo y el texto** que hay que tocar, nunca un número de línea. La versión
anterior llevaba la línea de cada mutación y veinticinco de ellas apuntaban a archivos que el bloque
5 mueve: un número desfasado no pone nada rojo, y el ancla de texto sigue siendo lo que manda aunque
el archivo crezca.

**Sobre la numeración.** `M01`–`M25` es la numeración _de este archivo_. El barrido original vivía
fuera del árbol, así que los puntos se re-derivaron del código y se **re-ejecutaron uno por uno**
contra el árbol de entonces. Si aquel barrido tenía un punto que acá no quedó representado, no hay
forma de saberlo desde el repositorio: es exactamente el costo que este archivo existe para no
volver a pagar.

## Cómo se verificó cada punto

1. Copia fresca del repositorio **fuera del árbol real**, una por mutación (nunca mutar y restaurar
   sobre la misma copia: la caché de transformación de Vite hace inestables los resultados).
2. Se aplica la mutación.
3. `npx vitest run` **completo**, y se registran **todos** los tests que fallan.

Un punto está **cerrado** si al menos un test se pone rojo. Está **abierto** si la suite entera queda
en verde: eso no es una omisión, es información, y por eso se escribe con su mutación.

Las secciones A y B se verificaron contra el árbol del bloque 4. Las secciones C y D se verificaron
contra el árbol de la ronda de entrada del bloque 5, que es el vigente; de A y B se re-ejecutaron
sólo los puntos que esa ronda tocó (M11 y M22).

---

## A. El barrido del bloque 4 — 25 puntos, los 25 cerrados

### La operación: `lib/db/ventas.ts`

| #   | Mutación                                                                                                                            | Se pone rojo                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M01 | `if (fila.stock < EJEMPLARES_POR_VENTA)` → `if (fila.stock < 0)` — vende sin ejemplares                                             | `venderEjemplar() > con stock 0 rechaza con motivo tipado y no escribe nada (AC-03)` y su espejo en la suite de la Server Action                                   |
| M02 | `fila.stock - EJEMPLARES_POR_VENTA` → `fila.stock` — no descuenta                                                                   | 5 tests, entre ellos `venderEjemplar() > descuenta 1 ejemplar y registra la venta y el historial de stock (AC-02, FR-07, FR-08)`                                   |
| M03 | `SQL_DESCONTAR_STOCK).run(stockResultante, id)` → `run(stockResultante, 1)` — descuenta del libro 1                                 | 5 tests; el que lo distingue es el que siembra **dos** libros                                                                                                      |
| M04 | `SQL_INSERTAR_STOCK).run(id, …)` → `run(1, …)` — entrada de historial con el `libro_id` equivocado                                  | 3 tests. Es la peor de todas: el Principio III prohíbe editar o borrar una entrada de historial                                                                    |
| M05 | `run(id, ahora, fila.stock, stockResultante, …)` → `run(id, ahora, stockResultante, fila.stock, …)` — cantidades invertidas         | 3 tests                                                                                                                                                            |
| M06 | `SQL_INSERTAR_VENTA).run(id, …)` → `run(1, …)` — venta a nombre de otro libro                                                       | 4 tests                                                                                                                                                            |
| M07 | `run(id, ahora, fila.precio)` → `run(id, new Date(0).toISOString(), fila.precio)` — la venta y su historial con instantes distintos | 3 tests; la aserción que lo caza es `fecha: registradas[0].fecha`                                                                                                  |
| M08 | `return venta.immediate();` → `return venta();` — `BEGIN` diferido (M4)                                                             | `forma de las transacciones de lib/db (M4, R5) > lib/db/ventas.ts abre la transacción en modo immediate (M4, R5)` — **y nada más**: ningún test de negocio lo nota |
| M09 | `AND id = ?` → `AND id >= ?` en `SQL_LIBRO_A_VENDER` (M5)                                                                           | 3 tests, uno de ellos `venderEjemplar() > sobre un libro archivado responde igual que sobre uno inexistente`                                                       |
| M10 | quitar `WHERE estado = 'activo'` del `SELECT` de control                                                                            | sólo `venderEjemplar() > sobre un libro archivado responde igual que sobre uno inexistente`                                                                        |
| M11 | quitar `import 'server-only';`                                                                                                      | 3 tests: los dos registradores de M9 del módulo y la guardia derivada del runner (ver abajo)                                                                       |
| M12 | `ORIGEN_VENTA = 'venta'` → `'edición manual'`                                                                                       | 3 tests                                                                                                                                                            |

Los tres rojos de **M11**, re-ejecutados contra el árbol vigente:
`convenciones de lib/db/ventas.ts (M9) > marca server-only antes que ningún otro import`,
`las sentencias de lib/db/ventas.ts eligen la fila por su clave primaria (AC-02, M5) > marca server-only antes que ningún otro import`
y `convenciones de lib/db > lib/db/ventas.ts marca server-only antes que ningún otro import`. El
segundo existe desde que los dos registradores aplican las cuatro reglas de M9 (punto G01).

### La Server Action: `app/acciones-libro.ts`

| #   | Mutación                                                                                 | Se pone rojo                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M13 | quitar `'use server';`                                                                   | `los módulos que proveen la acción de un formulario declaran la directiva > todos declaran la directiva de Server Actions` — **y nada más**: en los tests la acción es una función común |
| M14 | borrar el `redirect(rutaDelDetalle(id));` final — el `POST` queda reenviable (M3)        | 5 tests                                                                                                                                                                                  |
| M15 | dejar sólo `revalidatePath('/')`                                                         | `ventaDeLibro() > revalida la ruta del catálogo y la del detalle de ese libro, no una sola`                                                                                              |
| M16 | `redirect(rutaDelDetalle(id))` → `redirect(rutaDelDetalle(1))`                           | `ventaDeLibro() > tras la venta redirige al detalle de ese libro, así que el reenvío no la repite (M3, R4)`                                                                              |
| M17 | `identificadorDeLibro(datos.get('id'))` → `Number(datos.get('id'))` (M1)                 | `ventaDeLibro() > responde 404 sin llegar al repositorio ante un id que no es un entero positivo (M1, R1)`                                                                               |
| M18 | `console.error(…, error)` → `console.error(…, error, datos)` — el `POST` copiado al log  | `ventaDeLibro() > ante un fallo de infraestructura no expone el motor y registra sin el formulario (M8)`                                                                                 |
| M19 | `throw new Error(MENSAJE_ERROR_DE_VENTA)` → `throw error` — el texto del motor sube (M8) | el mismo test que M18                                                                                                                                                                    |

### Las pantallas

| #   | Archivo                              | Mutación                                                                                          | Se pone rojo                                                                                                                             |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| M20 | `app/libros/[id]/page.tsx`           | `<form action={ventaDeLibro}>` → `<form action="/">` — el botón navega en vez de vender           | `ventaDeLibro() > el control de confirmación ejecuta la venta y le pasa el id del libro (AC-02, M3)` y 3 de la guardia de `'use server'` |
| M21 | `app/libros/[id]/page.tsx`           | `value={String(libro.id)}` → `value="1"` — el detalle postea siempre el libro 1                   | el mismo test de confirmación. Falsable **sólo** porque la siembra da dos libros                                                         |
| M22 | `app/componentes/listado-libros.tsx` | el `<a href={rutaDelDetalle(libro.id)}>` de la celda de venta → un `<form method="post">` (AC-17) | 2 tests (ver abajo)                                                                                                                      |
| M23 | `app/mensajes.ts`                    | `SOLO_DIGITOS = /^\d+$/u` → `/^\s*\d+$/u` — entra `' 1'` (M1)                                     | el 404 de la acción **y** el de la ruta del detalle: una sola implementación, dos superficies                                            |
| M24 | `app/mensajes.ts`                    | ``return `/libros/${String(id)}`;`` → `return '/libros/1';`                                       | 5 tests en dos suites                                                                                                                    |

Los dos rojos de **M22**, re-ejecutados contra el árbol vigente:
`el control de venta de la fila del listado (AC-17) > accionarlo lleva al detalle de ese libro y no modifica el stock ni escribe nada`
y `los módulos que proveen la acción de un formulario declaran la directiva > cada sitio es un identificador o un literal, nunca una expresión sin revisar`.
El segundo es el que avisa de que la acción del formulario nuevo es una expresión que nadie revisó.

### M25 — la otra mitad de M4

No estaba en el barrido reconstruido y se agregó porque su guardia existía sin ejecución registrada.

| #   | Archivo            | Mutación                                                                                                                      | Se pone rojo                                                                                                                           |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| M25 | `lib/db/ventas.ts` | subir `const fila = db.prepare(SQL_LIBRO_A_VENDER).get(id)` a **antes** de `db.transaction(` — vuelve el check-then-act de R5 | `forma de las transacciones de lib/db (M4, R5) > lib/db/ventas.ts no toca la base antes de abrir la transacción (M4, R5)` — y nada más |

---

## B. Los seis puntos que agregó la última ronda del bloque 4

Los seis estaban **abiertos** —la mutación dejaba la suite entera en verde— y quedaron cerrados.

### N01 — el último ejemplar

- **Archivo:** `lib/db/ventas.ts`
- **Mutación:** `if (fila.stock < EJEMPLARES_POR_VENTA)` → `if (fila.stock <= EJEMPLARES_POR_VENTA)`
- **Antes:** 288/288 en verde. El último ejemplar quedaba invendible, el stock nunca llegaba a 0 y
  la pantalla de sin-stock dejaba de ser alcanzable por el camino real. Se escapó cinco rondas porque
  los dos tests que siembran `stock: '1'` sólo **renderizan** el detalle: ninguno vendía.
- **Ahora se pone rojo:**
  `ventaDeLibro() > vende el último ejemplar y recién ahí el detalle pasa a sin-stock (AC-02 contra AC-03)`,
  en `expect(stockDe(libro.id)).toBe(0)`.
- Es el borde donde AC-02 toca AC-03, y en una librería es el caso más común.

### N02 — M8 sobre todo texto de `app/mensajes.ts`

- **Archivo:** `app/mensajes.ts` (cualquier `export const` de texto nuevo)
- **Mutación:** agregar
  `export const MENSAJE_STOCK_AGOTADO = 'SQLITE_CONSTRAINT: fallo al escribir historial_stock en /var/data/puentes.db';`
- **Antes:** 289/289 en verde. La lista de textos se derivaba de los exports pero **filtraba por el
  nombre** (`/VENTA|VENDER/`), así que un texto de la venta con otro nombre no lo miraba ninguna de
  las cuatro reglas de M8.
- **Ahora se pone rojo:**
  `ventaDeLibro() > ningún texto de la interfaz nombra el motor, una tabla ni una ruta del disco (M8)`.
- **Mutación hermana, también cerrada:** volver a poner el filtro por nombre en
  `TEXTOS_DE_LA_INTERFAZ` → rojo en
  `ventaDeLibro() > encuentra todos los textos de la interfaz, y no los de un solo módulo`, que
  nombra tres textos ajenos a la venta justamente para eso. El punto G04 amplía esa misma
  meta-guardia al resto de `app/`.

### N03 — la guardia de `'use server'` contaba JSX y hook en el mismo balde

- **Archivo:** `app/componentes/formulario-alta.tsx` (un archivo que **además** usa `useActionState`)
- **Mutación:** agregar un segundo formulario con acción inline, envuelto en un fragmento para que el
  JSX compile:
  ```tsx
  <form
    action={async (datos: FormData) => {
      await altaDeLibro(null, datos);
    }}
    className="alta-rapida"
  >
    <button type="submit">Alta rápida</button>
  </form>
  ```
- **Antes:** 289/289 en verde y `npx tsc --noEmit` limpio. La cuenta mezclaba los dos orígenes y
  comparaba con `>=`, así que el sitio del hook tapaba la falta: `2 >= 2`. En un archivo **sin** hook
  sí daba rojo, que es lo que hacía creer que estaba cerrado.
- **Ahora se pone rojo:**
  `los módulos que proveen la acción de un formulario declaran la directiva > no se le escapa ningún atributo action del JSX`,
  con `app/componentes/formulario-alta.tsx: hay 2 atributos action={…} y el reconocedor capturó 1`.
- Importa ahora: el bloque 5 estrena `app/componentes/formulario-edicion.tsx`, que es un formulario
  **con** `useActionState` — o sea que nacía exactamente en el punto ciego.

### N04-N06 — el barrido de `lib/db/`: registro obligatorio, dígitos y alias del rowid

El barrido prometía que «un módulo nuevo que se olvide de llamar a su guardia queda igual cubierto
contra la peor de las mutaciones». Era falso. La promesa se achicó a lo que de verdad hace, y en su
lugar el **registro pasó a ser obligatorio**: enumerar formas de nombrar una tabla en SQLite no tiene
fondo; exigir que todo módulo de `lib/db/` que declare SQL esté registrado en una guardia es una
propiedad finita y cerrada.

| #   | Mutación                                                                                                                                                          | Antes                                                                                                                                          | Ahora se pone rojo                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| N04 | módulo nuevo `lib/db/limpieza.ts`, con `import 'server-only'` y `db.prepare('UPDATE libros SET stock = 0 WHERE id = ?')` — sin constante y sin guardia registrada | 289/289 verde                                                                                                                                  | `todo módulo de lib/db que declara SQL tiene su guardia registrada (M9) > ninguno se quedó sin registrar`                                 |
| N05 | módulo nuevo `lib/db/reparacion.ts` con `const SQL_9_TOCAR = \`UPDATE libros … WHERE id >= 1\`` — **dígitos en el nombre**                                        | 289/289 verde: `SQL_[A-Z_]+` no lo veía, y como los dos extractores usaban el mismo patrón ciego, la meta-guardia del extractor daba `0 === 0` | el mismo, **y** `ninguna sentencia de lib/db elige un libro por rango (AC-02, M5) > ninguna compara el identificador del libro por rango` |
| N06 | `lib/db/libros.ts` — agregar `const SQL_TOCAR_POR_ROWID = \`UPDATE libros SET stock = ? WHERE rowid >= ?\`` y ejecutarlo dentro de la transacción del alta        | 288/288 verde                                                                                                                                  | `ninguna sentencia de lib/db elige un libro por rango (AC-02, M5) > ninguna compara el identificador del libro por rango`                 |

Notas de los tres:

- **N05, el patrón con dígitos.** `SQL_001_INICIAL` y `SQL_002_VENTAS` existen hoy en
  `lib/db/migraciones/` y eran invisibles para el barrido. Sin el arreglo, la lista derivada de
  «módulos que declaran SQL» nacía incompleta y el registro obligatorio **no alcanzaba nunca a las
  migraciones**. Comprobado: revertir sólo `NOMBRE_DE_SENTENCIA` a `SQL_[A-Z_]+` deja rojo
  `todo módulo de lib/db que declara SQL tiene su guardia registrada (M9) > encuentra los registradores y los módulos que declaran SQL`
  y las guardias de las dos migraciones de DDL, que pasan a no tener ninguna sentencia que mirar. El
  punto G05 cerró la otra mitad del mismo dígito, la que quedaba en `test/db/consultas.test.ts`.
- **N06, los alias del rowid.** `rowid`, `_rowid_` y `oid` son un conjunto **cerrado de tres** —no una
  familia abierta— y sin ellos `WHERE rowid >= ?` se colaba **incluso en un módulo registrado**:
  `filtraPorClavePrimaria()` lo hubiera cazado, pero sólo alcanza a los módulos que registran
  `guardiaDeSentenciasSobreUnLibro()`, y el barrido universal —el que alcanza a todos— sólo mira
  `comparaElIdPorRango()`.
- **El elenco registrado hoy:** `lib/db/ventas.ts` (desde su propia suite, con los dos
  registradores), y desde `test/convenciones/sql.test.ts` `consultas.ts`, `libros.ts`,
  `migraciones/003-identidad.ts` en `guardiaDeConvencionesDeSql()`, más `migraciones/001-inicial.ts`
  y `migraciones/002-ventas.ts` en `guardiaDeSqlSinPreparar()`. Las dos listas —módulos y registros—
  se derivan; ninguna se escribe a mano.

---

## C. Los dos puntos del bloque 4 que faltaban en el contrato

Los dos tests existen y son falsables desde el bloque 4; lo que faltaba era el punto que dijera con
qué mutación se los comprueba. Verificados contra el árbol de la ronda de entrada del bloque 5.

### N07 — la transacción entera, no sólo su modo (AC-11)

- **Archivo:** `lib/db/ventas.ts`
- **Mutación:** sacar la transacción completa —`db.transaction((): ResultadoVender => { … })` →
  `((): ResultadoVender => { … })`, y `venta.immediate()` → `venta`—, dejando las tres escrituras
  sueltas. Es distinta de M08 (que sólo cambia el modo del `BEGIN`) y de M25 (que sólo saca la
  lectura de adentro): acá no hay atomicidad ninguna.
- **Se pone rojo:**
  `venderEjemplar() > si falla la escritura de la fila de ventas no persiste el descuento ni el historial (AC-11, NFR-01)`,
  en la aserción del stock (`expected 6 to be 7`: el descuento quedó escrito con la venta fallada), y
  `forma de las transacciones de lib/db (M4, R5) > encuentra los módulos que abren transacción, y son más de uno`.
- **Por qué es el punto que faltaba:** las dos mitades de M4 son guardias **de fuente** y no las cazan
  los tests de negocio; ésta sí lo es, y es la que sostiene AC-11. Sin el punto, el contrato dejaba
  creer que la atomicidad de la venta se apoyaba sólo en una guardia sintáctica.

### N08 — el precio no viaja del formulario a la venta (M2)

- **Archivos:** `app/acciones-libro.ts` y `lib/db/ventas.ts`
- **Mutación:** que el precio del `POST` llegue hasta la fila de `ventas` — un tercer parámetro en
  `venderEjemplar()`, `precioDelFormulario ?? fila.precio` en la inserción, y un
  `<input type="hidden" name="precio" …>` en el detalle.
- **Se pone rojo:** 6 tests, y el que lo nombra es
  `ventaDeLibro() > registra el precio vigente de la base aunque el formulario mande otro (M2, R3)`,
  en `expect(registradas[0]).toMatchObject({ precio_venta: libro.precio })`. Del lado del
  repositorio lo fijan
  `venderEjemplar() > registra el precio vigente en la base y no el que tenía al darse de alta (M2, R3)`
  y `venderEjemplar() > no admite ningún precio por parámetro: el único dato que recibe es el id (M2, R3)`.
- **La mitad que está ABIERTA, y conviene saberlo:** agregar **sólo** el campo oculto
  `<input type="hidden" name="precio" value={String(libro.precio)} />` al formulario del detalle deja
  la suite entera en verde (medido: 329/329). Lo que cierra M2 no es que el marcado no lleve el
  campo, sino que la acción lea **un solo campo** y la venta lea el precio de la base dentro de su
  transacción. El bloque 5 estrena un formulario con cuatro campos: la propiedad que hay que
  sostener ahí es la misma, y no la va a sostener el marcado.

---

## D. Los cinco huecos que cerró la ronda de entrada del bloque 5

Los cinco estaban **abiertos** contra el árbol del bloque 4 recién commiteado: la mutación dejaba la
suite entera en verde. Los cinco eran de las guardias, no del código de producción, y por eso se
cerraron antes de escribir la primera línea del bloque 5: son los que deciden si `lib/db/edicion.ts`
nace vigilado.

### G01 — un registrador que no miraba M9

- **Mutación:** módulo nuevo `lib/db/ajuste.ts`, con `import 'server-only'`,
  `const SQL_AJUSTAR = \`UPDATE libros SET ${COLUMNA} = ? WHERE id = ?\``—interpolación pura, que es
exactamente lo que M9 prohíbe— y una segunda sentencia sobre`libros`, registrado **sólo** con
`guardiaDeSentenciasSobreUnLibro()`.
- **Antes:** 321/321 en verde. El registro obligatorio quedaba satisfecho y las cuatro reglas de M9
  no lo miraban: ese registrador exigía la clave primaria y nada más.
- **Ahora se pone rojo:**
  `las sentencias de lib/db/ajuste.ts eligen la fila por su clave primaria (AC-02, M5) > no interpola ni concatena nada dentro de una sentencia SQL`.
- **Y la guardia que lo impide de raíz:**
  `los registradores de guardias de SQL (M9) > cada registrador somete a su módulo a las cuatro reglas de M9`,
  que mira la definición de cada registrador exportado. Un registrador nuevo no puede nacer sin M9.

### G02 — el registro obligatorio se evadía comentando la línea

- **Mutación:** comentar `guardiaDeConvencionesDeSql({ relativo: 'lib/db/libros.ts' });` en
  `test/convenciones/sql.test.ts`.
- **Antes:** 313/313 en verde. Cinco aserciones perdidas sin un solo rojo: la lista de registros se
  derivaba del fuente **crudo** de cada suite, así que una llamada comentada contaba como registro.
- **Ahora se pone rojo:**
  `todo módulo de lib/db que declara SQL tiene su guardia registrada (M9) > ninguno se quedó sin registrar`,
  con `['lib/db/libros.ts']`.
- **Cómo:** las llamadas se buscan sobre el fuente **despejado** —el mismo `despejar()` que usa la
  guardia de M4, que ahora vive en `test/ayudas/convenciones-sql.ts`— y se leen sobre el crudo, que
  es donde el `relativo:` todavía tiene su literal. Lo fija
  `todo módulo de lib/db que declara SQL tiene su guardia registrada (M9) > no cuenta como registro una llamada comentada`.
- **Efecto lateral que hubo que arreglar:** el despeje no reconocía los literales de expresión
  regular, y `const LITERAL = /'([^']*)'/gu` —una comilla dentro de una regex— abría una cadena falsa
  y blanqueaba el resto del archivo. Sobre módulos de `lib/db/` no pasaba; sobre el fuente de una
  suite, sí.

### G03 — el `db.exec()` que ninguna guardia miraba

- **Mutación:** módulo nuevo `lib/db/purga.ts`, con `import 'server-only'` y
  `obtenerDb().exec("UPDATE libros SET stock = 0 WHERE id >= 1")`. Sin constante y sin `prepare`.
- **Antes:** 319/319 en verde. No entraba en el universo de «módulos que declaran SQL», así que el
  registro obligatorio no lo reclamaba, y el barrido universal sólo mira sentencias declaradas como
  constante.
- **Ahora se pone rojo:**
  `todo módulo de lib/db que declara SQL tiene su guardia registrada (M9) > ninguno se quedó sin registrar`,
  con `['lib/db/purga.ts']`.
- **Sin arrastrar el desvío D04:** el reconocedor pide una palabra clave de DML dentro de un literal,
  así que el `PRAGMA` y el control de transacción de `lib/db/migrar.ts` siguen afuera. Lo fijan
  `el reconocedor de los módulos que declaran SQL (M9) > ve el módulo que ejecuta DML con db.exec(), sin constante y sin prepare`
  y `el reconocedor de los módulos que declaran SQL (M9) > deja al runner de migraciones fuera del universo, como declara el desvío D04`.

### G04 — el universo de M8 era un solo archivo

- **Mutación:** `app/mensajes-edicion.ts` con
  `export const MENSAJE_ERROR_DE_EDICION = 'SQLITE_CONSTRAINT: fallo al escribir historial_stock en /var/data/puentes.db';`,
  renderizado en el detalle.
- **Antes:** 318/318 en verde. El universo se derivaba de `import * as mensajes from '@/app/mensajes'`:
  de **un módulo**, no de la interfaz.
- **Ahora se pone rojo:**
  `ventaDeLibro() > ningún texto de la interfaz nombra el motor, una tabla ni una ruta del disco (M8)`,
  con `app/mensajes-edicion.ts → MENSAJE_ERROR_DE_EDICION`.
- **Por qué era el de mayor consecuencia:** `app/mensajes.ts` tiene 291 líneas, veinte exports y
  cuatro responsabilidades declaradas en su propio encabezado, y partirlo está sobre la mesa. Si se
  partía antes de esto, media M8 se apagaba sin un solo rojo. La meta-guardia que lo sostiene es
  `ventaDeLibro() > encuentra todos los textos de la interfaz, y no los de un solo módulo`, que exige
  que los módulos recorridos sean varios y nombra tres de ellos.

### G05 — el consumidor huérfano del patrón con dígitos

- **Mutación:** en `lib/db/consultas.ts`,
  `const SQL_2_ORDENAR = \`UPDATE libros SET estado = estado WHERE id = ?\``, ejecutado por
sustitución de texto (`db.exec(SQL_2_ORDENAR.replace('?', String(id)))`) dentro de la lectura por
id. Es un `UPDATE`a`libros` desde el módulo de **lectura**, y sin filtro de estado.
- **Antes:** 318/318 en verde. `test/db/consultas.test.ts` se había quedado con su propio extractor
  `SQL_[A-Z_]+` en tres lugares, y como el extractor y su meta-guardia usaban el **mismo** patrón
  ciego, la meta-guardia comparaba `0 === 0` y no avisaba.
- **Contraprueba:** la misma sentencia con el nombre sin dígito (`SQL_DOS_ORDENAR`) se ponía roja en
  `convenciones de lib/db/consultas.ts > filtra estado activo en todas sus sentencias, sin excepción`.
  El único motivo de la ceguera era el dígito.
- **Ahora se pone rojo:** ese mismo test. `consultas.test.ts` consume `declaracionesSql()` y
  `declaracionesEsperadas()` del helper compartido, y el reconocedor del `prepare` es uno solo
  (`PREPARA_SIN_CONSTANTE`), fijado por
  `el reconocedor del prepare que no recibe una constante declarada (M9) > ve el nombre con dígitos, que es el que se le escapaba`.

### Dos arreglos de la misma ronda que no son puntos de barrido

- **El extractor del formulario de la venta** tomaba el primer `<form>` del HTML. Con un segundo
  formulario en el detalle —lo que trae el bloque 5— las ocho aserciones de la confirmación pasaban a
  medir el formulario equivocado y el rojo hablaba de la venta. Ahora se elige por
  `data-venta="confirmar"` y falla cerrado con cero o con dos. Lo fija
  `ventaDeLibro() > el extractor toma el formulario de la venta y falla cerrado, no el primero del marcado`.
- **La siembra de un solo libro** dejó de exportarse desde `test/ayudas/catalogo-de-prueba.ts`: es el
  molde que produjo nueve puntos ciegos en cuatro rondas y el bloque 5 era quien iba a estrenarla.
  Lo que sale del fixture es `sembrarDosLibros()`, con sus aserciones de identidad adentro, y
  `PRIMER_ID`, que estaba escrito dos veces —comprobado: cambiarle el valor a la copia de
  `test/db/ventas.test.ts` dejaba los 329 tests en verde—.

---

## E. Desvíos declarados — puntos **abiertos**, con su mutación y su evidencia

Quedaron deliberadamente fuera del alcance. Están acá porque un punto abierto y escrito es
información; uno omitido es el defecto que este ticket viene persiguiendo. **La decisión de
perseguirlos o no es de VERIFY.**

### D01 — calificador de esquema citado con comillas dobles · **ABIERTO**

- **Mutación:** en `lib/db/libros.ts`, agregar y ejecutar dentro de la transacción del alta:
  ```ts
  const SQL_ESQUEMA_CITADO = `
    UPDATE "main"."libros"
       SET stock = ?
     WHERE id >= ?
  `;
  ```
- **Evidencia:** **318/318 en verde.** `tocaLaTablaLibros()` reconoce `main.libros` y `"libros"`,
  pero no el calificador citado `"main"."libros"`, así que la sentencia sale del universo de las dos
  guardias que hablan de la tabla y el `id >= ?` no lo mira nadie.

### D02 — calificador de esquema con corchetes · **ABIERTO**

- **Mutación:** la misma, con `UPDATE [main].[libros]`.
- **Evidencia:** **318/318 en verde**, por el mismo motivo.

### D03 — calificador de esquema con acentos graves · **cerrado por accidente**

- **Mutación:** la misma, con ``UPDATE `main`.`libros` ``.
- **Evidencia:** no es escribible dentro del template literal que M9 exige —el acento grave cierra el
  literal— y en su forma escapada se pone rojo
  `convenciones de lib/db/libros.ts (M9) > declara cada sentencia como un único template literal, sin concatenar (M9)`,
  con `sigue algo después del literal`.
- **Por qué igual figura como desvío:** lo caza una guardia que habla de **concatenación**, no del
  nombre de la tabla, y sólo en módulos registrados. Es una coincidencia afortunada, no una
  propiedad; si algún día esa guardia cambia de forma, D03 vuelve a estar abierto sin que nada avise.

### D04 — `lib/db/migrar.ts` interpola dentro de una sentencia · **ABIERTO, conocido y documentado en el código**

- **Dónde:** ``db.exec(`PRAGMA user_version = ${versionNueva}`)``.
- **Por qué queda afuera:** el módulo no declara ninguna constante `SQL_…`, no llama a `.prepare(` y
  su `db.exec()` no ejecuta DML, así que no entra en el universo de `declaraSql()` y ninguna guardia
  de M9 lo alcanza. Es código de FEAT-001a, el valor interpolado es un número calculado adentro, y el
  propio código documenta que `PRAGMA` no admite parámetros. **No es un hallazgo nuevo: es alcance
  que este archivo declara**, y ahora además lo fija un test que lo nombra.

### D05 — el precio en el marcado del formulario · **ABIERTO**

- **Mutación:** agregar `<input type="hidden" name="precio" value={String(libro.precio)} />` al
  formulario de venta del detalle, sin tocar nada más.
- **Evidencia:** **329/329 en verde.** Ninguna aserción prohíbe campos de más en el formulario: lo
  que sostiene M2 es que la acción lee un solo campo y que la venta lee el precio de la base. Está
  escrito en N08 y se repite acá porque es el desvío que el bloque 5 hereda con su formulario de
  cuatro campos.

---

## F. Lo que este barrido no cubre

- **Lo que necesita dos escritores concurrentes.** M08 y M25 son las dos mitades de M4 y las cazan
  guardias **de fuente**, no tests de negocio: en un solo proceso, sacar la lectura de la transacción
  o borrar `.immediate()` deja toda la suite en verde. Cualquier operación nueva que escriba la base
  hereda esa condición. Sacar la transacción **entera** sí lo caza un test de negocio (N07).
- **Lo que sólo se ve en producción.** M13 (`'use server'`) no tiene consecuencia observable en los
  tests: ahí la acción es una función común. Su única evidencia es la guardia de convención.
- **Los recorridos duplicados, que son cuatro y no uno.** `modulosDeDb()` vive en
  `test/ayudas/convenciones-sql.ts` y de ahí lo toman `test/convenciones/sql.test.ts` y
  `test/db/ventas.test.ts`; conservan su **propia copia** del recorrido recursivo de `lib/db/`
  `test/db/migrar.test.ts` y `test/app/detalle.test.ts`. Y `archivosDeApp()` —el recorrido de `app/`—
  está escrito dos veces: en `test/convenciones/acciones-de-servidor.test.ts` y en
  `test/app/detalle.test.ts`. Son de FEAT-001a y ninguna ronda de este ticket las tocó: cada copia es
  un lugar donde una de ellas deja de ver un directorio.
- **Los archivos que este barrido nombra.** La guardia comprueba los **tests** citados, no las rutas:
  varios puntos nombran módulos que sólo existen dentro de su mutación (`lib/db/ajuste.ts`,
  `lib/db/purga.ts`, `lib/db/limpieza.ts`, `lib/db/reparacion.ts`, `app/mensajes-edicion.ts`), así que
  exigir que toda ruta citada exista pondría rojo el archivo por decir la verdad.
