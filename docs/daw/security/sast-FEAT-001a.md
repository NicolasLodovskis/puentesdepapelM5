# Reporte SAST — FEAT-001a

| Campo | Valor |
|---|---|
| Ticket | FEAT-001a — Cimientos y catálogo |
| Barridos registrados | Bloque 2 (`lib/dominio/`), Bloque 3 (`lib/db/libros.ts`, `lib/db/errores.ts`) |
| Fecha | 2026-08-10 |
| Resultado acumulado | PASSED (0 Critical, 0 High, 0 Medium, 2 Low) |

> Este archivo se actualiza en cada barrido de la fase CODE. El barrido del **closeout**
> vuelve a correr sobre la implementación completa y es el que sostiene el gate `sast`.

---

## Barrido del Bloque 2 — `lib/dominio/`, `test/dominio/`

### F-SAST-01 · Secretos hardcodeados — ✅ limpio

Sin coincidencias de `api_key`, `password`, `secret`, `token`, `passwd`, `bearer` ni bloques
`BEGIN PRIVATE KEY` en los 7 archivos del bloque. No hay ningún archivo `.env` en el repo y
`git ls-files` no trackea ningún `.env`, `.db` ni archivo de credenciales.

Ver W-SAST-01 abajo por el control preventivo que falta.

### F-SAST-02 · Inyección SQL — ✅ no aplica

`lib/dominio/` no contiene una sola sentencia SQL ni importa `better-sqlite3`. Es la capa de
reglas puras: la separación está verificada por el auditor de arquitectura y por un test de
convención pendiente en el Bloque 5.

### F-SAST-03 · Inyección de comandos de SO — ✅ limpio

Sin `child_process`, `exec()`, `execSync`, `spawn` ni `require()` dinámico. Las dos
coincidencias de `.exec(` son `RegExp.prototype.exec`
(`parsear-precio.ts:85`, `normalizar-titulo.ts:65`) — falsos positivos del patrón léxico.

### F-SAST-04 · Deserialización insegura — ✅ limpio

Sin `eval()`, sin `new Function`, sin `JSON.parse` sobre entrada externa, sin deserializadores.

### F-SAST-05 · Path traversal — ✅ no aplica

El bloque no toca el sistema de archivos: sin `node:fs`, sin `node:path`. El único punto de
resolución de rutas del proyecto es `lib/db/ruta.ts` (Bloque 1), que confina a la raíz.

### F-SAST-06 · XSS — ✅ no aplica

Sin `innerHTML`, sin `dangerouslySetInnerHTML`, sin generación de HTML. El bloque devuelve
`string` y uniones discriminadas; el escapado es de React en el Bloque 5.

### F-SAST-07 · SSRF — ✅ limpio

Sin `fetch`, sin `node:net`, sin `node:http`, sin cliente HTTP de ningún tipo.

### F-SAST-08 · Criptografía rota — ✅ no aplica

Sin `createHash`, sin MD5/SHA1, sin cifrado. El proyecto no maneja credenciales por decisión
de producto (PRD-001 §6: un único usuario, sin login).

### F-SAST-09 · Modo debug en producción — ✅ limpio

Sin `console.*` en los 4 archivos de `lib/dominio/`.

### F-SAST-10 · Logging de datos sensibles — ✅ limpio

El bloque no registra nada. Tampoco hay datos sensibles: títulos y editoriales de libros no
son PII (clasificación del threat model, `docs/daw/security/threat-FEAT-001a.md`).

### F-SAST-11 · Upload sin restricciones — ✅ no aplica

El bloque no recibe archivos. Los dos flujos de Excel son FEAT-001b.

### F-SAST-12 · Falta de protección CSRF — ✅ no aplica

El bloque no expone superficie HTTP. La validación de `Origin` de los Server Actions se
conserva por defecto y no se relaja (mitigación 6, Bloque 1); el Server Action llega en el
Bloque 5.

### F-SAST-14 · Validación de entrada incompleta — ✅ limpio

`parsearPrecio()` valida con **allowlist** de patrones anclados y devuelve el motivo exacto del
rechazo, nunca un valor adivinado. `plegarTexto()` y `normalizarTitulo()` tipan `string`; el
saneamiento de longitud lo aplica el llamador (300 caracteres, `CHECK` del esquema en el
Bloque 1 y truncado en el Bloque 4), según reparte la spec.

### F-SAST-15 · Manejo de errores que filtra internos — ✅ limpio

Ninguna de las tres funciones lanza. Todo rechazo es un valor de retorno con un motivo de
dominio (`ausente`, `no_numerico`, `decimal`, `separador_miles`, `fuera_de_rango`): no hay
mensaje de excepción que pueda filtrar rutas, nombres de tabla ni stack traces.

### F-SAST-13 / F-SAST-16 · CVE en dependencias — ✅ limpio

`npm audit` → **found 0 vulnerabilities**. El bloque no agrega ninguna dependencia: los 4
archivos de `lib/dominio/` sólo importan entre sí.

### ReDoS · retroceso catastrófico (riesgo R12 del threat model) — ✅ limpio

Analizados los 7 patrones del bloque. Ninguno tiene cuantificador anidado sobre clases de
ancho variable, que es la forma que produce retroceso exponencial:

| Patrón | Archivo | Análisis |
|---|---|---|
| `^-?\d{1,3}([.,]\d{3})+([.,]\d+)?$` | `parsear-precio.ts:15` | El grupo repetido tiene **ancho fijo** (4 caracteres), así que la partición es determinista: el retroceso queda acotado por el número de repeticiones. Lineal. |
| `^-?\d+$` | `parsear-precio.ts:22` | Un solo cuantificador, anclado en ambos extremos. Lineal. |
| `^(-?\d+)[.,](\d+)$` | `parsear-precio.ts:25` | Dos cuantificadores separados por un literal **obligatorio** y anclado en `$`. Lineal. |
| `^0+$` | `parsear-precio.ts:28` | Un solo cuantificador, anclado. Lineal. |
| `,\s*(el\|la\|…)$` | `normalizar-titulo.ts:15` | `\s*` seguido de alternancia de ancho fijo, anclada en `$`. Sin anclaje inicial el motor prueba cada posición de arranque: O(n·m) en el peor caso, con n y m acotados a 300 caracteres por el `CHECK` del esquema. Microsegundos. |
| `[^\p{L}\p{N}\s]` | `normalizar-titulo.ts:22` | Clase de un carácter, sin cuantificador. Lineal. |
| `\s+` | `normalizar-titulo.ts:25` | Un solo cuantificador sobre `replace`. Lineal. |

`ARTICULO_POSPUESTO` se construye interpolando `ARTICULOS.join('|')`, que es una lista
estática de literales sin metacaracteres (`lib/dominio/constantes.ts:36`) — no hay
construcción de patrón a partir de entrada del usuario.

---

## Hallazgos

### W-SAST-01 · `.env` no está en `.gitignore` — 🟢 Low (WARNING, no bloquea)

| Campo | Valor |
|---|---|
| Archivo | `.gitignore` |
| Categoría | Control preventivo de secretos (`.daw/rules/security.instructions.md`, «Secrets Management») |
| Severidad | Low — reportado, no bloquea |

`.daw/rules/security.instructions.md` exige que los archivos `.env` estén en `.gitignore`.
Hoy no lo están.

**Por qué es Low y no Critical:** F-SAST-01 es Critical cuando hay un secreto *presente* en el
código o en el historial. Acá no hay ninguno: no existe archivo `.env`, `git ls-files` no
trackea ninguno, y el proyecto **no tiene secretos por diseño** — un único usuario sin login
(PRD-001 §6), SQLite embebida sin cadena de conexión, y sin servicios externos. La única
variable de entorno del proyecto es `PUENTES_DB_PATH`, que es una ruta, no una credencial. Lo
que falta es una barrera preventiva, no la contención de una exposición real.

**Por qué igual conviene cerrarlo:** la barrera es una línea, y el momento en que hace falta es
siempre *después* de que alguien creó el archivo. FEAT-001c introduce búsqueda por foto con una
librería local; si alguna feature futura llegara a necesitar configuración, la red ya tiene que
estar puesta.

**Corrección propuesta** (pendiente de decisión del usuario — `.gitignore` es un archivo del
Bloque 1, ya commiteado, y ampliarlo desde el Bloque 2 es un cambio de alcance):

```gitignore
# Variables de entorno: nunca se commitean (Principio IV)
.env
.env.*
!.env.example
```

---

## Barrido del Bloque 3 — `lib/db/libros.ts`, `lib/db/errores.ts`, `test/db/libros.test.ts`

Es el primer bloque con SQL, así que es el barrido que más importa hasta acá.

### F-SAST-02 · Inyección SQL — ✅ limpio (la comprobación central de este bloque)

Las cinco sentencias del repositorio son plantillas **constantes a nivel de módulo**
(`SQL_BUSCAR_CONFLICTO`, `SQL_INSERTAR_LIBRO`, `SQL_LEER_LIBRO`, `SQL_INSERTAR_PRECIO`,
`SQL_INSERTAR_STOCK`). Comprobado:

- **Cero interpolación:** `grep -nE '\$\{' lib/db/libros.ts` no devuelve nada. Ninguna de las
  cinco plantillas contiene una sustitución, ni de entrada de usuario ni de nada.
- **Cero concatenación:** ningún `+` construye una sentencia.
- **100 % de valores por parámetro posicional `?`**, verificado llamada por llamada:
  `libros.ts:235` (1 parámetro), `:240` (1), `:352` (9), `:366` (5), `:367` (5).
- **Ningún `db.exec()` con datos de usuario.** El único `exec` del proyecto está en el runner
  de migraciones del Bloque 1, sobre la lista estática.

Los cuatro campos entran como `unknown` y ninguno llega al texto de una sentencia: llegan como
valores ligados, después de la validación. Mitigación 2 verificada.

Refuerzo del lado de los tests: `test/db/libros.test.ts` incluye una guardia de convención que
audita el propio archivo fuente buscando interpolación en las líneas con palabras clave SQL.

### F-SAST-01 · Secretos hardcodeados — ✅ limpio

Sin coincidencias en los tres archivos. `.env` ya está en `.gitignore` (cerrado por
W-SAST-01, commit `a6c386a`).

### F-SAST-03 / F-SAST-04 · Inyección de comandos y deserialización — ✅ limpio

Sin `child_process`, `spawn`, `eval()`, `new Function` ni `JSON.parse`.

### F-SAST-05 · Path traversal — ✅ no aplica

`libros.ts` no toca el sistema de archivos. La ruta del `.db` la resuelve y confina
`lib/db/ruta.ts` (Bloque 1).

### F-SAST-06 · XSS — ✅ no aplica

Sin generación de HTML. Los rechazos salen **estructurados por campo**
(`{ campo, detalle }`), sin texto de presentación, así que no hay ninguna cadena de este
bloque que pueda terminar interpolada en el DOM. El escapado es de React, en el Bloque 5.

### F-SAST-08 / F-SAST-09 / F-SAST-11 / F-SAST-12 · Cripto, debug, upload, CSRF — ✅ no aplican

Sin criptografía, sin `console.*`, sin recepción de archivos, sin superficie HTTP propia.

### F-SAST-10 · Logging de datos sensibles — ✅ limpio

El repositorio no registra nada.

### F-SAST-14 · Validación de entrada incompleta — ✅ limpio

Allowlist de tipo, longitud y rango **sobre el valor recortado** y **antes de tocar la base**
(mitigación 7). Un valor que no es `string` se reporta `vacio`; uno que no es entero,
`no_entero`; nunca se convierte con `String()`, porque convertir sería inventar el dato que
falta (Principio II). El `CHECK` del esquema queda como última barrera, tal como la spec
prevé.

Cota de texto en `String.length` (unidades UTF-16) contra el `length()` de SQLite (caracteres):
para un par surrogado la cota de JS es la **más** estricta, así que nunca deja pasar algo que
el `CHECK` fuera a rechazar después. Comprobado empíricamente por el verificador con 25
entradas adversariales (surrogados astrales, NUL embebido, emoji, `MAX_SAFE_INTEGER`, 400
dígitos, `1e21`, `0x10`, `NaN`, NBSP).

### F-SAST-15 · Manejo de errores que filtra internos — ✅ limpio en los rechazos

**Mitigación 8 / riesgo R10 verificada.** Ningún valor de retorno de `crearLibro()` contiene
`SQLITE_`, ni nombres de tabla, columna o índice:

- El `SQLITE_CONSTRAINT_UNIQUE` se detecta por `error.code` —contrato estable de
  `SqliteError`, no el texto del mensaje— se reconsulta el conflicto y se devuelve
  `titulo_duplicado` (`libros.ts:370-384`). El error del motor no sale.
- Un título que normaliza a cadena vacía (`"¿¡?!"`) se rechaza **antes** del `INSERT`
  (`libros.ts:327`). Sin esa guardia saltaría
  `CHECK constraint failed: length(titulo_normalizado) >= 1`, que nombra columna y
  restricción — comprobado quitándola.
- `editorial` de sólo espacios o de 301 caracteres se rechaza en la validación. Sin el
  recorte saldría `CHECK constraint failed: length(trim(editorial)) BETWEEN 1 AND 300` —
  comprobado por mutación, y ahora cubierto por dos tests que antes no existían.
- El único `Error` que el repositorio fabrica (`ERROR_UNIQUE_SIN_CONFLICTO`) es genérico y no
  menciona tablas, columnas ni códigos.

Ver W-SAST-02 abajo por el borde que este bloque **no** cubre.

### F-SAST-13 / F-SAST-16 · CVE en dependencias — ✅ limpio

`npm audit` → **found 0 vulnerabilities**. El bloque no agrega dependencias: `better-sqlite3`
entra sólo como `import type`, sin dependencia de runtime.

---

## W-SAST-02 · Los fallos de infraestructura sí propagan texto crudo de SQLite — 🟢 Low (WARNING, no bloquea)

| Campo | Valor |
|---|---|
| Archivo | `lib/db/libros.ts:372` (el `throw error` del `catch`) |
| Categoría | F-SAST-15 · manejo de errores que filtra internos |
| Severidad | Low — reportado, no bloquea |

`crearLibro()` propaga sin capturar los fallos que no son de negocio: un `SQLITE_CANTOPEN` al
abrir la base, un `disk I/O error` en un `INSERT` de historial. Esos mensajes llevan texto del
motor.

**Por qué no es un defecto de este bloque:** la spec lo manda explícitamente —«Falla el
`INSERT` de una entrada de historial → el error se propaga: es un fallo de infraestructura, no
una condición de negocio», «Falla la conexión a la base → se propaga sin capturar»—. Y es la
decisión correcta: tragarse un fallo de disco y devolverlo como resultado de negocio sería
mentirle a la capa de arriba sobre el estado de la base.

**Dónde se cierra:** en el Bloque 5. Su spec ya lo prevé —«`crearLibro()` lanza (fallo de
infraestructura) → se captura en el Server Action, se registra en el log **sin el contenido
del formulario** y se devuelve un mensaje genérico. Nunca se muestra el error de SQLite»— y
tiene un test obligatorio que lo verifica. **La frontera de error del Bloque 5 es lo único que
separa un mensaje de `SqliteError` de la pantalla**, así que su revisión tiene que comprobarlo
sobre los dos caminos, no sólo sobre uno.

Queda registrado acá para que el barrido del closeout lo revise contra el código del Bloque 5
ya escrito, en vez de darlo por hecho.

---

## Resumen del barrido del Bloque 3

| Severidad | Cantidad | Bloquea |
|---|---|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 0 | — |
| 🟢 Low | 1 (W-SAST-02) | No |

**Supresiones: 0.**

**Resultado: PASSED.**

---

## Resumen del barrido del Bloque 2

| Severidad | Cantidad | Bloquea |
|---|---|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 0 | — |
| 🟢 Low | 1 (W-SAST-01) | No |

**Supresiones: 0.** Ningún hallazgo requirió el protocolo de §4.4.

**Resultado: PASSED.** Sin vulnerabilidades Critical, High ni Medium en el alcance del Bloque 2.
