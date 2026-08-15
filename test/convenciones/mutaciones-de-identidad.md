# Barrido de mutaciones del bloque 4 (venta)

Cada punto de este archivo es un **cambio de una línea sobre el código de producción** y el test que
se pone rojo cuando ese cambio existe. Sirve para lo que un test verde no puede decir por sí solo:
si la suite se pone roja **por el motivo correcto**.

## Por qué vive acá y no en un reporte

El barrido nació en una revisión y quedó escrito sólo en el reporte de un agente. Un contrato que no
está en el árbol no obliga a nadie: la revisión siguiente no lo puede leer, no lo puede correr y no
se entera de que un punto se perdió. Está junto a las guardias que lo sostienen —y no en
`docs/daw/specs/`— porque describe el comportamiento de estos tests, no el alcance de un ticket.

**Sobre la numeración.** `M01`–`M24` es la numeración _de este archivo_. El barrido original vivía
fuera del árbol, así que los puntos se re-derivaron del código y se **re-ejecutaron uno por uno**
contra el árbol actual. Si aquel barrido tenía un punto que acá no quedó representado, no hay forma
de saberlo desde el repositorio: es exactamente el costo que este archivo existe para no volver a
pagar.

## Cómo se verificó cada punto

1. Copia fresca del repositorio **fuera del árbol real**, una por mutación (nunca mutar y restaurar
   sobre la misma copia: la caché de transformación de Vite hace inestables los resultados).
2. Se aplica la mutación.
3. `npx vitest run` **completo**, y se registran **todos** los tests que fallan.

Un punto está **cerrado** si al menos un test se pone rojo. Está **abierto** si la suite entera
queda en verde: eso no es una omisión, es información, y por eso se escribe con su mutación.

Los números de línea son los del árbol al momento de escribir este archivo (bloque 4 terminado,
bloque 5 sin empezar). Si no coinciden, el ancla de texto de cada punto sigue siendo lo que manda.

---

## A. El barrido del bloque 4 — 24 puntos, los 24 cerrados

### La operación: `lib/db/ventas.ts`

| #   | Línea | Mutación                                                                                                                            | Se pone rojo                                                                                                                                              |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | 116   | `if (fila.stock < EJEMPLARES_POR_VENTA)` → `if (fila.stock < 0)` — vende sin ejemplares                                             | `venderEjemplar() > con stock 0 rechaza con motivo tipado y no escribe nada (AC-03)` y su espejo en `app/`                                                |
| M02 | 120   | `fila.stock - EJEMPLARES_POR_VENTA` → `fila.stock` — no descuenta                                                                   | 5 tests, entre ellos `descuenta 1 ejemplar y registra la venta y el historial de stock (AC-02, FR-07, FR-08)`                                             |
| M03 | 124   | `SQL_DESCONTAR_STOCK).run(stockResultante, id)` → `run(stockResultante, 1)` — descuenta del libro 1                                 | 5 tests; el que lo distingue es el que siembra **dos** libros                                                                                             |
| M04 | 127   | `SQL_INSERTAR_STOCK).run(id, …)` → `run(1, …)` — entrada de historial con el `libro_id` equivocado                                  | 3 tests. Es la peor de todas: el Principio III prohíbe editar o borrar una entrada de historial                                                           |
| M05 | 127   | `run(id, ahora, fila.stock, stockResultante, …)` → `run(id, ahora, stockResultante, fila.stock, …)` — cantidades invertidas         | 3 tests                                                                                                                                                   |
| M06 | 130   | `SQL_INSERTAR_VENTA).run(id, …)` → `run(1, …)` — venta a nombre de otro libro                                                       | 4 tests                                                                                                                                                   |
| M07 | 130   | `run(id, ahora, fila.precio)` → `run(id, new Date(0).toISOString(), fila.precio)` — la venta y su historial con instantes distintos | 3 tests; la aserción que lo caza es `fecha: registradas[0].fecha`                                                                                         |
| M08 | 143   | `return venta.immediate();` → `return venta();` — `BEGIN` diferido (M4)                                                             | `forma de las transacciones de lib/db (M4, R5) > lib/db/ventas.ts abre la transacción en modo immediate` — **y nada más**: ningún test de negocio lo nota |
| M09 | 43    | `AND id = ?` → `AND id >= ?` en `SQL_LIBRO_A_VENDER` (M5)                                                                           | 3 tests, uno de ellos `sobre un libro archivado responde igual que sobre uno inexistente`                                                                 |
| M10 | 42‑43 | quitar `WHERE estado = 'activo'` del `SELECT` de control                                                                            | sólo `sobre un libro archivado responde igual que sobre uno inexistente`                                                                                  |
| M11 | 1     | quitar `import 'server-only';`                                                                                                      | `convenciones de lib/db/ventas.ts (M9) > marca server-only antes que ningún otro import`                                                                  |
| M12 | 18    | `ORIGEN_VENTA = 'venta'` → `'edición manual'`                                                                                       | 3 tests                                                                                                                                                   |

### La Server Action: `app/acciones-libro.ts`

| #   | Línea | Mutación                                                                                 | Se pone rojo                                                                                                                                                                             |
| --- | ----- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M13 | 1     | quitar `'use server';`                                                                   | `los módulos que proveen la acción de un formulario declaran la directiva > todos declaran la directiva de Server Actions` — **y nada más**: en los tests la acción es una función común |
| M14 | 101   | borrar el `redirect(rutaDelDetalle(id));` final — el `POST` queda reenviable (M3)        | 5 tests                                                                                                                                                                                  |
| M15 | 98‑99 | dejar sólo `revalidatePath('/')`                                                         | `revalida la ruta del catálogo y la del detalle de ese libro, no una sola`                                                                                                               |
| M16 | 101   | `redirect(rutaDelDetalle(id))` → `redirect(rutaDelDetalle(1))`                           | `tras la venta redirige al detalle de ese libro, así que el reenvío no la repite (M3, R4)`                                                                                               |
| M17 | 44    | `identificadorDeLibro(datos.get('id'))` → `Number(datos.get('id'))` (M1)                 | `responde 404 sin llegar al repositorio ante un id que no es un entero positivo (M1, R1)`                                                                                                |
| M18 | 65    | `console.error(…, error)` → `console.error(…, error, datos)` — el `POST` copiado al log  | `ante un fallo de infraestructura no expone el motor y registra sin el formulario (M8)`                                                                                                  |
| M19 | 67    | `throw new Error(MENSAJE_ERROR_DE_VENTA)` → `throw error` — el texto del motor sube (M8) | el mismo test que M18                                                                                                                                                                    |

### Las pantallas

| #   | Archivo:línea                           | Mutación                                                                                          | Se pone rojo                                                                                                                           |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| M20 | `app/libros/[id]/page.tsx:103`          | `<form action={ventaDeLibro}>` → `<form action="/">` — el botón navega en vez de vender           | `el control de confirmación ejecuta la venta y le pasa el id del libro (AC-02, M3)` y 3 de la guardia de `'use server'`                |
| M21 | `app/libros/[id]/page.tsx:104`          | `value={String(libro.id)}` → `value="1"` — el detalle postea siempre el libro 1                   | el mismo test de confirmación. Falsable **sólo** porque la siembra da dos libros                                                       |
| M22 | `app/componentes/listado-libros.tsx:99` | el `<a href={rutaDelDetalle(libro.id)}>` de la celda de venta → un `<form method="post">` (AC‑17) | `el control de venta de la fila del listado (AC-17) > accionarlo lleva al detalle de ese libro y no modifica el stock ni escribe nada` |
| M23 | `app/mensajes.ts:144`                   | `SOLO_DIGITOS = /^\d+$/u` → `/^\s*\d+$/u` — entra `' 1'` (M1)                                     | el 404 de la acción **y** el de la ruta del detalle: una sola implementación, dos superficies                                          |
| M24 | `app/mensajes.ts:136`                   | ``return `/libros/${String(id)}`;`` → `return '/libros/1';`                                       | 5 tests en dos suites                                                                                                                  |

### M25 — la otra mitad de M4

No estaba en el barrido reconstruido y se agrega acá porque su guardia existía sin ejecución
registrada.

| #   | Línea                      | Mutación                                                                                                                      | Se pone rojo                                                                                                                      |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| M25 | `lib/db/ventas.ts:106‑108` | subir `const fila = db.prepare(SQL_LIBRO_A_VENDER).get(id)` a **antes** de `db.transaction(` — vuelve el check‑then‑act de R5 | `forma de las transacciones de lib/db (M4, R5) > lib/db/ventas.ts no toca la base antes de abrir la transacción` — **y nada más** |

---

## B. Los cuatro puntos que agrega esta ronda

Los cuatro estaban **abiertos** —la mutación dejaba la suite entera en verde— y quedan cerrados.

### N01 — el último ejemplar

- **Archivo:** `lib/db/ventas.ts:116`
- **Mutación:** `if (fila.stock < EJEMPLARES_POR_VENTA)` → `if (fila.stock <= EJEMPLARES_POR_VENTA)`
- **Antes:** 288/288 en verde. El último ejemplar quedaba invendible, el stock nunca llegaba a 0 y
  la pantalla de sin‑stock dejaba de ser alcanzable por el camino real. Se escapó cinco rondas
  porque los dos tests que siembran `stock: '1'` sólo **renderizan** el detalle: ninguno vendía.
- **Ahora se pone rojo:** `ventaDeLibro() > vende el último ejemplar y recién ahí el detalle pasa a
sin-stock (AC-02 contra AC-03)`, en `expect(stockDe(libro.id)).toBe(0)`.
- Es el borde donde AC‑02 toca AC‑03, y en una librería es el caso más común.

### N02 — M8 sobre todo texto de `app/mensajes.ts`

- **Archivo:** `app/mensajes.ts` (cualquier `export const` de texto nuevo)
- **Mutación:** agregar
  `export const MENSAJE_STOCK_AGOTADO = 'SQLITE_CONSTRAINT: fallo al escribir historial_stock en /var/data/puentes.db';`
- **Antes:** 289/289 en verde. La lista de textos se derivaba de los exports pero **filtraba por el
  nombre** (`/VENTA|VENDER/`), así que un texto de la venta con otro nombre no lo miraba ninguna de
  las cuatro reglas de M8.
- **Ahora se pone rojo:** `ningún texto de la interfaz nombra el motor, una tabla ni una ruta del
disco (M8)`.
- **Mutación hermana, también cerrada:** volver a poner el filtro por nombre en
  `TEXTOS_DE_LA_INTERFAZ` → rojo en `encuentra todos los textos que exporta app/mensajes.ts, no sólo
los de la venta`, que nombra tres textos ajenos a la venta justamente para eso.
- Efecto lateral buscado: los textos de la edición del bloque 5 nacen cubiertos.

### N03 — la guardia de `'use server'` contaba JSX y hook en el mismo balde

- **Archivo:** `app/componentes/formulario-alta.tsx:64` (un archivo que **además** usa
  `useActionState`)
- **Mutación:** agregar un segundo formulario con acción inline, envuelto en un fragmento para que
  el JSX compile:
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
  comparaba con `>=`, así que el sitio del hook tapaba la falta: `2 >= 2`. En un archivo **sin**
  hook sí daba rojo, que es lo que hacía creer que estaba cerrado.
- **Ahora se pone rojo:** `no se le escapa ningún atributo action del JSX`, con
  `app/componentes/formulario-alta.tsx: hay 2 atributos action={…} y el reconocedor capturó 1`.
- Importa ahora: el bloque 5 estrena `app/componentes/formulario-edicion.tsx`, que es un formulario
  **con** `useActionState` — o sea que nacía exactamente en el punto ciego.

### N04‑N06 — el barrido de `lib/db/`: registro obligatorio, dígitos y alias del rowid

El barrido prometía que «un módulo nuevo que se olvide de llamar a su guardia queda igual cubierto
contra la peor de las mutaciones». Era falso. La promesa se achicó a lo que de verdad hace, y en su
lugar el **registro pasó a ser obligatorio**: enumerar formas de nombrar una tabla en SQLite no
tiene fondo; exigir que todo módulo de `lib/db/` que declare SQL esté registrado en una guardia es
una propiedad finita y cerrada.

| #   | Mutación                                                                                                                                                          | Antes                                                                                                                                          | Ahora se pone rojo                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| N04 | módulo nuevo `lib/db/limpieza.ts`, con `import 'server-only'` y `db.prepare('UPDATE libros SET stock = 0 WHERE id = ?')` — sin constante y sin guardia registrada | 289/289 verde                                                                                                                                  | `todo módulo de lib/db que declara SQL tiene su guardia registrada (M9) > ninguno se quedó sin registrar` |
| N05 | módulo nuevo `lib/db/reparacion.ts` con `const SQL_9_TOCAR = \`UPDATE libros … WHERE id >= 1\`` — **dígitos en el nombre**                                        | 289/289 verde: `SQL_[A-Z_]+` no lo veía, y como los dos extractores usaban el mismo patrón ciego, la meta‑guardia del extractor daba `0 === 0` | `ninguno se quedó sin registrar` **y** `ninguna compara el identificador del libro por rango`             |
| N06 | `lib/db/libros.ts:94` — agregar `const SQL_TOCAR_POR_ROWID = \`UPDATE libros SET stock = ? WHERE rowid >= ?\`` y ejecutarlo dentro de la transacción del alta     | 288/288 verde                                                                                                                                  | `ninguna compara el identificador del libro por rango`                                                    |

Notas de los tres:

- **N05, el patrón con dígitos.** `SQL_001_INICIAL` y `SQL_002_VENTAS` existen hoy en
  `lib/db/migraciones/` y eran invisibles para el barrido. Sin el arreglo, la lista derivada de
  «módulos que declaran SQL» nacía incompleta y el registro obligatorio **no alcanzaba nunca a las
  migraciones**. Comprobado: revertir sólo `NOMBRE_DE_SENTENCIA` a `SQL_[A-Z_]+` deja rojo
  `encuentra los registradores y los módulos que declaran SQL` y las guardias de las dos migraciones
  de DDL, que pasan a no tener ninguna sentencia que mirar.
- **N06, los alias del rowid.** `rowid`, `_rowid_` y `oid` son un conjunto **cerrado de tres** —no
  una familia abierta— y sin ellos `WHERE rowid >= ?` se colaba **incluso en un módulo registrado**:
  `filtraPorClavePrimaria()` lo hubiera cazado, pero sólo alcanza a los módulos que registran
  `guardiaDeSentenciasSobreUnLibro()`, y el barrido universal —el que alcanza a todos— sólo mira
  `comparaElIdPorRango()`.
- **El elenco registrado hoy:** `lib/db/ventas.ts` (desde su propia suite), y desde
  `test/convenciones/sql.test.ts` `consultas.ts`, `libros.ts`, `migraciones/003-identidad.ts` en
  `guardiaDeConvencionesDeSql()`, más `migraciones/001-inicial.ts` y `migraciones/002-ventas.ts` en
  `guardiaDeSqlSinPreparar()`. Las dos listas —módulos y registros— se derivan; ninguna se escribe a
  mano.

---

## C. Desvíos declarados — puntos **abiertos**, con su mutación y su evidencia

Quedaron deliberadamente fuera del alcance de esta ronda. Están acá porque un punto abierto y
escrito es información; uno omitido es el defecto que este bloque viene persiguiendo. **La decisión
de perseguirlos o no es de VERIFY.**

### D01 — calificador de esquema citado con comillas dobles · **ABIERTO**

- **Mutación:** en `lib/db/libros.ts:94`, agregar y ejecutar dentro de la transacción del alta:
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
- **Evidencia:** no es escribible dentro del template literal que M9 exige —el acento grave cierra
  el literal— y en su forma escapada (`` \`main\`.\`libros\` ``) se pone rojo
  `convenciones de lib/db/libros.ts (M9) > declara cada sentencia como un único template literal,
sin concatenar (M9)`, con `sigue algo después del literal`.
- **Por qué igual figura como desvío:** lo caza una guardia que habla de **concatenación**, no del
  nombre de la tabla, y sólo en módulos registrados. Es una coincidencia afortunada, no una
  propiedad; si algún día esa guardia cambia de forma, D03 vuelve a estar abierto sin que nada avise.

### D04 — `lib/db/migrar.ts` interpola dentro de una sentencia · **ABIERTO, conocido y documentado en el código**

- **Dónde:** `lib/db/migrar.ts:61`, ``db.exec(`PRAGMA user_version = ${versionNueva}`)``.
- **Por qué queda afuera:** el módulo no declara ninguna constante `SQL_…` ni llama a `.prepare(`,
  así que no entra en el universo de `declaraSql()` y ninguna guardia de M9 lo alcanza. Es código de
  FEAT‑001a, el valor interpolado es un número calculado adentro, y la línea 55 documenta que
  `PRAGMA` no admite parámetros. **No es un hallazgo nuevo: es alcance que este archivo declara.**

---

## D. Lo que este barrido no cubre

- **Lo que necesita dos escritores concurrentes.** M08 y M25 son las dos mitades de M4 y las cazan
  guardias **de fuente**, no tests de negocio: en un solo proceso, sacar la lectura de la
  transacción o borrar `.immediate()` deja toda la suite en verde. Cualquier operación nueva que
  escriba la base hereda esa condición.
- **Lo que sólo se ve en producción.** M13 (`'use server'`) no tiene consecuencia observable en los
  tests: ahí la acción es una función común. Su única evidencia es la guardia de convención.
- **El tercer duplicado del recorrido de `lib/db/`.** `modulosDeDb()` vive en
  `test/ayudas/convenciones-sql.ts` y de ahí lo toman `test/convenciones/sql.test.ts` y
  `test/db/ventas.test.ts`; `test/db/migrar.test.ts:572` conserva su propia copia. Es de FEAT‑001a y
  esta ronda no la tocó.
