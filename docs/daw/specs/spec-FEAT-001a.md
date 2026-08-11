# Spec FEAT-001a: Cimientos y catálogo

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a |
| PRD | `docs/daw/prd/prd-FEAT-001a.md` |
| Threat model | `docs/daw/security/threat-FEAT-001a.md` |
| Tier | FEATURE |
| Date | 2026-08-09 |
| Spec loops | 0 |

## Summary

Se crea la aplicación Next.js 15 (App Router) desde cero, con SQLite embebida vía `better-sqlite3`
sin ORM. Tres capas: `lib/dominio/` con las reglas puras de identidad y precio, `lib/db/` como único
dueño de la escritura transaccional, y `app/` con la pantalla principal y el Server Action de alta.
`app/` nunca escribe SQL ni normaliza títulos: llama al repositorio.

La identidad de un libro es su título normalizado, con una restricción `UNIQUE` en la base. El orden
del listado usa una columna distinta de la identidad. Toda escritura de stock o precio va en la misma
transacción que su entrada de historial.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 (alta manual con título, editorial, stock y precio) | Block 3, Block 5 |
| FR-02 (unicidad del título normalizado) | Block 1 (constraint), Block 2 (normalización), Block 3 (detección y mensaje) |
| FR-03 (interpretación del precio) | Block 2, Block 3 |
| FR-04 (búsqueda y catálogo ordenado) | Block 4, Block 5 |
| FR-05 (historial de precio en la misma transacción) | Block 1 (esquema), Block 3 |
| FR-06 (historial de stock en la misma transacción) | Block 1 (esquema), Block 3 |
| FR-07 (esquema con estado y orígenes completos) | Block 1, Block 3 |
| FR-08 (normalización en una única función compartida) | Block 2 |
| NFR-01 (< 1 s p95 con 2.000 libros) | **Strategy:** el listado es un Server Component sin JavaScript de cliente por fila. La consulta es un scan sobre 2.000 filas con índice `(estado, titulo_orden)` para el orden; el `LIKE` con comodín inicial no usa índice, pero un scan de 2.000 filas en SQLite embebida cuesta microsegundos. AC-09 mide consulta + armado del HTML en Node sobre un catálogo sembrado de 2.000 libros. Criterio de disparo si no alcanza: paginar a 200 filas por página, decisión ya delegada a PLAN por el PRD. Medido en Block 5. |
| NFR-02 (transacción atómica) | **Strategy:** `db.transaction()` de better-sqlite3, síncrono, envolviendo el `SELECT` de conflicto, el `INSERT` del libro y los dos `INSERT` de historial. Un `throw` dentro del closure revierte todo. Verificado en Block 3 forzando el fallo de la última escritura. |
| NFR-03 (cobertura ≥ 80 %) | **Strategy:** `@vitest/coverage-v8` con umbrales `lines`, `branches` y `functions` en 80 configurados en `vitest.config.ts`, de modo que `npm test` falla por debajo del piso. Configurado en Block 1, verificado en Block 5. |
| AC-01 | Block 3 |
| AC-02 | Block 3 (errores estructurados por campo), Block 5 (mensaje al usuario) |
| AC-03 | Block 3 |
| AC-04 | Block 2 |
| AC-05 | Block 2 |
| AC-06 | Block 4 |
| AC-07 | Block 4 |
| AC-08 | Block 1 (esquema), Block 3 (estado `activo` al crear) |
| AC-09 | Block 5 |
| AC-10 | Block 3 |
| AC-11 | Block 1 (configuración del umbral), Block 5 (verificación final) |

### Mitigaciones del threat model → bloques

| # | Mitigación | Block |
|---|---|---|
| 1 | Bind a `127.0.0.1` en los scripts `dev` y `start` | Block 1 |
| 2 | Prepared statements con parámetros en el 100 % de las consultas | Block 3, Block 4 |
| 3 | Escapado de `%` y `_` en el `LIKE`, con cláusula `ESCAPE` | Block 4 |
| 4 | Lista estática de migraciones, sin descubrimiento dinámico | Block 1 |
| 5 | Ruta del `.db` fija y confinada a la raíz del proyecto | Block 1 |
| 6 | No configurar `serverActions.allowedOrigins` | Block 1 |
| 7 | Validación de servidor con allowlist de tipo, longitud y rango | Block 1 (`CHECK`), Block 3 (código), Block 5 (formulario) |
| 8 | Traducir el error `UNIQUE` a error de dominio; nunca propagar el error de SQLite | Block 3 |
| 9 | Prohibido `dangerouslySetInnerHTML` | Block 5 |

## Dependencies between blocks

- **Block 1** no depende de nadie. Es el primero.
- **Block 2** no depende de Block 1: son funciones puras sin base de datos. Puede implementarse en
  paralelo, pero se ejecuta segundo porque Block 3 necesita las dos cosas.
- **Block 3** depende de Block 1 (esquema y conexión) y de Block 2 (normalización y precio).
- **Block 4** depende de Block 1 y de Block 2 (usa `plegarTexto()` sobre el término de búsqueda).
- **Block 5** depende de Block 3 y de Block 4.

Orden de ejecución: **1 → 2 → 3 → 4 → 5**.

---

## Block 1 — Cimientos: proyecto, configuración y base de datos

**Files**

- `.gitignore` (modificado) — agregar `node_modules/`, `.next/`, `coverage/`, `data/`, `*.db`,
  `*.db-wal`, `*.db-shm`. **Es la primera tarea del bloque, antes de `npm install`** (Principio IV).
- `package.json` (nuevo) — dependencias y scripts.
- `package-lock.json` (nuevo) — versionado, con versiones fijadas.
- `tsconfig.json` (nuevo) — `strict: true`, paths `@/*`.
- `next.config.ts` (nuevo) — `serverExternalPackages` y ausencia deliberada de
  `serverActions.allowedOrigins`.
- `eslint.config.mjs` (nuevo) — `eslint-config-next` + `eslint-config-prettier`.
- `.prettierrc` (nuevo).
- `vitest.config.ts` (nuevo) — entorno `node`, cobertura `v8` con umbrales al 80 %.
- `app/layout.tsx` (nuevo) — layout raíz mínimo.
- `app/globals.css` (nuevo) — estilos base.
- `lib/db/ruta.ts` (nuevo) — resuelve y confina la ruta del archivo `.db`.
- `lib/db/conexion.ts` (nuevo) — singleton de conexión, con `import 'server-only'`.
- `lib/db/migraciones/001-inicial.sql` (nuevo) — el esquema.
- `lib/db/migraciones/index.ts` (nuevo) — **lista estática** de migraciones.
- `lib/db/migrar.ts` (nuevo) — runner sobre `PRAGMA user_version`.
- `lib/db/tipos.ts` (nuevo) — tipos `Libro`, `OrigenPrecio`, `OrigenStock`.
- `test/db/migrar.test.ts` (nuevo).
- `test/db/ruta.test.ts` (nuevo).
- `test/ayudas/base-de-prueba.ts` (nuevo) — abre una base `:memory:` migrada desde cero.

**Logic**

Scaffolding del proyecto y creación de la base.

`lib/db/ruta.ts` resuelve la ruta del archivo: valor por defecto `data/puentes.db` relativo a la raíz
del proyecto. Si existe `PUENTES_DB_PATH`, se resuelve con `path.resolve` y **se rechaza toda ruta
que quede fuera de la raíz del proyecto** (mitigación 5, riesgo R4).

`lib/db/conexion.ts` expone `obtenerDb()`. Cachea la instancia en `globalThis`, no en una `const` de
módulo: el HMR de `next dev` reevalúa los módulos y una `const` filtraría un handle nuevo por cada
recarga en caliente. Al abrir fija `PRAGMA foreign_keys = ON` (SQLite lo trae **apagado** por
conexión, así que sin esto las claves foráneas del DDL serían decorativas), `PRAGMA journal_mode =
WAL` y `PRAGMA busy_timeout = 5000`. El archivo empieza con `import 'server-only'`, que convierte
cualquier importación desde un Client Component en un error de build.

`lib/db/migraciones/index.ts` exporta un **array literal** de migraciones, cada una con su número y
su SQL importado. No hay `readdir` ni ruta configurable: descubrir archivos dinámicamente sería
ejecutar SQL arbitrario (mitigación 4, riesgo R3).

`lib/db/migrar.ts` expone `migrar(db)`. Abre `BEGIN IMMEDIATE`, lee `PRAGMA user_version`, aplica en
orden sólo las migraciones con número mayor, escribe el nuevo `user_version` y confirma. Leer,
comparar y escribir fuera de una transacción sería un check-then-act y dos procesos podrían aplicar
la misma migración dos veces.

`package.json` fija los scripts con el bind explícito (mitigación 1, riesgo R1):

- `dev`: `next dev -H 127.0.0.1`
- `start`: `next start -H 127.0.0.1`
- `test`: `vitest run`
- `test:cov`: `vitest run --coverage`
- `lint`: `next lint`

`next.config.ts` declara `serverExternalPackages: ['better-sqlite3']`. Sin eso el bundler intenta
empaquetar el binding nativo `.node` y el build falla o no resuelve en runtime. **No** se configura
`serverActions.allowedOrigins`: se conserva la validación de `Origin` que Next.js trae por defecto
(mitigación 6, riesgo R5).

**Data model**

Tabla `libros`:

| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | INTEGER | `PRIMARY KEY AUTOINCREMENT` |
| `titulo` | TEXT | `NOT NULL`, `CHECK (length(trim(titulo)) BETWEEN 1 AND 300)` |
| `titulo_normalizado` | TEXT | `NOT NULL`, **`UNIQUE`**, `CHECK (length(titulo_normalizado) >= 1)` — clave de identidad |
| `titulo_orden` | TEXT | `NOT NULL` — clave de orden y de búsqueda por título. Distinta de la identidad |
| `editorial` | TEXT | `NOT NULL`, `CHECK (length(trim(editorial)) BETWEEN 1 AND 300)` |
| `editorial_normalizada` | TEXT | `NOT NULL` — plegado para búsqueda |
| `stock` | INTEGER | `NOT NULL`, `CHECK (stock >= 0 AND stock <= 1000000)` |
| `precio` | INTEGER | `NOT NULL`, `CHECK (precio > 0)` |
| `estado` | TEXT | `NOT NULL DEFAULT 'activo'`, `CHECK (estado IN ('activo','archivado'))` |
| `creado_en` | TEXT | `NOT NULL` — ISO-8601 UTC |

Índices: `idx_libros_catalogo` sobre `(estado, titulo_orden)` — soporta el filtro del catálogo activo
y el `ORDER BY` de FR-04 en una sola estructura. `idx_libros_editorial` sobre
`(estado, editorial_normalizada)`. `titulo_normalizado` ya tiene su índice implícito por el `UNIQUE`.

Tabla `historial_precio`:

| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | INTEGER | `PRIMARY KEY AUTOINCREMENT` |
| `libro_id` | INTEGER | `NOT NULL`, `REFERENCES libros(id) ON DELETE RESTRICT ON UPDATE RESTRICT` |
| `fecha` | TEXT | `NOT NULL` — ISO-8601 UTC |
| `precio_anterior` | INTEGER | `NOT NULL`, `CHECK (precio_anterior >= 0)` — **`>= 0`, no `> 0`**: AC-01 exige precio anterior 0 en el alta |
| `precio_nuevo` | INTEGER | `NOT NULL`, `CHECK (precio_nuevo > 0)` |
| `origen` | TEXT | `NOT NULL`, `CHECK (origen IN ('alta manual','edición manual','reactivación','actualización masiva por Excel','alta por Excel'))` |

Tabla `historial_stock`:

| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | INTEGER | `PRIMARY KEY AUTOINCREMENT` |
| `libro_id` | INTEGER | `NOT NULL`, `REFERENCES libros(id) ON DELETE RESTRICT ON UPDATE RESTRICT` |
| `fecha` | TEXT | `NOT NULL` — ISO-8601 UTC |
| `cantidad_anterior` | INTEGER | `NOT NULL`, `CHECK (cantidad_anterior >= 0)` |
| `cantidad_resultante` | INTEGER | `NOT NULL`, `CHECK (cantidad_resultante >= 0)` |
| `origen` | TEXT | `NOT NULL`, `CHECK (origen IN ('alta manual','edición manual','venta','reactivación','alta por Excel'))` |

Índices: `idx_historial_precio_libro` sobre `(libro_id, fecha)` y `idx_historial_stock_libro` sobre
`(libro_id, fecha)`.

**Las dos listas de `origen` son distintas a propósito.** PRD-001 RF-13 y RF-14 declaran conjuntos
distintos: una venta nunca cambia un precio, y un Excel de actualización de precios nunca toca stock.
Poner la unión en ambas debilitaría la última barrera de dominio. AC-08 queda satisfecho: los cinco
orígenes que enumera están admitidos, cada uno en la tabla donde PRD-001 dice que puede aparecer, y
ninguna feature posterior necesita migrar por esto.

`ON DELETE RESTRICT`, nunca `CASCADE`: el Principio III prohíbe borrar entradas de historial y borrar
libros físicamente. Un `CASCADE` convertiría un `DELETE FROM libros` en un borrado silencioso del
historial, que es justo lo que ese principio existe para impedir.

**Input validation**

Este bloque no recibe entrada de usuario final. La única entrada externa es la variable de entorno
`PUENTES_DB_PATH`: se resuelve a ruta absoluta y se rechaza si no queda dentro de la raíz del
proyecto.

**Error handling**

| Error | Manejo |
|---|---|
| `PUENTES_DB_PATH` apunta fuera de la raíz del proyecto | `lib/db/ruta.ts` lanza `Error` con mensaje explícito. La aplicación no arranca: fallar cerrado, no abrir una base arbitraria. |
| Una migración falla a mitad de camino | El `BEGIN IMMEDIATE` revierte todo; `user_version` queda en el valor anterior. El error se propaga: una base a medio migrar no debe atenderse. |
| El directorio del `.db` no existe | Se crea con `mkdir -p` antes de abrir la conexión. |
| Falla la apertura del archivo `.db` (permisos, disco) | Se propaga sin capturar en el arranque: es un fallo de instalación, no una condición de negocio. |

**Required tests**

- [ ] `migrar()` sobre una base vacía deja `user_version` en 1 y crea las tres tablas — valida AC-08
- [ ] `migrar()` ejecutado dos veces seguidas no vuelve a aplicar la migración y no falla (idempotencia)
- [ ] una migración que falla a mitad revierte: las tablas no quedan creadas y `user_version` sigue en `0` *(sad path)*
- [ ] `obtenerDb()` crea el directorio de la base cuando no existe
- [ ] un fallo al abrir la base (forzado con un `stub` del constructor) se propaga sin capturar *(sad path)*
- [ ] la conexión tiene `foreign_keys` en `ON` después de `obtenerDb()`
- [ ] insertar en `historial_precio` con un `libro_id` inexistente falla por clave foránea *(sad path)*
- [ ] borrar un libro con historial falla por `RESTRICT` *(sad path)*
- [ ] el esquema rechaza `stock = -1`, `stock = 1000001`, `precio = 0` y un título de 301 caracteres *(sad path)*
- [ ] el esquema rechaza `estado = 'otro'` y acepta `'activo'` y `'archivado'` — valida AC-08 *(sad path)*
- [ ] `historial_precio` acepta `precio_anterior = 0` y rechaza `precio_nuevo = 0` — valida AC-01 *(sad path)*
- [ ] `historial_precio` rechaza `origen = 'venta'` e `historial_stock` rechaza `origen = 'actualización masiva por Excel'` *(sad path)*
- [ ] `rutaDb()` con `PUENTES_DB_PATH=../../etc/passwd` lanza error *(sad path)*
- [ ] `rutaDb()` sin variable de entorno devuelve `data/puentes.db` bajo la raíz

**Completion criterion**

`npm install`, `npm run lint` y `npm test` corren sin errores; los 14 tests del bloque pasan;
`npm run dev` levanta la aplicación escuchando en `127.0.0.1` y sirve el layout raíz; `git status` no
muestra ningún `.db` ni `node_modules/` como archivo sin trackear.

---

## Block 2 — Dominio: plegado, normalización e interpretación del precio

**Files**

- `lib/dominio/constantes.ts` (nuevo) — artículos, límites y literales. **Módulo aparte, porque un
  archivo `'use server'` no puede exportar constantes** (`AGENTS.md`, Code conventions).
- `lib/dominio/plegar-texto.ts` (nuevo) — `plegarTexto()`.
- `lib/dominio/normalizar-titulo.ts` (nuevo) — `normalizarTitulo()`.
- `lib/dominio/parsear-precio.ts` (nuevo) — `parsearPrecio()`.
- `test/dominio/plegar-texto.test.ts` (nuevo).
- `test/dominio/normalizar-titulo.test.ts` (nuevo).
- `test/dominio/parsear-precio.test.ts` (nuevo).

**Logic**

`plegarTexto(texto)`: recorta, pasa a minúsculas y **quita únicamente los diacríticos de `á é í ó ú`
y `ü`, preservando la `ñ`**. La eñe no es un acento, es una letra: plancharla haría que `"El sueño"` y
`"El sueno"` fueran el mismo libro. Se implementa con un mapa explícito de caracteres, no con NFD +
descarte de todas las combining marks, precisamente para no arrastrarse la `ñ`. Alimenta
`titulo_orden`, `editorial_normalizada` y el término de búsqueda de Block 4.

`normalizarTitulo(titulo)`: `plegarTexto()`, luego **mover el artículo pospuesto al frente**, luego
quitar puntuación, luego colapsar espacios. El orden importa: la detección del artículo pospuesto
necesita la coma, así que ocurre antes de quitar la puntuación.

Los artículos reconocidos son los nueve del español, y **sólo esos**:
`el`, `la`, `los`, `las`, `un`, `una`, `unos`, `unas`, `lo`. Se reconoce el artículo pospuesto con el
patrón `, <artículo>` al final del título. El artículo antepuesto se deja donde está.

Consecuencia deliberada: `"Principito, El"` y `"El Principito"` normalizan los dos a `el principito`
y son el mismo libro; `"El Aleph"` y `"Aleph"` normalizan a `el aleph` y `aleph` y son libros
distintos. El artículo se mueve, no se borra.

`parsearPrecio(valor)` devuelve una unión discriminada:

```
{ ok: true,  valor: number }
{ ok: false, motivo: 'ausente' | 'no_numerico' | 'decimal' | 'separador_miles' | 'fuera_de_rango' }
```

Reglas, evaluadas **en este orden**:

1. Vacío, `null` o `undefined` → `ausente`.
2. Coincide con `^\d{1,3}([.,]\d{3})+([.,]\d+)?$` → `separador_miles`. Va **antes** que la regla del
   decimal: `1.234` es ambiguo, y decidir si el punto separa miles o decimales sería adivinar
   (RF-31e, Principio II).
3. Coincide con `^\d+$` → entero. Si es `0` → `fuera_de_rango`; si no, `ok`.
4. Coincide con `^\d+[.,]\d+$`: si la parte decimal es toda ceros → el entero, con la misma
   comprobación de rango; si no → `decimal`, **sin redondear**.
5. Cualquier otra cosa → `no_numerico`.

`fuera_de_rango` es el quinto motivo y no está en AC-05, pero AC-02 exige rechazar un precio que no
sea entero `> 0`. Sin él, `0` habría que reportarlo como `no_numerico`, que es falso. Informar un
motivo incorrecto es la forma de adivinar que el Principio II prohíbe.

**Input validation**

Las tres funciones reciben texto arbitrario del usuario. `parsearPrecio()` acepta `string`,
`number`, `null` y `undefined`. Ninguna expresión regular usa cuantificadores anidados, para evitar
retroceso catastrófico (riesgo R12); la cota de 300 caracteres de Block 1 acota además la entrada.

**Error handling**

Estas funciones **no lanzan**. Toda condición de error es un valor de retorno: `parsearPrecio()`
devuelve su `motivo`, y `normalizarTitulo()` sobre una cadena vacía devuelve cadena vacía, que el
`CHECK` de Block 1 y la validación de Block 3 rechazan. Una función pura que lanza obliga a cada
llamador a envolverla en `try`, y el motivo del rechazo se pierde en el camino.

**Required tests**

- [ ] `plegarTexto()` convierte `"Ávila"` en `"avila"` y `"PINGÜINO"` en `"pinguino"`
- [ ] `plegarTexto()` **preserva la eñe**: `"El sueño"` → `"el sueño"`, distinto de `"el sueno"`
- [ ] `normalizarTitulo("Principito, El")` y `normalizarTitulo("El Principito")` dan el mismo valor — valida AC-03
- [ ] `normalizarTitulo("El Aleph")` y `normalizarTitulo("Aleph")` dan valores **distintos**
- [ ] `normalizarTitulo()` quita puntuación y colapsa espacios: `"¿Quién  soy?"` → `"quien soy"`
- [ ] `normalizarTitulo()` reconoce los nueve artículos pospuestos y ninguno más: `"Hobbit, The"` no se reordena
- [ ] `normalizarTitulo("")` devuelve cadena vacía sin lanzar *(sad path)*
- [ ] `parsearPrecio()` acepta `"1234"`, `"1234,00"` y `"1234.0"` como 1234 — valida AC-04
- [ ] `parsearPrecio("1234,50")` devuelve `decimal` y **no redondea** — valida AC-05 *(sad path)*
- [ ] `parsearPrecio("1.234,50")` y `parsearPrecio("1.234")` devuelven `separador_miles` — valida AC-05 *(sad path)*
- [ ] `parsearPrecio("abc")` devuelve `no_numerico`; `parsearPrecio("")`, `null` y `undefined` devuelven `ausente` — valida AC-05 *(sad path)*
- [ ] `parsearPrecio("0")` y `parsearPrecio("-5")` devuelven `fuera_de_rango` *(sad path)*

**Completion criterion**

Los 12 tests pasan y la cobertura de `lib/dominio/` es del 100 % en líneas, ramas y funciones. Ningún
archivo de `lib/dominio/` importa `better-sqlite3`, React ni nada de `app/`.

---

## Block 3 — Repositorio: alta de libro con historial

**Files**

- `lib/db/errores.ts` (nuevo) — tipos de resultado del repositorio.
- `lib/db/libros.ts` (nuevo) — `crearLibro()`.
- `test/db/libros.test.ts` (nuevo).

**Logic**

`crearLibro(entrada)` es el **único** camino de escritura de un libro. Devuelve una unión
discriminada, nunca lanza por una condición de negocio:

```
{ ok: true,  libro: Libro }
{ ok: false, motivo: 'campos_invalidos', errores: Array<{ campo, detalle }> }
{ ok: false, motivo: 'titulo_duplicado', conflicto: { id, titulo, editorial } }
```

Los errores salen **estructurados por campo**, no como texto: la traducción a mensajes es de Block 5.
Así `lib/db/` no se queda con presentación adentro.

Secuencia, toda dentro de un único `db.transaction()`:

1. Validar la entrada (ver *Input validation*). Si hay errores → `campos_invalidos`, sin tocar la base.
2. Calcular `titulo_normalizado` con `normalizarTitulo()`, y `titulo_orden` y `editorial_normalizada`
   con `plegarTexto()`.
3. `SELECT id, titulo, editorial FROM libros WHERE titulo_normalizado = ?`. Si hay fila →
   `titulo_duplicado` con el libro en conflicto. **Este `SELECT` es indispensable**: AC-03 exige un
   mensaje que nombre el libro en conflicto, y un error `SQLITE_CONSTRAINT_UNIQUE` sólo da el nombre
   del índice. Va en la misma transacción que el `INSERT` para que no haya ventana entre comprobar y
   escribir.
4. `INSERT INTO libros (...) VALUES (...)` con `estado = 'activo'` y `creado_en` en ISO-8601 UTC.
5. `INSERT INTO historial_precio` con `precio_anterior = 0`, `precio_nuevo = precio`,
   `origen = 'alta manual'`.
6. `INSERT INTO historial_stock` con `cantidad_anterior = 0`, `cantidad_resultante = stock`,
   `origen = 'alta manual'`.

Los pasos 4, 5 y 6 son inseparables (Principio III). Un fallo en cualquiera revierte los tres.

Toda consulta usa **prepared statements con parámetros posicionales** (mitigación 2). No se concatena
ni interpola entrada del usuario en SQL, sin excepción.

Si pese al `SELECT` del paso 3 la base devolviera `SQLITE_CONSTRAINT_UNIQUE`, se captura, se
reconsulta el libro en conflicto y se devuelve `titulo_duplicado`. **El error de SQLite nunca se
propaga hacia arriba** (mitigación 8, riesgo R10): expondría nombres de tablas y columnas.

> **Invariante para features posteriores.** `titulo_normalizado`, `titulo_orden` y
> `editorial_normalizada` son columnas derivadas y almacenadas. Todo camino que escriba `titulo` o
> `editorial` **debe** recalcularlas en la misma sentencia. FEAT-001b implementa la edición de título
> y editorial (PRD-001 RF-23/RF-24): si actualiza `titulo` sin recalcular `titulo_normalizado`, la
> identidad del catálogo se desincroniza en silencio, la unicidad deja de valer y los dos flujos de
> Excel matchean contra el libro equivocado. Ese recálculo vive en `lib/db/libros.ts` y en ningún
> otro lado.

**Input validation**

Validación de servidor con allowlist (mitigación 7, riesgo R6). Se aplica antes de tocar la base, y
el esquema de Block 1 la repite como última barrera:

| Campo | Regla | Motivo si falla |
|---|---|---|
| `titulo` | string, recortado, longitud 1–300 | `vacio` / `demasiado_largo` |
| `editorial` | string, recortado, longitud 1–300 | `vacio` / `demasiado_largo` |
| `stock` | entero, 0 ≤ n ≤ 1.000.000 | `no_entero` / `fuera_de_rango` |
| `precio` | lo que devuelva `parsearPrecio()` | el `motivo` que devuelva |

`titulo` y `editorial` se validan **sobre el valor recortado**: `NOT NULL` no rechaza la cadena vacía,
y `"   "` es un título vacío.

**Error handling**

| Error | Manejo |
|---|---|
| Algún campo inválido | `campos_invalidos` con un elemento por campo, sin escribir nada. |
| El título normalizado ya existe | `titulo_duplicado` con `id`, `titulo` y `editorial` del libro en conflicto. |
| `SQLITE_CONSTRAINT_UNIQUE` pese al `SELECT` previo | Se captura, se reconsulta el conflicto y se devuelve `titulo_duplicado`. Nunca se propaga el error de SQLite. |
| Falla el `INSERT` de una entrada de historial | La transacción revierte el libro y la otra entrada. El error se propaga: es un fallo de infraestructura, no una condición de negocio. |
| Falla la conexión a la base | Se propaga sin capturar. |

**Required tests**

- [ ] alta válida persiste el libro y agrega **una** entrada en cada historial con `origen = 'alta manual'`, `precio_anterior = 0` y `cantidad_anterior = 0` — valida AC-01
- [ ] el libro creado queda con `estado = 'activo'` — valida AC-08
- [ ] alta con título vacío, editorial vacía, título de 301 caracteres, stock `-1`, stock `1000001` y precio `0` devuelve `campos_invalidos` con el campo correcto y no persiste nada — valida AC-02 *(sad path)*
- [ ] alta con título `"   "` se rechaza como vacío *(sad path)*
- [ ] alta con precio `"1234,50"` devuelve `campos_invalidos` con motivo `decimal` — valida AC-02, AC-05 *(sad path)*
- [ ] alta cuyo título normaliza igual a uno existente devuelve `titulo_duplicado` **con el título y la editorial del libro en conflicto**, y no crea el segundo libro — valida AC-03 *(sad path)*
- [ ] el duplicado se detecta aunque la editorial sea distinta — valida AC-03 *(sad path)*
- [ ] el duplicado se detecta entre `"El Principito"` y `"Principito, El"` — valida AC-03 *(sad path)*
- [ ] un `INSERT` de historial que falla (forzado con un `stub`) revierte también el libro: la base queda sin el libro y sin ninguna entrada — valida AC-10, NFR-02 *(sad path)*
- [ ] un `SQLITE_CONSTRAINT_UNIQUE` devuelto pese al `SELECT` previo (forzado con un `stub`) se traduce a `titulo_duplicado` y no se propaga *(sad path)*
- [ ] un fallo de conexión a la base (forzado con un `stub`) se propaga sin convertirse en un resultado de negocio *(sad path)*
- [ ] ningún error de `crearLibro()` expone texto de SQLite (se comprueba que el mensaje no contiene `SQLITE_`) *(sad path)*

**Completion criterion**

Los 12 tests pasan contra una base `:memory:` migrada desde cero. `crearLibro()` es la única función
exportada que escribe en `libros`. Ninguna consulta del archivo contiene interpolación de cadenas.

---

## Block 4 — Consulta: búsqueda y catálogo

**Files**

- `lib/db/consultas.ts` (nuevo) — `buscarLibros()`.
- `test/db/consultas.test.ts` (nuevo).

**Logic**

`buscarLibros(termino)` devuelve `Libro[]`.

- **Siempre filtra `estado = 'activo'`.** Hoy es un no-op porque nada archiva, pero PRD-001 RF-10
  pide el catálogo **activo**. Si no filtra desde el primer día, cuando llegue la baja lógica los
  archivados aparecerán en el catálogo y ningún test de este sub-ticket fallará.
- Término vacío o sólo espacios → devuelve el catálogo activo completo (AC-07).
- Término no vacío → `WHERE estado = 'activo' AND (titulo_orden LIKE ?1 ESCAPE '\' OR
  editorial_normalizada LIKE ?1 ESCAPE '\')`, con el término pasado por `plegarTexto()` y envuelto en
  `%`. Buscar contra las columnas plegadas es lo que hace la búsqueda insensible a mayúsculas y
  acentos (AC-06).
- **`ORDER BY titulo_orden`**, no `titulo_normalizado`. Son columnas distintas a propósito:
  `titulo_normalizado` mueve el artículo al frente para la identidad, y ordenar por él pondría
  `"Principito, El"` entre las **E**. `titulo_orden` conserva el artículo donde está, así que cada
  libro aparece donde su título empieza.
- El término se pasa por `plegarTexto()`, **no** por `normalizarTitulo()`: mover el artículo al frente
  de un fragmento suelto no significa nada.

Antes de armar el patrón se **escapan `%`, `_` y la propia barra invertida** en el término, y se
declara `ESCAPE '\'` (mitigación 3). Sin esto, buscar `100%` devuelve todo el catálogo.

Prepared statements con parámetros, como en Block 3 (mitigación 2).

**Input validation**

`termino` es `string | null | undefined`. Se recorta y se acota a 300 caracteres antes de plegarlo.
No hay más validación: es una consulta de sólo lectura y cualquier texto es un término legítimo.

**Error handling**

| Error | Manejo |
|---|---|
| `termino` es `null` o `undefined` | Se trata como término vacío → catálogo completo. No es un error. |
| `termino` contiene `%`, `_` o `\` | Se escapan y se buscan como literales. |
| `termino` supera 300 caracteres | Se trunca a 300 antes de plegar. No falla: ningún título puede ser más largo, así que un término mayor no tendría coincidencias igual. |
| Falla la consulta a la base | Se propaga sin capturar: es un fallo de infraestructura. |

**Required tests**

- [ ] busca por fragmento del título y devuelve los coincidentes — valida AC-06
- [ ] busca por fragmento de la editorial y devuelve los coincidentes — valida AC-06
- [ ] la búsqueda ignora mayúsculas y acentos: `"avila"` encuentra `"Ávila"` — valida AC-06
- [ ] los resultados vienen ordenados por `titulo_orden`: `"El Principito"` aparece entre las **E** y `"Aleph"` entre las **A** — valida AC-06
- [ ] término vacío devuelve el catálogo completo, con el mismo orden — valida AC-07
- [ ] término `null` y término `"   "` se comportan como término vacío — valida AC-07 *(sad path)*
- [ ] un libro con `estado = 'archivado'` **no** aparece en ningún resultado *(sad path)*
- [ ] buscar `"100%"` devuelve sólo los libros que contienen literalmente `100%`, no todo el catálogo *(sad path)*
- [ ] buscar `"a_b"` trata el guión bajo como literal *(sad path)*
- [ ] un término de 500 caracteres no falla y devuelve lista vacía *(sad path)*
- [ ] un fallo de la consulta a la base (forzado con un `stub`) se propaga sin devolver una lista vacía *(sad path)*

**Completion criterion**

Los 11 tests pasan. `buscarLibros()` es la única función de consulta del catálogo y toda sentencia
lleva `estado = 'activo'`.

---

## Block 5 — UI: pantalla principal, alta y medición de NFR-01

**Files**

- `app/page.tsx` (nuevo) — pantalla principal: buscador + listado. Server Component.
- `app/acciones.ts` (nuevo) — `'use server'`, exporta **sólo funciones async**: `altaDeLibro()`.
- `app/mensajes.ts` (nuevo) — traducción de los motivos de `lib/db/errores.ts` a texto para la
  usuaria. **Módulo aparte porque `app/acciones.ts` no puede exportar constantes.**
- `app/componentes/formulario-alta.tsx` (nuevo) — formulario de alta.
- `app/componentes/listado-libros.tsx` (nuevo) — tabla del listado.
- `app/componentes/buscador.tsx` (nuevo) — campo de búsqueda.
- `app/error.tsx` (nuevo) — límite de error de la ruta, con mensaje genérico.
- `test/app/acciones.test.ts` (nuevo).
- `test/rendimiento/listado.bench.test.ts` (nuevo) — medición de AC-09.
- `scripts/sembrar-catalogo.ts` (nuevo) — genera un catálogo determinista de 2.000 libros.

**Logic**

`app/page.tsx` lee `searchParams` (lo que además fuerza el renderizado dinámico y evita que la
consulta corra durante `next build` y quede el catálogo horneado en el HTML), llama a
`buscarLibros()` y renderiza el listado. Es un Server Component: **no hay JavaScript de cliente por
fila**, que es la estrategia de NFR-01.

`app/acciones.ts` lleva `'use server'` y exporta únicamente `altaDeLibro(estadoPrevio, formData)`.
Lee los campos del `FormData`, llama a `crearLibro()`, y traduce el resultado:

- `ok` → `revalidatePath('/')` y devuelve éxito.
- `campos_invalidos` → devuelve un mapa campo → mensaje, usando `app/mensajes.ts`. Es la mitad de
  AC-02 que el repositorio no puede cubrir: los mensajes por campo son presentación.
- `titulo_duplicado` → devuelve un mensaje que **nombra el libro en conflicto** con su editorial
  (AC-03).

**Ningún archivo con `'use server'` exporta constantes** (`AGENTS.md`, Code conventions). Los
literales viven en `app/mensajes.ts` y en `lib/dominio/constantes.ts`. Matiz que vale escribir:
`export type` y `export interface` **sí** están permitidos en un módulo `'use server'` porque se
borran al compilar; lo que rompe la aplicación es `export const`.

**Prohibido `dangerouslySetInnerHTML`** en todo el bloque (mitigación 9). Los títulos y editoriales
los carga la usuaria y React los escapa por defecto.

`scripts/sembrar-catalogo.ts` genera 2.000 libros con títulos y editoriales deterministas (semilla
fija, sin aleatoriedad) sobre una base temporal. La base sembrada **no se versiona**: la cubre el
`.gitignore` de Block 1.

`test/rendimiento/listado.bench.test.ts` mide AC-09: siembra los 2.000 libros, ejecuta 100
iteraciones de `buscarLibros()` **más el armado del HTML del listado**, y comprueba que el percentil
95 esté por debajo de 1 s. AC-09 dice *"SHALL devolver el listado"*, no pintarlo: la medición en Node
es la correcta para este sub-ticket. La medición con navegador y miniaturas es AC-08 de FEAT-001c.

**API contract**

Un Server Action no se ve como un endpoint, pero lo es: Next.js lo expone como un `POST` HTTP
invocable directamente. Se documenta como tal porque la superficie existe aunque no haya un archivo
de ruta.

- **Método + ruta:** `POST /` — el Server Action se despacha sobre la ruta de la página, identificado
  por el header `Next-Action` que genera el framework. No hay una URL pública estable, y no se debe
  construir una.
- **Request** (`FormData`, `Content-Type: multipart/form-data`): `titulo` (string, 1–300),
  `editorial` (string, 1–300), `stock` (string que debe parsear a entero 0–1.000.000), `precio`
  (string interpretado por `parsearPrecio()`). Cualquier campo adicional se ignora.
- **Response:** el valor de retorno del Server Action, serializado por Next.js —
  `{ ok: true }` o `{ ok: false, mensajes: Record<campo, string>, general?: string }`. No es un cuerpo
  JSON que la usuaria vea.
- **Códigos de error:** el Server Action no devuelve códigos HTTP de negocio; los rechazos viajan en
  el valor de retorno. El framework responde `500` sólo ante una excepción no capturada, y `403` si
  la validación de `Origin` falla.
- **Auth:** **ninguna, por decisión de producto** (PRD-001 §6, riesgo aceptado A1 del threat model).
  Los dos controles que la reemplazan son el bind a `127.0.0.1` (mitigación 1) y la validación de
  `Origin` que Next.js aplica por defecto a los Server Actions, que no se relaja (mitigación 6).

**Input validation**

El `FormData` del alta llega del navegador y **no es confiable**: la usuaria puede alterar el HTML.
`altaDeLibro()` no valida por su cuenta — delega en `crearLibro()`, que aplica la allowlist de
tipo, longitud y rango de Block 3. La validación de cliente (atributos `required`, `min`, `max`) es
comodidad, nunca la barrera.

Los campos leídos son `titulo`, `editorial`, `stock` y `precio`; cualquier campo extra del `FormData`
se ignora.

**Error handling**

| Error | Manejo |
|---|---|
| `crearLibro()` devuelve `campos_invalidos` | Se devuelve un mensaje por campo y el formulario los muestra junto a su input, conservando lo que la usuaria escribió. |
| `crearLibro()` devuelve `titulo_duplicado` | Mensaje que nombra el libro en conflicto y su editorial. El formulario no se limpia. |
| Falta un campo en el `FormData` (invocación manipulada) | Se trata como campo vacío y cae en `campos_invalidos`. No se asume ningún valor por defecto (Principio II). |
| `crearLibro()` lanza (fallo de infraestructura) | Se captura en el Server Action, se registra en el log **sin el contenido del formulario** y se devuelve un mensaje genérico. Nunca se muestra el error de SQLite. |
| `buscarLibros()` lanza al renderizar la página | Lo maneja `app/error.tsx` con un mensaje genérico. |

**Required tests**

- [ ] `altaDeLibro()` con un `FormData` válido crea el libro y devuelve éxito — valida AC-01, FR-01
- [ ] `altaDeLibro()` con título vacío devuelve el mensaje asociado al campo `titulo` y no crea nada — valida AC-02 *(sad path)*
- [ ] `altaDeLibro()` con precio `"1234,50"` devuelve el mensaje de decimal, distinto del de precio ausente y del de precio no numérico — valida AC-02, AC-05 *(sad path)*
- [ ] `altaDeLibro()` con un título duplicado devuelve un mensaje que **contiene el título y la editorial** del libro en conflicto — valida AC-03 *(sad path)*
- [ ] `altaDeLibro()` con un `FormData` sin el campo `stock` lo trata como vacío y no asume `0` — valida AC-02 *(sad path)*
- [ ] `altaDeLibro()` con `crearLibro()` lanzando devuelve un mensaje genérico que no contiene `SQLITE_` *(sad path)*
- [ ] el listado renderizado a HTML contiene una fila por cada libro activo, en orden alfabético — valida AC-06, AC-07
- [ ] **AC-09**: con 2.000 libros sembrados, consulta + armado del HTML del catálogo completo tarda menos de 1 s en el percentil 95 sobre 100 iteraciones — valida AC-09, NFR-01
- [ ] **AC-09**: la misma medición para una búsqueda con término — valida AC-09, NFR-01
- [ ] `app/error.tsx` muestra un mensaje genérico cuando `buscarLibros()` lanza al renderizar, sin exponer el error subyacente *(sad path)*
- [ ] `vitest.config.ts` declara los tres umbrales del 80 % y `npm run test:cov` **falla** cuando la cobertura queda por debajo de alguno — valida AC-11, NFR-03
- [ ] ningún archivo bajo `app/` importa `better-sqlite3` ni contiene las cadenas `SELECT`, `INSERT` o `dangerouslySetInnerHTML` (test de convención sobre el código fuente) — valida la separación de capas y la mitigación 9

**Completion criterion**

Los 12 tests pasan; `npm run test:cov` reporta ≥ 80 % en líneas, ramas y funciones sobre todo el
código nuevo y **no falla por umbral** (AC-11); `npm run dev` levanta en `127.0.0.1` y permite dar de
alta un libro y verlo en el listado.

---

## Rollback

La única migración de este sub-ticket es la inicial: crea el esquema sobre una base que no existía.
**No hay migración inversa que escribir**, y decirlo explícitamente vale más que omitirlo. Revertir
FEAT-001a es revertir sus commits y borrar el archivo `data/puentes.db`, que en ese punto no contiene
ningún dato que la librera no pueda volver a cargar.

Esto deja de ser cierto en el momento en que la usuaria carga su inventario real. A partir de ahí, el
`.db` es el activo y las features siguientes (FEAT-001b, FEAT-001c) **sí** necesitan migración
inversa o, como mínimo, un plan explícito, porque el resguardo del archivo está fuera de alcance del
producto (PRD-001 §7) y no hay copia a la que volver.

## Final verification

Cuando los cinco bloques estén hechos, tiene que valer todo esto a la vez:

1. `npm run lint` sin errores y `npm run test:cov` en verde, con los tres umbrales del 80 % cumplidos
   (AC-11).
2. Los 11 AC del PRD tienen al menos un test que los valida y ese test pasa.
3. `npm run dev` levanta escuchando **sólo** en `127.0.0.1`: la aplicación no es alcanzable desde otra
   máquina de la red.
4. `git status` limpio: ningún `.db`, ningún `node_modules/`, ningún `.next/`, ninguna base sembrada.
5. Ningún archivo bajo `app/` importa `better-sqlite3` ni escribe SQL.
6. Ningún archivo con `'use server'` exporta una constante.
7. Ninguna sentencia SQL del proyecto concatena o interpola entrada del usuario.
8. Las nueve mitigaciones del threat model están implementadas y cada una tiene un test o una
   verificación de convención que la respalda.
