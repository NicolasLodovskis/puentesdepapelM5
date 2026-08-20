# Spec FEAT-001b: Venta y edición

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| PRD | `docs/daw/prd/prd-FEAT-001b.md` |
| Tier | FEATURE |
| Date | 2026-08-12 |
| Spec loops | 1 |
| Threat model | `docs/daw/security/threat-FEAT-001b.md` |

## Summary

Se agrega la vista de detalle por libro y, desde ahí, la venta y la edición, cada una en una
transacción `immediate` que escribe el libro y sus historiales de forma inseparable. Antes de eso se
cierra el agujero de identidad que dejó FEAT-001a: la derivación de las tres columnas calculadas sale
de `libros.ts` a un módulo propio de dominio, `normalizarTitulo()` deja de distinguir un título por su
puntuación final, y una migración recalcula la identidad de los libros ya cargados en una sola
transacción que revierte entera si dos libros pasan a colisionar. Las once mitigaciones del threat
model entran como requisitos de cada bloque, no como recomendaciones.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 3 |
| FR-02 | Block 3 (el enlace de la fila), Block 4 (la confirmación) |
| FR-03 | Block 5 |
| FR-04 | Block 5 |
| FR-05 | Block 5 |
| FR-06 | Block 5 |
| FR-07 | Block 2 (la tabla), Block 4 (la escritura) |
| FR-08 | Block 4 (origen `venta`), Block 5 (origen `edición manual`) |
| FR-09 | Block 5 |
| FR-10 | Block 1 |
| FR-11 | Block 2 |
| NFR-01 | Estrategia: toda operación que escribe el libro y sus historiales usa una única
`db.transaction(...).immediate()`, con la lectura del valor vigente **dentro** de la transacción
(M4). El recálculo de la 002 corre dentro de la transacción del runner de migraciones. Se verifica
forzando el fallo de la última escritura y comprobando que no persiste ninguna (AC-11). |
| NFR-02 | Estrategia: cada bloque lleva su lista de tests obligatorios, escritos antes de la
implementación (Principio I). El umbral de 80 % en líneas, ramas y funciones ya está configurado en
`vitest.config.ts` y lo verifica el test de cobertura de `test/app/acciones.test.ts`. Las ramas del
recálculo y de la colisión se cubren sembrando entre la 001 y la 002 (Block 2), sin lo cual quedarían
verdes sin haberse ejecutado nunca. |

## Dependencies between blocks

Estrictamente secuencial: **1 → 2 → 3 → 4 → 5**.

- **2 depende de 1**: la migración recalcula usando la función de derivación que crea el Block 1.
- **3 depende de 2**: la vista de detalle lee un libro cuya identidad ya fue recalculada, y la
  pantalla de colisión que introduce el Block 2 condiciona qué se renderiza en cualquier ruta.
- **4 y 5 dependen de 3**: la confirmación de venta y el formulario de edición viven en la vista de
  detalle.
- **5 depende de 1**: la edición de título recalcula las derivadas con el módulo del Block 1.

---

## Block 1 — Identidad de títulos y derivación compartida

**Files**
- `lib/dominio/derivar-libro.ts` (new) — única función que produce `titulo_normalizado`,
  `titulo_orden` y `editorial_normalizada` a partir de un título y una editorial. Función pura, sin
  E/S, sin `server-only` (no toca la base).
- `lib/dominio/normalizar-titulo.ts` (modified) — el recorte de puntuación final; reescritura del
  bloque de documentación `:38-56`, que hoy declara el límite como decisión de producto vigente.
- `lib/db/libros.ts` (modified) — `crearLibro()` deja de derivar en línea (`:322-325`) y llama a la
  función del módulo nuevo. Se reescribe el invariante de `:295-301` para que hable de la función y
  no del archivo.
- `test/dominio/derivar-libro.test.ts` (new)
- `test/dominio/normalizar-titulo.test.ts` (modified) — casos de AC-13, conservando los existentes.
- `docs/daw/specs/spec-FEAT-001a.md:257` (modified) — la nota que declara el límite como vigente.

**Logic**

`normalizarTitulo()` recorta del texto plegado todo lo que no sea letra ni dígito **al final**
(`[^\p{L}\p{N}]+$`, que se lleva puntuación **y** espacios) y recién entonces busca el artículo
pospuesto. El resto de los pasos no cambia: plegar → recortar el final → mover el artículo al frente
→ quitar la puntuación restante → colapsar espacios.

Dos prohibiciones explícitas, porque las dos son formas de "arreglarlo" que rompen otra cosa:

1. **No se saca el anclaje `$` de `ARTICULO_POSPUESTO`.** Sin el ancla, `'Casa, La de Bernarda'`
   pasaría a reordenarse y `test/dominio/normalizar-titulo.test.ts:71` se pone rojo.
2. **El recorte incluye espacios, no sólo puntuación.** `plegarTexto()` hace `trim()` pero no colapsa
   espacios internos, así que `"Principito, El ."` conserva el espacio antes del punto: un recorte de
   sólo puntuación cerraría el ejemplo del PRD y dejaría el de al lado igual de roto.

`derivarLibro(titulo, editorial)` devuelve las tres columnas calculadas. Es el **único** productor de
esas tres columnas en todo el proyecto: lo consumen el alta (Block 1), la migración (Block 2) y la
edición (Block 5).

**Input validation**
No aplica: recibe texto ya validado por el repositorio. Sobre cadena vacía devuelve cadena vacía para
`titulo_normalizado`, que es lo que el rechazo de `libros.ts:327` y el `CHECK` del esquema esperan.

**Error handling**
Ninguna de las dos funciones lanza. Una función pura que lanza obliga a envolverla en `try` y el
motivo del rechazo se pierde por el camino (criterio ya establecido en FEAT-001a).

**Required tests**
- [ ] `"Principito, El."` normaliza igual que `"El Principito"` — valida AC-13
- [ ] `'"Principito, El"'` (comillas de un pegado de Excel) normaliza igual que `"El Principito"` — valida AC-13
- [ ] `"Principito, El ."` (espacio antes del punto) normaliza igual que `"El Principito"` — valida AC-13
- [ ] Borde conservado: `'¿?'` sigue normalizando a `''` — sad path del que depende `libros.ts:327`
- [ ] Borde conservado: `', El'` sigue normalizando a `'el'`
- [ ] Regresión: `'Casa, La de Bernarda'` sigue normalizando a `'casa la de bernarda'` — detecta el arreglo por quita del ancla `$`
- [ ] Los 24 casos existentes de `normalizar-titulo.test.ts` siguen verdes sin modificación
- [ ] `derivarLibro()` produce las tres columnas y `crearLibro()` las obtiene de ahí

**Completion criterion**
Los tres casos de AC-13 pasan, la suite completa de FEAT-001a sigue verde sin que se haya editado una
sola aserción previa, y `grep` no encuentra ninguna otra producción de `titulo_normalizado` fuera de
`lib/dominio/derivar-libro.ts`.

---

## Block 2 — Migraciones 002 y 003: tabla de ventas y recálculo de identidad

**Files**
- `lib/db/migraciones/002-ventas.ts` (new) — el DDL de `ventas`.
- `lib/db/migraciones/003-identidad.ts` (new) — el paso de recálculo.
- `lib/db/migraciones/index.ts` (modified) — `Migracion` pasa a ser una unión discriminada; alta de
  la 002 y la 003 en `MIGRACIONES`.
- `lib/db/migrar.ts` (modified) — ejecuta el paso de lógica dentro de la misma transacción.
- `lib/db/conexion.ts` (modified) — cierra el handle si `migrar()` lanza (M10).
- `lib/db/errores.ts` (modified) — el tipo del error de colisión.
- `app/mensajes.ts` (modified) — el texto curado del aviso de colisión.
- `app/estado-del-catalogo.tsx` (new) — la pantalla que se renderiza cuando el catálogo no se migró.
- `test/db/migrar.test.ts` (modified) — `toHaveLength`, el `doMock` del contrato, la lista fija de
  módulos `server-only`, y los tests de esquema de `ventas`.
- `test/db/identidad.test.ts` (new) — la guardia de coherencia (M6) y los tests del recálculo.

**Data model**

```sql
CREATE TABLE ventas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  libro_id     INTEGER NOT NULL
                       REFERENCES libros (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  fecha        TEXT    NOT NULL,
  precio_venta INTEGER NOT NULL CHECK (precio_venta > 0)
) STRICT;

CREATE INDEX idx_ventas_libro ON ventas (libro_id, fecha);
```

`ON DELETE RESTRICT`, nunca `CASCADE`, por la misma razón que los dos historiales: el Principio III
prohíbe borrar historial y borrar libros físicamente. `precio_venta > 0` replica el `CHECK` de
`libros.precio`. `STRICT` como las tres tablas existentes. Sin columna de origen: toda fila de esta
tabla es una venta.

**Logic**

El contrato de migración pasa de `{numero, sql}` a una unión discriminada:

```ts
type Migracion =
  | { numero: number; sql: string }
  | { numero: number; aplicar: (db: Database.Database) => void };
```

Un campo opcional agregaría una rama condicional a `migrar.ts`, que ya es el módulo con peor
cobertura del proyecto; la unión hace imposible una migración con las dos mitades a medias. El
trabajo entra como **dos migraciones**: la 002 (`sql`, la tabla) y la 003 (`aplicar`, el recálculo),
en ese orden.

El recálculo, dentro de la transacción que ya abrió el runner:

1. Lee `id` y `titulo` de todos los libros.
2. Calcula la identidad nueva de cada uno con `derivarLibro()` — nunca reimplementando la
   normalización.
3. **Detecta duplicados en memoria, antes de escribir una sola fila.** Si hay dos o más libros con la
   misma identidad nueva → lanza el error de colisión, la transacción del runner revierte, y
   `user_version` no avanza.
4. Si no hay colisión, escribe en **dos pasadas**: primero un centinela único por fila, después el
   valor definitivo. Precalcular descarta la colisión del estado **final**, no la del **intermedio**:
   dos libros que intercambian identidad chocan contra el `UNIQUE` al escribir el primero. El `UNIQUE`
   es de columna y no un índice nombrado, así que no se puede soltar y recrear sin reconstruir la
   tabla.

Ante la colisión, la app **no abre** (decisión de la usuaria) pero **sí informa**: `obtenerDb()`
propaga un error tipado, y la superficie es una pantalla propia con un texto curado —no `error.tsx`,
que por la mitigación 8 de FEAT-001a muestra una constante genérica y desde un Server Action ni
siquiera se alcanza. El aviso **no enumera** los libros en conflicto (AC-16).

**Input validation**
No aplica: el recálculo no recibe entrada externa. Los títulos ya están en la base y pasaron la
validación del alta.

**Error handling**
- Colisión de identidad → error tipado propio → pantalla dedicada con texto curado. No expone
  títulos, ids, texto del motor ni rutas del disco (M7, M8).
- Cualquier otro fallo del recálculo → `ROLLBACK` y se relanza, como hace hoy el runner.
- `obtenerDb()` cierra el handle en el `catch` antes de relanzar (M10). Sin eso, "la app no arranca"
  es "la app falla y filtra un descriptor por navegación".

**Required tests**
- [ ] La 002 crea `ventas` con sus cuatro columnas, `STRICT`, la FK con `ON DELETE/UPDATE RESTRICT`
  y el `CHECK` de precio — mismo patrón que los tests de esquema de las tres tablas de la 001
- [ ] El recálculo actualiza `titulo_normalizado` de los libros sembrados — valida AC-15
- [ ] Después del recálculo, cada libro sigue siendo recuperable por su título en la búsqueda — valida AC-15
- [ ] Dos libros que pasan a compartir identidad → revierte todo, `user_version` no avanza, ningún
  libro ni entrada de historial modificados — valida AC-16
- [ ] El aviso de colisión no contiene ningún título ni id del catálogo — valida AC-16 y M7
- [ ] Dos libros que **intercambian** identidad se recalculan sin violar el `UNIQUE` — sad path del
  estado intermedio
- [ ] **Guardia de coherencia (M6):** sobre una base sembrada, para todo libro vale
  `titulo_normalizado === normalizarTitulo(titulo)`
- [ ] Un fallo cualquiera durante el recálculo —no una colisión— revierte la transacción y deja
  `user_version` sin avanzar — sad path del runner
- [ ] `obtenerDb()` cierra el handle cuando `migrar()` lanza — valida M10
- [ ] Los módulos nuevos de `lib/db/` están en la lista de `server-only` de `migrar.test.ts` (M9)

> **Cómo se ponen rojos estos tests.** `baseDePrueba()` migra una base `:memory:` vacía, así que el
> recálculo procesaría 0 filas y AC-15 y AC-16 quedarían verdes sin haberse ejecutado nunca. Los
> tests del recálculo aplican la 001, siembran, y recién entonces aplican la 002 y la 003, usando
> `vi.doMock('@/lib/db/migraciones')` con la lista recortada — el patrón que `migrar.test.ts:146-153`
> ya usa. No se cambia el contrato del runner para hacer testeable el recálculo.

**Completion criterion**
La suite pasa con las dos migraciones nuevas dadas de alta, el recálculo tiene test rojo previo sobre
base sembrada, y la guardia de coherencia falla si alguien cambia `normalizarTitulo()` sin su
migración.

---

## Block 3 — Lectura por id y vista de detalle

**Files**
- `lib/db/consultas.ts` (modified) — `SQL_LIBRO_POR_ID` y su función de lectura, reusando el
  `aLibro()` que el módulo ya tiene (no se agrega una tercera copia de la conversión de fila).
- `app/libros/[id]/page.tsx` (new) — la vista de detalle.
- `app/not-found.tsx` (new) — respuesta 404.
- `app/componentes/detalle-libro.tsx` (new) — la presentación de los datos del libro.
- `app/componentes/listado-libros.tsx` (modified) — celda nueva con el enlace al detalle.
- `app/globals.css` (modified) — estilos de la vista nueva.
- `test/db/consultas.test.ts` (modified) — la guardia acotada y los tests de la lectura por id.
- `test/app/detalle.test.ts` (new) — el renderizado del detalle y la validación del id.

**Logic**

La lectura por id vive en `consultas.ts`, que es el módulo de lectura. `SQL_LEER_LIBRO` de
`libros.ts` no sirve: es un helper privado de post-`INSERT` sin filtro de estado.

**La guardia de `consultas.ts` se acota sólo en el `ORDER BY`** (M5). Afirma tres cosas y sólo una
estorba:

| Regla | Alcance después de este bloque |
|---|---|
| `estado = 'activo'` | **Todas** las sentencias, sin excepción |
| Nunca `ORDER BY titulo_normalizado` | **Todas** |
| `ORDER BY titulo_orden` | Sólo las que **no** filtran por clave primaria |

El particionado es sintáctico y mecánico —la sentencia filtra por `id = ?` o no—, nunca una lista de
nombres exceptuados a mano, que sería un opt-out. Se agrega una meta-guardia que verifica que el
conjunto no exceptuado no quedó vacío.

El `[id]` de la ruta se valida antes de tocar la base (M1): sólo dígitos, parseado a entero seguro y
positivo; cualquier otra cosa responde 404 sin consultar. Un libro inexistente o archivado también da
404 — decisión escrita, porque PRD-001 RF-25 (consulta de archivados) va a chocar contra ella.

En el listado, el enlace al detalle va en **su propia celda**, no envolviendo el título. Envolverlo
obligaría a aflojar el extractor `celdas()` de los tests hasta admitir markup, y con él pasaría un
valor renderizado sin escapar donde hoy devuelve `''`. FR-01 pide "alcanzable desde su fila", no que
el título sea el enlace — y AC-17 necesita igual un control de venta distinguible del de ver.

El enlace es un `<a>`/`<Link>`: `listado-libros.tsx` **no puede ganar `'use client'`** (M11). Un
control con estado por fila serían 2.000 componentes cliente, y el bench mide el armado del HTML en
Node, así que no lo vería.

**Input validation**
- `[id]`: sólo dígitos, `Number.isSafeInteger`, > 0. Fuera de eso → 404 sin consulta.

**Error handling**
- Id inválido, inexistente o archivado → 404 con `not-found.tsx`. La respuesta es la misma en los tres
  casos: no se distingue "no existe" de "no es un id".
- Fallo de infraestructura → el límite de error existente.

**Required tests**
- [ ] El detalle muestra título, editorial, stock y precio del libro — valida AC-01
- [ ] El detalle ofrece las operaciones de FR-03 a FR-06 — valida AC-01
- [ ] La fila del listado enlaza al detalle de ese libro — valida FR-01
- [ ] Id no numérico (`abc`), negativo, cero y desbordado (`9e99`) → 404 sin consultar la base — valida M1
- [ ] Id inexistente → 404
- [ ] Libro archivado → 404, indistinguible de un libro inexistente — sad path del filtro de estado
- [ ] La consulta por id filtra `estado = 'activo'` — valida M5
- [ ] Guardia acotada: toda `SQL_*` de `consultas.ts` sigue exigiendo `estado = 'activo'`; el
  `ORDER BY titulo_orden` se exceptúa sólo para las que filtran por clave primaria — valida M5
- [ ] Meta-guardia: el conjunto de sentencias no exceptuadas no está vacío — valida M5
- [ ] `listado-libros.tsx` no contiene `'use client'` — valida M11
- [ ] Las guardias recursivas de `app/` alcanzan la ruta nueva — valida M9 y R12

**Completion criterion**
Se entra al detalle desde una fila, los cuatro datos se ven, los cuatro ids inválidos dan 404 sin
consulta, y las guardias de `consultas.ts` y de `app/` pasan sin haber sido aflojadas más de lo que
esta spec autoriza.

---

## Block 4 — Venta

**Files**
- `lib/db/ventas.ts` (new) — la operación de venta.
- `lib/db/errores.ts` (modified) — `ResultadoVender` y sus motivos.
- `lib/db/tipos.ts` (modified) — el tipo de la fila de venta.
- `app/acciones-libro.ts` (new) — Server Actions de venta y edición (`'use server'`).
- `app/mensajes.ts` (modified) — los textos de la venta.
- `app/libros/[id]/page.tsx` (modified) — la confirmación de venta.
- `app/componentes/listado-libros.tsx` (modified) — el control de venta de la fila.
- `test/db/ventas.test.ts` (new)
- `test/app/acciones-libro.test.ts` (new)

**Logic**

El control de la fila **lleva al detalle con la venta pendiente de confirmación**; no escribe nada
(AC-17). La confirmación, ya en el detalle, ejecuta la venta.

Dentro de una única `db.transaction(...).immediate()`:

1. Lee la fila vigente del libro **dentro de la transacción** (M4).
2. Si el stock es 0 → devuelve el rechazo. No escribe nada (AC-03).
3. Descuenta 1 del stock.
4. Escribe la entrada de `historial_stock` con `cantidad_anterior` S, `cantidad_resultante` S−1 y
   origen `venta`.
5. Escribe la fila de `ventas` con la fecha y el **precio vigente leído en el paso 1** — el precio
   **no viaja en el formulario** (M2). Un `POST` a mano no puede fijar a qué precio se vendió.

Los tres pasos de escritura comparten el mismo `ahora`, como el alta. `.immediate()` por la misma
razón que `crearLibro()`: el `SELECT` de control y las escrituras no pueden tener una ventana entre
medio.

Tras el éxito, la acción **redirige** (M3): el reenvío del navegador no puede repetir la venta.
`revalidatePath` de **las dos** rutas, `/` y la del detalle — el alta ya dejó la cicatriz de
revalidar una sola.

**Nota de tipos:** `ORIGEN_ALTA` está tipado como la intersección `OrigenPrecio & OrigenStock`, y
`'venta'` sólo existe en `OrigenStock`. Un copy-paste del patrón del alta **no compila**, y está bien
que no compile: no se arregla ensanchando el tipo.

**Input validation**
- El identificador del libro: la misma validación del Block 3.
- El formulario de confirmación no aporta ningún otro dato. Todo lo que la venta necesita sale de la
  base.

**Error handling**
- Stock 0 → motivo tipado, mensaje curado, sin escritura (AC-03).
- Libro inexistente → motivo tipado.
- Fallo de infraestructura → `console.error` sin el contenido del formulario, y el mensaje genérico
  existente. Ningún mensaje nuevo expone texto del motor ni rutas (M8).

**Required tests**
- [ ] Venta con stock S ≥ 1: descuenta 1, escribe la venta con fecha y precio vigente, y la entrada de
  `historial_stock` con S, S−1 y origen `venta` — valida AC-02
- [ ] Venta con stock 0: rechaza con mensaje, no modifica el stock, no escribe venta ni historial — valida AC-03
- [ ] Accionar desde la fila del listado no modifica el stock ni escribe venta ni historial — valida AC-17
- [ ] Si falla la escritura de la fila de `ventas`, no persiste el descuento de stock ni la entrada
  de historial — valida AC-11 y NFR-01
- [ ] Venta sobre un libro inexistente: motivo tipado, sin escritura — sad path
- [ ] El precio de venta registrado es el vigente en la base, aunque el formulario mande otro — valida M2
- [ ] Tras la venta, la respuesta redirige — valida M3
- [ ] `revalidatePath` se llama para `/` y para la ruta del detalle
- [ ] El módulo nuevo de `lib/db/` lleva `import 'server-only'` como primer import y su SQL sin
  interpolación — valida M9

**Completion criterion**
AC-02, AC-03, AC-11 y AC-17 verdes, el precio de venta demostrablemente inmune a lo que mande el
cliente, y la venta no repetible por reenvío.

---

## Block 5 — Edición

**Files**
- `lib/db/edicion.ts` (new) — la operación de edición.
- `lib/db/errores.ts` (modified) — `ResultadoEditar` y sus motivos.
- `app/acciones-libro.ts` (modified) — la Server Action de edición.
- `app/mensajes.ts` (modified) — los textos de la edición.
- `app/componentes/formulario-edicion.tsx` (new)
- `app/libros/[id]/page.tsx` (modified) — el formulario.
- `test/db/edicion.test.ts` (new)
- `test/app/acciones-libro.test.ts` (modified)

**Logic**

Dentro de una única `db.transaction(...).immediate()`:

1. Lee la fila vigente **dentro de la transacción** (M4).
2. Valida los cuatro campos reusando `parsearPrecio`, `validarTexto` y `validarStock`. No se
   reimplementa ninguna regla: dos vocabularios de rechazo para el mismo campo es cómo la usuaria
   deja de entender por qué le rechazan un precio.
3. Compara con lo vigente. **Para cada campo que no cambia, no se escribe nada** — ni el libro ni su
   historial (FR-09, AC-10).
4. Si cambia el título: deriva las tres columnas con la función del Block 1 y busca el conflicto de
   identidad. Si lo hay → `titulo_duplicado` con el libro en conflicto nombrado, reusando
   `buscarConflicto()` y `esViolacionDeUnique()` (AC-09, AC-14).
5. Escribe el libro y, en la misma transacción, una entrada de `historial_precio` y/o de
   `historial_stock` con origen `edición manual`, según qué haya cambiado.

Tras el éxito, redirección y `revalidatePath` de las dos rutas, igual que la venta (M3).

**Input validation**
- `precio`: entero > 0, con las mismas reglas de interpretación que el alta — se rechaza decimal
  distinto de cero, separador de miles, no numérico y ausente, sin redondear ni completar (AC-05).
- `stock`: entero ≥ 0.
- `titulo` y `editorial`: no vacíos, ≤ 300 caracteres.

**Error handling**
- Campo inválido → `campos_invalidos` con el motivo exacto por campo; no se modifica el libro ni se
  escribe historial (AC-05, AC-08).
- Título duplicado → `titulo_duplicado` con el conflicto nombrado (AC-09, AC-14).
- Libro inexistente → motivo tipado.
- Fallo de infraestructura → mensaje genérico, sin texto del motor (M8).

**Required tests**
- [ ] Cambio de precio de P a P′ ≠ P: persiste P′ y agrega entrada con P, P′ y origen `edición manual` — valida AC-04
- [ ] Precio con decimal ≠ 0, con separador de miles, no numérico y ausente: rechaza sin redondear,
  informa el motivo, no modifica ni escribe historial — valida AC-05
- [ ] Cambio de stock de S a S′ ≠ S: persiste S′ y agrega entrada con S, S′ y origen `edición manual` — valida AC-06
- [ ] Cambio de título y editorial: persiste y el libro queda recuperable por los nuevos valores — valida AC-07
- [ ] Título o editorial vacíos: rechaza con mensaje, no modifica — valida AC-08
- [ ] Nuevo título que normaliza igual que otro libro: impide la edición nombrando el conflicto — valida AC-09
- [ ] Nuevo título que difiere de otro sólo en puntuación final: impide la edición — valida AC-14
- [ ] Precio o stock iguales a los vigentes: no modifica el libro y no agrega ninguna entrada de
  historial — valida AC-10
- [ ] Si falla la escritura de la entrada de historial, no persiste el cambio del libro — valida AC-11
- [ ] Edición sobre un libro inexistente: motivo tipado, sin escritura — sad path
- [ ] Tras la edición, la respuesta redirige y revalida las dos rutas — valida M3
- [ ] El módulo nuevo lleva `import 'server-only'` y su SQL sin interpolación — valida M9
- [ ] Con los cinco bloques completos, `npm test` alcanza cobertura ≥ 80 % en líneas, ramas y
  funciones sobre `lib/**` y `app/**` — valida AC-12

**Completion criterion**
AC-04 a AC-11 y AC-14 verdes, y una edición que no cambia nada demostrablemente no deja rastro en
ningún historial.

---

## Final verification

Una vez completos los cinco bloques debe valer todo esto:

1. Los 17 criterios de aceptación del PRD tienen al menos un test que los valida, y la trazabilidad
   AC → test es explícita en el nombre o en un comentario del test.
2. Las once mitigaciones del threat model (M1 a M11) tienen su test de regresión. Ninguna queda como
   afirmación de la spec sin nada que la sostenga — es el FAIL que costó cuatro rondas de VERIFY en
   FEAT-001a.
3. La suite completa de FEAT-001a sigue verde **sin que se haya editado ninguna de sus aserciones de
   comportamiento**. Las únicas modificaciones autorizadas a tests existentes son: el conteo de
   `MIGRACIONES` y el stub del contrato en `migrar.test.ts`, la lista de módulos `server-only`, y el
   acotamiento del `ORDER BY` en la guardia de `consultas.ts`.
4. `npm test` pasa con cobertura ≥ 80 % en líneas, ramas y funciones (NFR-02, AC-12).
5. `npm run lint`, `npm run format:check` y `npx tsc --noEmit` limpios.
6. `grep` no encuentra producción de `titulo_normalizado`, `titulo_orden` ni `editorial_normalizada`
   fuera de `lib/dominio/derivar-libro.ts`.
7. Ninguna escritura de `libros` ocurre fuera de `lib/db/`, y ninguna escritura de stock o de precio
   ocurre sin su entrada de historial en la misma transacción (Principio III).
8. La guardia de coherencia de identidad (M6) está en la suite y se pone roja si se cambia la
   normalización sin su migración de recálculo.
9. SAST sin hallazgos abiertos y sin supresiones.
