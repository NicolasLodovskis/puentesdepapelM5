# Reporte SAST — FEAT-001a

| Campo | Valor |
|---|---|
| Ticket | FEAT-001a — Cimientos y catálogo |
| Barridos registrados | Bloque 2 (`lib/dominio/`), Bloque 3 (`lib/db/libros.ts`, `lib/db/errores.ts`), **closeout** (implementación completa: bloques 1 a 5) |
| Fecha | 2026-08-11 (closeout; barridos previos 2026-08-10) |
| Resultado acumulado | PASSED (0 Critical, 0 High, 0 Medium, 2 Low — las dos cerradas) |

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

---

## Barrido del closeout — implementación completa (bloques 1 a 5)

Éste es el barrido que sostiene el gate `sast`. Corre sobre todo el código, no sólo sobre lo
nuevo, y su trabajo principal es doble: cubrir los bloques 4 y 5, que no tenían barrido propio, y
**revisar contra código real las dos advertencias que los barridos anteriores dejaron abiertas**.

El Bloque 5 es el que agrega superficie de verdad: es el único con una entrada HTTP.

### F-SAST-01 · Secretos hardcodeados — ✅ limpio

Sin coincidencias de `api_key`, `password`, `secret`, `token`, `bearer` ni `private_key` con valor
asignado, en `app/`, `lib/`, `scripts/` y `test/`. `.env` y `.env.*` están en `.gitignore` desde el
commit `a6c386a`. `git ls-files` no trackea ningún `.env`, `.db` ni archivo de credenciales, y el
árbol quedó limpio después de las corridas (`.tmp-tests/` vacío, `data/` inexistente).

### F-SAST-02 · Inyección SQL — ✅ limpio

Las dos sentencias nuevas del Bloque 4 (`lib/db/consultas.ts`) son literales constantes a nivel de
módulo, sin una sola sustitución, y el término del usuario viaja **siempre** como parámetro
posicional (`consultas.ts:157`, `:162`). El `LIKE` lleva `ESCAPE '\'` y el término pasa por un
escapado de `%`, `_` y la propia barra invertida en **una sola pasada** (`consultas.ts:30`,
`:111-113`): escapar los comodines y la barra en pasadas separadas haría que el escapado se comiera
a sí mismo. Sin eso, buscar `100%` devolvería medio catálogo — que es un defecto de resultados, no
de inyección, porque el valor nunca llega al texto de la sentencia.

`app/` no contiene una sola sentencia: tres guardias de convención lo auditan sobre el fuente
(`test/app/acciones.test.ts:566-617`), y dos de ellos cierran el hueco de llegar a la base **sin
escribir una palabra SQL** — prohíben importar `lib/db/conexion` y la subcadena `.prepare(`.

**Interpolación deliberada, documentada acá para que no quede sin revisar:**
`lib/db/migrar.ts:38` interpola en `db.exec(\`PRAGMA user_version = ${versionNueva}\`)`. No es
suprimible por conveniencia y tampoco es un hallazgo: `PRAGMA` **no admite parámetros** en SQLite,
así que no hay forma de ligar el valor. El dato sale de la lista estática de migraciones
(`lib/db/migraciones/index.ts:20`, un array literal sin `readdir` ni ruta configurable — mitigación
4), nunca de una entrada externa, y aun así el código comprueba `Number.isInteger()` antes de
escribirlo. Un entero no puede transportar sintaxis SQL. Disposición: **limpio, no supresión** —
no hay vector.

### F-SAST-03 · Inyección de comandos de SO — ✅ limpio en producción

`app/`, `lib/` y `scripts/` no importan `node:child_process`. Las coincidencias de `.exec(` son
`RegExp.prototype.exec` (`normalizar-titulo.ts:65`, `parsear-precio.ts:85`) y los `db.exec()` del
runner de migraciones sobre la lista estática — los mismos falsos positivos léxicos que ya
registraron los barridos anteriores.

El único `spawnSync` del proyecto está en `test/app/acciones.test.ts:813`, en el test de AC-11, y
**no recibe entrada del usuario**: los argumentos son literales y la ruta se arma con
`process.cwd()`. Es código de test, no de la aplicación, y no forma parte del bundle.

### F-SAST-04 · Deserialización insegura — ✅ limpio

Sin `eval()`, sin `new Function`, sin deserializadores. Sin `JSON.parse` sobre entrada externa.

### F-SAST-05 · Path traversal — ✅ limpio

El único punto donde una entrada externa determina una ruta sigue siendo `lib/db/ruta.ts`
(Bloque 1): resuelve `PUENTES_DB_PATH` con `path.resolve` y **rechaza toda ruta que quede fuera de
la raíz del proyecto** (mitigación 5), con test que lo prueba con `../../etc/passwd`. Los bloques 4
y 5 no agregan ninguna resolución de rutas a partir de entrada: las de `.tmp-tests/` se arman con
`process.cwd()` y literales, en código de test.

### F-SAST-06 · XSS — ✅ limpio (la comprobación central del Bloque 5)

Es el primer bloque que genera HTML, así que es acá donde la mitigación 9 se verifica o no se
verifica:

- **Cero `dangerouslySetInnerHTML`, cero `innerHTML`, cero `javascript:`** en todo `app/`, auditado
  sobre el fuente crudo —comentarios incluidos— por `test/app/acciones.test.ts:619-632`.
- **Ninguna URL construida:** `grep -n "href=\|src="` sobre `app/` no devuelve **ninguna**
  coincidencia. No hay atributo de navegación que pueda recibir un esquema `javascript:`.
- Todo lo que carga la usuaria llega al HTML como hijo de texto de JSX
  (`listado-libros.tsx:53-56`) o como `defaultValue` (`buscador.tsx:35`), y React escapa las dos
  cosas.
- **Verificado por comportamiento y no sólo por convención:** el test de
  `test/app/acciones.test.ts:295-310` da de alta un libro cuyo título es
  `<script>alert(1)</script>` y otro con `<img onerror=`, renderiza el listado y comprueba tanto la
  ausencia del payload crudo como la presencia de su forma escapada. Un guardia de convención
  puede quedar obsoleto; éste falla si el escapado deja de ocurrir.

### F-SAST-07 · SSRF — ✅ no aplica

Sin `fetch`, sin `node:http`, sin `node:net`, sin cliente HTTP. La aplicación no hace ninguna
petición saliente.

### F-SAST-08 · Criptografía rota — ✅ no aplica

Sin criptografía. El proyecto no maneja credenciales por decisión de producto (PRD-001 §6).

### F-SAST-09 · Modo debug en producción — ✅ limpio

Sin `NODE_ENV` forzado, sin `debug: true`, sin `devtool`. `next.config.ts` declara sólo
`serverExternalPackages` y `agentRules: false`, ninguna de las dos con efecto en seguridad. Los
scripts `dev` y `start` bindean explícitamente a `127.0.0.1` (mitigación 1): verificado sobre la
aplicación corriendo — `ss -ltn` muestra `LISTEN 127.0.0.1:3000` y sólo ahí, y un `curl` a la IP de
la máquina en la red no llega.

### F-SAST-10 · Logging de datos sensibles — ✅ limpio

Dos `console.error`, los dos en caminos de fallo y ninguno con datos del formulario:

- `app/acciones.ts:62` registra el fallo de infraestructura **sin el contenido del formulario**, y
  hay un test que lo verifica comprobando que el log no contiene el título ni la editorial. Un log
  con esos campos sería el formulario copiado al disco.
- `app/error.tsx:25` registra el fallo de renderizado dentro de un `useEffect`, no en el cuerpo:
  durante el renderizado del servidor no corre, así que el detalle no se escribe dos veces ni se
  filtra al HTML servido.

Títulos y editoriales de libros no son PII (clasificación del threat model).

### F-SAST-11 · Upload sin restricciones — ✅ limpio

El formulario no tiene ningún campo de archivo. Y el borde importante está cubierto: una petición
`multipart` fabricada a mano **puede** mandar un `File` en el campo `titulo`, y en ese caso
`FormData.get()` devuelve un `File`. `crearLibro()` lo rechaza como `vacio` sin convertirlo con
`String()` (`lib/db/libros.ts:151`, `:206`) — convertirlo sería inventar el dato (Principio II). No
se escribe nada en disco. Los dos flujos de Excel son FEAT-001b.

### F-SAST-12 · Falta de protección CSRF — ✅ limpio

El Server Action es una superficie HTTP real —Next.js lo despacha como `POST /` identificado por el
header `Next-Action`— y **no tiene autenticación, por decisión de producto** (PRD-001 §6, riesgo
aceptado A1 del threat model). Los dos controles que la reemplazan están los dos en su lugar:

1. El bind a `127.0.0.1` (mitigación 1), verificado arriba sobre la app corriendo.
2. La validación de `Origin` que Next.js aplica por defecto a los Server Actions.
   `next.config.ts` **no** configura `serverActions.allowedOrigins`, con el motivo escrito en el
   propio archivo (mitigación 6, riesgo R5). No relajarla es lo que hace que un sitio cualquiera
   abierto en el navegador de la librera no pueda disparar un alta contra su `localhost`.

### F-SAST-14 · Validación de entrada incompleta — ✅ limpio

Toda la validación de escritura sigue viviendo en `crearLibro()` con allowlist de tipo, longitud y
rango (mitigación 7), y el Bloque 5 **no la duplica ni la reemplaza**: `altaDeLibro()` pasa los
cuatro `datos.get()` crudos y no completa nada (`app/acciones.ts:52-57`). La validación de cliente
(`required`, `min`, `max`) es comodidad, nunca la barrera — el `FormData` llega del navegador y la
usuaria puede alterar el HTML.

La entrada de sólo lectura del Bloque 4 se recorta y se acota a 300 caracteres antes de plegarse
(`consultas.ts:119-122`). No hay más validación y no hace falta: cualquier texto es un término
legítimo.

### F-SAST-15 · Manejo de errores que filtra internos — ✅ limpio (cierra W-SAST-02)

**W-SAST-02 queda cerrada.** El Bloque 3 la dejó abierta a propósito: propaga sin capturar los
fallos que no son de negocio, y esos mensajes llevan texto del motor (`SQLITE_CANTOPEN`,
`disk I/O error`). El Bloque 5 es la frontera que los detiene, y hay que comprobar **los dos
caminos**, no uno:

| Camino | Frontera | Verificado |
|---|---|---|
| El alta lanza | `try/catch` en `app/acciones.ts:58-65` → devuelve `MENSAJE_ERROR_INESPERADO`, genérico | Test que fuerza el fallo y comprueba que el retorno **no contiene** `SQLITE_` |
| El renderizado del catálogo lanza | `app/error.tsx` con mensaje genérico | Dos tests: uno renderiza el límite con un `SQLITE_CANTOPEN` y comprueba que no sale en el HTML; el otro —agregado en la revisión— comprueba que la página **propaga** el fallo en vez de tragarlo, que es lo que hace alcanzable el límite |

El segundo test del renderizado importa más de lo que parece: sin él, envolver `buscarLibros()` en
un `try/catch` que devolviera `[]` dejaría `app/error.tsx` inalcanzable para siempre, con toda la
suite en verde y la pantalla mintiendo «no hay libros» ante una base caída.

Matiz de producción que conviene dejar escrito: en un build de producción Next.js no manda al
límite de cliente el mensaje del error de servidor, sólo un `digest`, así que el texto de
`SqliteError` no sale del proceso. En `next dev` sí llega el detalle a la consola del navegador —
aceptable, porque es desarrollo y la app escucha únicamente en `127.0.0.1`.

### F-SAST-13 / F-SAST-16 · CVE en dependencias — ✅ limpio

`npm audit` → `{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}`. Los bloques 4 y 5
**no agregan ninguna dependencia**: las cinco de runtime siguen siendo `better-sqlite3` 13.0.2,
`next` 16.3.0, `react` y `react-dom` 19.2.8 y `server-only` 0.0.1. El lockfile está commiteado.

### ReDoS · retroceso catastrófico (riesgo R12) — ✅ limpio

Los patrones nuevos no tienen cuantificador anidado: `/[\\%_]/gu` es una clase de un carácter
(`consultas.ts:30`), y los del Bloque 5 son de test. La cota de 300 caracteres del término acota
además cualquier entrada antes de que llegue a una expresión regular.

---

## Resumen del barrido del closeout

| Severidad | Cantidad | Bloquea |
|---|---|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 0 | — |
| 🟢 Low | 0 nuevas | — |

**Supresiones: 0.** Ningún hallazgo requirió el protocolo de §4.4, y en particular la interpolación
del `PRAGMA` **no** se suprime: se documenta como limpia porque no existe vector, no porque se
acepte un riesgo.

**Advertencias previas:** las dos cerradas. W-SAST-01 (`.env` en `.gitignore`) en el commit
`a6c386a`; W-SAST-02 (texto de SQLite en fallos de infraestructura) por la frontera de error del
Bloque 5, verificada en los dos caminos.

**Resultado: PASSED.** El gate `sast` queda satisfecho para FEAT-001a.
