# Reporte de verificación — FEAT-001a

| Campo | Valor |
|---|---|
| Ticket | FEAT-001a — Cimientos y catálogo |
| Tier | FEATURE |
| PRD | `docs/daw/prd/prd-FEAT-001a.md` |
| Spec | `docs/daw/specs/spec-FEAT-001a.md` |
| Threat model | `docs/daw/security/threat-FEAT-001a.md` |
| Reporte SAST | `docs/daw/security/sast-FEAT-001a.md` |
| Rondas de verificación | 4 — FAILED, PASSED, PASSED, PASSED |
| Resultado | **PASSED** (gate `verify` satisfecho en la ronda 4) |

> Este archivo se **agrega**, no se sobrescribe. Cuántas rondas tardó la verificación es parte de lo
> que pasó, y una ronda que falló es lo que explica el bucle correctivo que viene después.

---

## Ronda 1 — 2026-08-11 — **FAILED**

Verificación cruzada independiente por `daw-module-verifier`, un agente que no escribió nada de este
código y no participó de la fase CODE. Alcance: el ticket completo, no un bloque.

### Resultado

| | |
|---|---|
| FAILs | 2 |
| WARNs | 9 |
| PASSes | 11/11 AC · 5/5 bloques · 61/61 tests prometidos |

**Ninguno de los dos FAIL es un defecto de implementación.** Uno es un test que falta; el otro es una
ambigüedad del PRD que nadie había mirado.

### Gates ejecutados

| Comando | Resultado |
|---|---|
| `npm test` (`vitest run --coverage`) | 151 tests, 10 archivos, 0 fallos |
| `npx tsc --noEmit` | limpio |
| `npx eslint .` | limpio |
| `npx prettier --check .` | limpio |
| `npm run dev` + `/proc/net/tcp` + `curl` | escucha **sólo** en `127.0.0.1:3000` |

---

### F-VER-01 · Cada AC con un test que pasa — ✅ 11/11

| AC | Implementación | Test |
|---|---|---|
| AC-01 | `lib/db/libros.ts:crearLibro` pasos 4-6 | `test/db/libros.test.ts` (libro + una entrada en cada historial) y `test/app/acciones.test.ts` (alta por `FormData`) |
| AC-02 | `libros.ts:validarTexto/validarStock/validarPrecio` + `app/mensajes.ts:mensajeDeCampo` | 13 casos `it.each` + orden de los errores + 2 en el Server Action |
| AC-03 | `libros.ts` pasos 2-3 y `catch` de UNIQUE + `mensajes.ts:mensajeDeConflicto` | 3 en el repositorio + 1 que afirma que el mensaje contiene título **y** editorial |
| AC-04 | `lib/dominio/parsear-precio.ts` reglas 3-4 | unidad: entero y decimal de ceros como el mismo entero — **⚠️ ver W-VER-04** |
| AC-05 | `parsear-precio.ts` reglas 1-2-4-5 | 5 de unidad + rechazo del decimal en el alta + 4 textos distinguibles en la UI |
| AC-06 | `lib/db/consultas.ts:buscarLibros` + `app/page.tsx` + `listado-libros.tsx` | 4 de consulta + una fila por libro activo, en orden, con precio y stock |
| AC-07 | `consultas.ts`, rama del término vacío | término vacío, `null`, `undefined`, `"   "`, y parámetro ausente en la página |
| AC-08 | `001-inicial.ts` (`CHECK estado`, dos listas de `origen`) + `libros.ts:ESTADO_INICIAL` | estado `activo` al crear, `estado='otro'` rechazado, cada historial con su propio conjunto de orígenes |
| AC-09 | `consultas.ts` + Server Component | `test/rendimiento/listado.bench.test.ts`, p95 sobre 100 iteraciones con 2.000 libros, **con medición de control** que prueba que el armado del HTML está dentro del reloj |
| AC-10 | `libros.ts:crearLibro` → `alta.immediate()` | fallo forzado de un `INSERT` de historial: la base queda vacía |
| AC-11 | `vitest.config.ts`, umbrales 80/80/80 | corre Vitest de verdad en un proyecto aislado y comprueba los tres mensajes de umbral |

### F-VER-02 · Los 5 bloques implementados — ✅

Bloque 1 (cimientos, esquema `STRICT`, 3 tablas, 5 índices, `ON DELETE RESTRICT`), 2 (dominio, 100 %
de cobertura, sin importar `better-sqlite3` ni React), 3 (repositorio, único camino de escritura, 6
pasos en una `transaction().immediate()`), 4 (consulta, dos sentencias literales con
`estado = 'activo'` y `ORDER BY titulo_orden`), 5 (UI, Server Component + Server Action).

### F-VER-06 · Tests prometidos por la spec — ✅ 61/61

| Bloque | Prometidos | Presentes |
|---|---|---|
| 1 | 14 | 14 |
| 2 | 12 | 12 |
| 3 | 12 | 12 |
| 4 | 11 | 11 |
| 5 | 12 | 12 |

Los 151 casos ejecutados salen de 126 `it`/`it.each` y **exceden** los 61 obligatorios con 65 tests
que la spec no pidió: guardias de convención, meta-guardias de los propios guardias, el guardia del
`UNIQUE` único, el de las diez columnas de `libros`, el de truncado en 300 exactos y el de la barra
invertida en el `LIKE`. Ningún test prometido está ausente.

### F-VER-03 · Cobertura — ✅

| Métrica | Valor | Umbral |
|---|---|---|
| Líneas | 97,81 % (224/229) | 80 % |
| Ramas | 95,45 % (126/132) | 80 % |
| Funciones | 95,55 % (43/45) | 80 % |

### F-VER-04 · Caminos tristes — ✅

Recorridas las 20 funciones que aceptan entrada. Todas tienen al menos un caso inválido. Ninguna es
sólo camino feliz.

### F-VER-05 · Lint y type checker — ✅

---

## ❌ FAIL 1 · Las mitigaciones 1 y 6 no tienen ninguna red de regresión

| Campo | Valor |
|---|---|
| Regla | Condición 8 de «Final verification» de la spec: las 9 mitigaciones implementadas **y cada una con un test o verificación de convención que la respalde** |
| Archivos | `package.json` (scripts `dev` y `start`), `next.config.ts` |
| Disposición | **Bucle correctivo a CODE** |

Las dos mitigaciones **están implementadas** —`package.json` lleva `-H 127.0.0.1` en `dev` y en
`start`, y `next.config.ts` no configura `serverActions.allowedOrigins`, con el motivo escrito en el
propio archivo—, pero ninguna tiene test. `grep -rn "127.0.0.1" test/` y
`grep -rn "allowedOrigins" test/` devuelven cero coincidencias. Las otras siete mitigaciones tienen
respaldo, varias por duplicado (convención **y** comportamiento).

**Por qué es el hallazgo más importante de esta verificación.** La mitigación 1 es el **control
compensatorio del riesgo aceptado A1**: el threat model dice que el aislamiento de red hace el
trabajo que haría la autenticación, porque el producto no tiene login por decisión de producto
(PRD-001 §6). Hoy, borrar ` -H 127.0.0.1` de `package.json` deja la aplicación de una librería sin
autenticación escuchando en **todas las interfaces de su red**, y lo hace con los 151 tests en
verde, el lint limpio y el SAST sin nada que decir. Lo mismo del otro lado: agregar
`allowedOrigins` desactiva la única defensa CSRF del `POST /` del Server Action.

Es el único punto del ticket donde este código deja sin vigilar algo que en todos los demás vigila
dos veces.

**Corrección:** un test de convención de tres aserciones sobre `package.json` y `next.config.ts`,
del mismo estilo que el repo ya usa siete veces.

---

## ❌ FAIL 2 · FR-04 no se cumple: el orden no es «en español»

| Campo | Valor |
|---|---|
| Regla | FR-04 del PRD: «comparación **en español**» |
| Naturaleza | Brecha **PRD ↔ spec**, no spec ↔ código |
| Disposición | **Enmendar FR-04 y abrir el ordenamiento en español como ticket propio** (decisión del usuario, 2026-08-11) |

El esquema no declara `COLLATE`, así que la colación es `BINARY` y compara bytes UTF-8. Medido sobre
la aplicación real:

```
Ávila < Niño < Nube < Oso < Zorro < Ñandú < Ñoquis
```

**El alcance es mayor que «la eñe».** `plegarTexto()` pliega únicamente `á é í ó ú ü` —deliberado, y
documentado en `lib/dominio/constantes.ts`—, así que **todo carácter no-ASCII que sobrevive al
plegado** ordena después de la Z: la `ñ` y también los diacríticos de otros idiomas
(`plegarTexto('Père Goriot') === 'père goriot'`, `plegarTexto('Camões') === 'camões'`). Y no hace
falta que la letra sea la inicial, basta que sea la decisiva: en español `ñ` va entre `n` y `o`, así
que `"Cabaña"` debería preceder a `"Cabaret"` y con `BINARY` va después.

**Por qué el código no tiene la culpa, y por qué igual es un FAIL.** AC-06 **no** dice «en español»:
dice «tratando como iguales las mayúsculas y los acentos», y eso se cumple y está probado. La spec
nunca menciona colación y su lista de tests del Bloque 4 nunca pide un caso con `ñ`. El código es
fiel a la spec aprobada. Lo que falla es que **FR-04 promete por escrito algo que ningún AC exige y
que nadie implementó** — una brecha que la validación del PRD no atrapó porque F-PRD-01 comprueba
que cada FR tenga *algún* AC, no que los AC cubran cada cláusula del FR.

**Decisión tomada y por qué no se resuelve acá.** El grafo de transiciones
(`.daw/rules/transition-graph.json`) admite desde VERIFY únicamente `VERIFY→CODE` y
`VERIFY→RELEASE`: **no hay camino de vuelta a DEFINE**, que es la única fase donde un PRD se
modifica. Sólo PLAN tiene ese bucle. Por lo tanto la enmienda de FR-04 **no puede ocurrir dentro de
FEAT-001a** y se reparte así:

1. Este reporte deja escrito el hueco, medido, con su alcance real. FEAT-001a no ship con un PRD que
   promete el orden en español en silencio: lo promete con un cartel al lado.
2. La enmienda de FR-04 y la implementación del ordenamiento en español son el **primer acto del
   ticket nuevo**, en su fase DEFINE.

**Nota de oportunidad para ese ticket, que conviene no perder:** FEAT-001a es el ticket que crea el
esquema desde cero, así que declarar la colación o agregar una columna de orden **hoy** no necesita
migración de datos. Después de que la librera cargue su inventario real, sí — y el resguardo del
archivo está fuera de alcance del producto (PRD-001 §7).

---

## Divergencias spec↔código — 6, todas correctas, todas a enmendar en la spec

Las tres primeras se registraron durante CODE; las tres últimas las encontró esta verificación.

| # | Divergencia | Dictamen |
|---|---|---|
| 1 | `parsearPrecio("-5")` → `fuera_de_rango` y `"-1.234"` → `separador_miles`, donde la prosa de la regla 5 daría `no_numerico` | **Correcta.** La spec se contradice: su prosa daría `no_numerico`, su test obligatorio n.º 12 exige `fuera_de_rango`. Se resolvió a favor del test, y por dos razones independientes: el test es el compromiso más específico, y el motivo es **el verdadero** — un negativo *es* numérico, sólo está fuera de rango, y reportarlo como no numérico es informar un motivo falso (Principio II) |
| 2 | `PRECIO_MAXIMO = Number.MAX_SAFE_INTEGER`, techo que la spec no fija | **Correcta.** No es un techo de negocio inventado: es el de representación exacta, y devolver `ok` con un entero que perdió precisión sería inventar un precio. Probado por los dos lados. **Consecuencia menor:** el mensaje de UI de `precio.fuera_de_rango` dice «tiene que ser mayor que 0», que es falso en la rama del techo |
| 3 | La spec escribe la búsqueda con un `?1` en las dos comparaciones `LIKE`; el código usa dos `?` con el mismo valor | **Correcta y única traducción posible.** better-sqlite3 trata `?1` como parámetro nombrado y rechaza atarlo por posición (`Too many parameter values were provided`) |
| 4 | La spec lista `lib/db/migraciones/001-inicial.sql`; el código tiene `001-inicial.ts` con el SQL inlineado | **Correcta, y refuerza la mitigación 4.** Un `readFileSync` desde `process.cwd()` haría que el esquema dependa del directorio de arranque, que el `.sql` no viaje al empaquetar, y que un directorio preparado por un tercero pueda inyectar su propio esquema. Probado (`no lee el SQL del sistema de archivos`) |
| 5 | Script `lint`: la spec dice `next lint`, el código tiene `eslint .` | **Correcta: la spec está mal.** `next lint` no existe desde Next 16, y `AGENTS.md` ya documenta `eslint .` |
| 6 | `test` delega en `test:cov`; la spec los declara separados | **Correcta y más estricta que lo pactado:** hace que los umbrales muerdan en `npm test` y no sólo en `test:cov`. Hay un test que lo protege |

---

## Límite conocido de la identidad del catálogo

**Verificado de punta a punta.** `normalizarTitulo()` mueve el artículo pospuesto con un patrón
anclado en `$` y quita la puntuación *después*, tal como la spec lo especifica. Consecuencia:

```
"El Principito"    → "el principito"
"Principito, El"   → "el principito"
"Principito, El."  → "principito el"   ← otra identidad
```

Dar de alta `"El Principito"` y después `"Principito, El."` devuelve `ok: true` **las dos veces** y
deja dos filas: el `UNIQUE` no lo impide porque son dos claves distintas.

**Requisito de entrada para FEAT-001b**, que es donde el pegado sucio llega en volumen:

- **Excel de precios:** una fila `Principito, El.` no matchea el libro cargado y se reporta como no
  encontrada. Es el comportamiento correcto y visible. Daño: fricción.
- **Excel de alta masiva:** es el caso serio. La fila entra como libro nuevo, con su propio stock,
  precio e historiales. Queda **el mismo libro dos veces** en el inventario, con dos ids, y las
  actualizaciones de precio se reparten entre los dos según cómo esté escrita cada fila. No se
  detecta al ojo en 2.000 títulos, y no hay forma de fusionarlos sin borrar historial, que el
  Principio III prohíbe.

El PRD de FEAT-001b tiene que llevarlo como requisito explícito: normalizar la puntuación terminal
antes de calcular la identidad, o un paso de detección de casi-duplicados en la previsualización del
alta masiva.

---

## WARNs

| ID | Hallazgo |
|---|---|
| W-VER-04 | **AC-04 sin test de punta a punta.** El AC pide interpretar `"1234,00"` como 1234 **y aplicar el alta**. La primera mitad está probada en unidad; ningún test da de alta un libro con precio en forma decimal. Si alguien agregara un `ENTERO.test()` sobre `precio` antes de `parsearPrecio()`, el alta con coma se rompería y la suite seguiría verde |
| W-VER-02 | `lib/db/migrar.ts` en la banda 80-90 % (88,88 L / 83,33 R / 66,66 F), y es lógica de arranque. La línea sin cubrir es el `throw` del `Number.isInteger()`, o sea **la única guardia de la única interpolación SQL del proyecto no tiene test** |
| W-VER-05 | `lib/db/conexion.ts:49` sin cubrir: es el `return cacheada` de `obtenerDb()`, o sea **el camino de acierto del singleton no se ejercita nunca**. El caché en `globalThis` es una decisión que la spec justifica (que el HMR no filtre un handle por recarga) y ningún test la sostiene |
| W-VER-06 | **`lib/db/errores.ts` sin guardia de «se mantiene sólo de tipos».** Es el único módulo de `lib/db/` sin `import 'server-only'`, la excepción está documentada, y `app/mensajes.ts` depende de ella. Nada impide que mañana alguien le agregue un `export const`: en ese momento un Client Component (`formulario-alta.tsx` → `mensajes.ts` → `errores.ts`) empieza a arrastrar código de servidor. Los 7 guardias de `server-only` que existen no tienen esta contraparte |
| W-VER-01 | Sin código muerto ni imports sin usar (`no-unused-vars` activo y limpio) |
| W-VER-03 | **Sin tests frágiles**, buscado expresamente: cada test abre su `:memory:` en `beforeEach`, el estado global se restaura en `afterEach`/`finally`, los directorios temporales llevan el pid, la siembra es determinista sin `Math.random()` ni reloj, el bench compara contra una medición de control y no contra un número absoluto de máquina, y los `spawnSync` llevan `timeout` y `killSignal` |
| W-VER-07 | El reporte SAST cita dos referencias de línea desactualizadas (el test de escapado XSS y los parámetros de `consultas.ts`). Los hallazgos son correctos; los punteros drifted. Un reporte de seguridad se lee por sus punteros |
| W-VER-08 | `scripts/sembrar-catalogo.ts` es un fixture de test que vive en `scripts/` y queda fuera del `include` de cobertura. La ruta la fija la spec, así que corregirlo es enmienda de spec |
| W-VER-09 | `test/app/acciones.test.ts` agrupa 7 `describe` bajo un nombre que promete uno. La ruta la fija la spec |

---

## Refactors diferidos — 9, todos tocan archivos de bloques ya commiteados

1. **`FilaLibro` y `aLibro()` duplicados palabra por palabra** entre `lib/db/libros.ts:106-137` y
   `lib/db/consultas.ts:72-103`, más la lista de columnas repetida en 4 sentencias. El `as
   FilaLibro[]` apaga al compilador: una columna nueva agregada en un archivo y olvidada en el otro
   sale `undefined` en un campo que el tipo declara obligatorio, sin error de compilación ni test
   rojo. **Mitigado por dos guardias** —el de `PRAGMA table_info(libros)` y los `toEqual` del objeto
   `Libro` completo—, con dos huecos: el guardia compara sólo `name` y descarta `type`, y vive en
   `consultas.test.ts` con un comentario como única señal hacia las otras copias. Es un cable
   trampa, no una deduplicación. La corrección de fondo es un único `FilaLibro` con `satisfies` en
   vez de `as`.
2. Unificar la cota de 300, hoy en **7 lugares** con **2** nombres de identificador
   (`LARGO_MAXIMO_TEXTO` ×3, `LARGO_MAXIMO_TERMINO` ×2) más 2 literales en el DDL. La de stock, en 3
   lugares con dos grafías (`1_000_000` y `1000000`).
3. Extraer `validarTexto`/`interpretarEntero`/`validarStock` a `lib/dominio/` (son puras).
4. **Memoizar las sentencias preparadas.** `crearLibro()` prepara 5 por alta; 2.000 altas del Excel
   masivo de FEAT-001b son 10.000 `prepare()`. Medido: hoy no es un problema (la siembra completa
   entra holgada en la suite), pero conviene tenerlo hecho **antes** del alta masiva.
5. Atar los literales del test de esquema a las constantes.
6. Unificar la guardia de `server-only` y agregarle la dirección inversa.
7. Renombrar `lib/db/errores.ts`: exporta también la variante `{ ok: true; libro }` de
   `ResultadoCrearLibro`, así que el nombre es un poco falso. **La spec nombra ese archivo.**
8. Reforzar la guardia anti-interpolación de `libros.test.ts`, que filtra por líneas con palabras
   clave SQL (la de `consultas.test.ts` ya está endurecida y puede servir de modelo).
9. Bandera `u` asimétrica entre los guardias de `server-only`: `libros.test.ts:523` usa
   `/^import .*$/m`, `consultas.test.ts:371` usa `/^import .*$/mu`.

---

## Nota sobre la evidencia TDD

El verificador señaló, con razón, que **la evidencia de test-first no vive en ningún archivo del
repo**: los commits traen tests e implementación juntos —que es lo esperable de un commit por
bloque— y eso no distingue el orden en que se escribieron. Una suite verde se ve idéntica en los dos
casos.

Estado real, dicho con precisión:

- **Bloques 4 y 5: evidencia de primera mano.** Bloque 4, 16/16 tests en rojo antes de la
  implementación, con la aserción de cada uno, más un test corregido porque pasaba contra el
  esqueleto. Bloque 5, 20 rojos con aserción contra implementaciones triviales, más una batería de
  atajos aplicados a cada guardia para comprobar que se pone rojo.
- **Bloques 1 a 3: no verificable en esta ronda.** Se implementaron en sesiones anteriores y pasaron
  por sus revisiones de bloque entonces, pero sus reportes no están en el contexto de esta
  verificación.

Lo que sí es observable desde el disco es la **forma** de los tests, que es la de tests escritos
para fallar: fixtures elegidos porque el obvio no discrimina (`"Cuentos, Los"` en vez de
`"El Principito"`), meta-guardias que verifican que los guardias miraron algo, una medición de
control en el benchmark para que no pueda dar verde midiendo de menos. No es evidencia; es
congruencia.

---

## Disposición de la ronda 1

**Bucle correctivo a CODE**, por el FAIL 1 únicamente. Se limpian los gates `tests`, `sast` y
`verify`: el arreglo tiene que reganarlos.

| FAIL | A dónde va |
|---|---|
| 1 · Mitigaciones 1 y 6 sin test | **CODE**, en esta ronda: test de convención sobre `package.json` y `next.config.ts` |
| 2 · FR-04 no es «en español» | **Ticket nuevo**, en su fase DEFINE. El grafo no admite `VERIFY→DEFINE`, así que la enmienda del PRD no puede ocurrir dentro de FEAT-001a |

---

## Ronda 2 — 2026-08-11 — **PASSED**

Alcance acotado al arreglo del FAIL 1: `test/convenciones/red.test.ts` (7 tests), cero líneas de
producción. **14 mutaciones, 12 en rojo.**

**FAIL 1 cerrado.** El revisor aplicó las tres que reportó el implementador más once propias
(`-H 0.0.0.0`, `-H localhost`, `-H127.0.0.1` sin separador, reemplazo del runner por
`node servidor.js`, la clave computada `['allowed'+'Origins']`, y el vaciado de los tres ayudantes).
Los tres meta-guardias aguantan: si `sinComentarios()`, `tieneClave()` o `hostsDe()` se vacían, el
test se pone rojo — la aserción negativa **no** puede pasar en silencio.

Los dos guardias de la mitigación 6 **no son redundantes, y está probado**: una clave computada evade
el textual y la caza el estructural; una clave en una rama que el entorno de test no evalúa evade el
estructural y la caza el textual. Cada uno cubre el punto ciego del otro.

**FAIL 2: disposición aceptada**, fundada en reglas y no en incomodidad — F-VER-01 se satisface (AC-06
no dice «en español»), F-VER-02 y F-VER-06 también (la spec no declara `COLLATE`, así que el código
es fiel a lo aprobado y la brecha nació en DEFINE/PLAN), y el grafo hace la enmienda mecánicamente
imposible dentro del ticket: «un veredicto que no se puede ejecutar no es un veredicto».

**Condición de secuencia que el revisor agregó, fundada en la sección *Rollback* de la spec:** el
ordenamiento en español es una migración de esquema. Hecha hoy, sobre una base vacía, cuesta lo que
costó la migración 001. Hecha después de que la librera cargue su inventario, cae bajo la cláusula que
la spec ya escribió — migración sobre el activo, sin resguardo automático y sin copia a la que volver
(PRD-001 §7). **El ticket nuevo tiene que cerrarse antes de que la aplicación entre en uso real**, y
eso va en su PRD como dependencia, no como recordatorio.

### WARNs de la ronda 2

| ID | Hallazgo | Disposición |
|---|---|---|
| W-VER-08 | **La mitigación 1 sólo vigilaba dos nombres de script.** Agregar `"dev:red": "next dev -H 0.0.0.0"` dejaba la suite en 158/158 verde: una app **sin autenticación** escuchando en toda la red de la librería, o sea el riesgo R1 con su control compensatorio desactivado. El guardia hacía lo que la mitigación dice; la mitigación dice menos de lo que hace falta | Cerrada en la ronda 3 |
| W-VER-09 | `allowedDevOrigins: ['*']` no lo veía ningún guardia, y `tsc` lo acepta: es clave real de Next 16, vecina de la que la mitigación 6 nombra. **No es un hueco de la mitigación 6** sino una superficie que el threat model no analizó porque no existía cuando se escribió | Cerrada en la ronda 3 |
| W-VER-10 | El archivo nuevo no mueve los números de cobertura porque el `include` es `lib/**` + `app/**`. Correcto —es un test— pero se anota para que la coincidencia exacta no se lea como que la suite no cambió: pasó de 151 a 158 tests | Sin acción |

---

## Ronda 3 — 2026-08-11 — **PASSED**

Alcance: el cierre de W-VER-08 y W-VER-09. **32 mutaciones.**

**W-VER-08 cerrada sin perder la mitad vieja**, que era el riesgo real de invertir la aserción: nueve
mutaciones rojas, incluido el borrado de la bandera de `dev`. Sobrevive porque el meta-guardia exige
que `dev` y `start` estén **dentro** del conjunto vigilado, así que un detector que devolviera vacío
no aprueba el borrado — se pone rojo por la pertenencia. El revisor agregó la prueba que faltaba: el
**ciclo** (`dev: "npm run dev"`, que se esconde del detector porque el corte de ciclos deja la
referencia sin expandir) también sale rojo, y por el meta-guardia.

El implementador encontró por su cuenta un caso que no estaba en el encargo: **la delegación**
(`npm run dev -- -H 0.0.0.0` no contiene la cadena `next dev`). Funciona en profundidad, con dos
niveles.

**W-VER-09 cerrada en los dos guardias.** El estructural pasó de preguntar por un nombre a enumerar
las claves anidadas y filtrar por familia (`/^allowed\w*Origins$/`), que es lo que cubre la variante
con clave computada de la clave nueva.

**Corrección de la caracterización del límite residual, medida y no supuesta:** con la variable de
entorno que la activa presente en la corrida, el guardia estructural **sí** caza la intersección de
clave computada + rama condicional. No es un punto ciego absoluto sino **relativo al entorno de la
suite**, y el escenario de explotación exige escribir la ofuscación, desplegar con la variable puesta
y no correr nunca los tests con ella.

### WARNs de la ronda 3

| ID | Hallazgo | Disposición |
|---|---|---|
| W-VER-11 | **Falso positivo real.** `BANDERA_DE_HOST` capturaba `(\S+)` y `\S` se come la comilla: con `start-server-and-test 'npm run dev' 3000 'playwright test'` el host salía `127.0.0.1'` y el guardia afirmaba *«el script e2e no fija exactamente un host al loopback»* sobre un script que **sí** lo fija. Familia entera de runners afectada (`start-server-and-test`, `concurrently`, `wait-on`), y la spec ya agenda la medición con navegador para FEAT-001c. Un rojo que dice lo contrario de lo que pasa, en el guardia que respalda el único control que reemplaza a la autenticación, es el camino más corto a que alguien lo borre | **Cerrada en la ronda 4** por decisión del usuario |
| W-VER-12 | Un script que sólo **menciona** el comando (`"ayuda": "echo 'usa npm run dev…'"`) sale rojo: el detector no distingue invocación de mención | **Abierta a propósito.** Falla cerrado, es improbable, y distinguirlas pide entender la sintaxis del shell — no es un token y traería sus propios falsos positivos |
| W-VER-13 | La delegación sólo se resolvía para `npm`: `\bnpm` no matchea dentro de `pnpm` (entre `p` y `n` no hay frontera de palabra), y `yarn` no usa `run`. Severidad baja — el repo declara npm y commitea `package-lock.json` | Cerrada en la ronda 4 |

---

## Ronda 4 — 2026-08-11 — **PASSED**

Alcance: dos tokens. **41 mutaciones, y la primera ronda en la que la mutación no encuentra nada.**

```ts
BANDERA_DE_HOST     = /(?:-H|--hostname)[=\s]+['"]?([\w.:[\]-]+)['"]?/gu
REFERENCIA_A_SCRIPT = /\b(?:p?npm|yarn)\s+(?:run\s+)?([\w:-]+)/gu
```

**El `['"]?` no estaba en la corrección prescrita, y hacía falta.** Con la clase acotada a secas,
`-H "127.0.0.1"` queda **sin captura** —el separador consume el espacio, la clase no admite la
comilla— y el guardia reproduce el mismo falso positivo por la otra puerta. El implementador lo
detectó, lo resolvió y lo declaró como desvío; el revisor lo confirmó por mutación.

**Sin falso negativo, que era el riesgo del arreglo.** Las dos direcciones verificadas: 4 casos verdes
(el runner entrecomillado en las dos formas de comilla, y el host correcto entrecomillado) y **6 rojos
con el host malo dentro de las comillas**, incluidos el doble `-H` con las dos entre comillas y la
delegación desde comillas a un script mal atado. Las tres formas quedaron clavadas como aserciones
literales del meta-guardia del extractor, así que un patrón que dejara de leer dentro de las comillas
se pone rojo ahí antes de poder aprobar nada.

**Ningún agujero viejo reabierto:** diez mutaciones de rondas anteriores, las diez rojas. **Cero falsos
positivos** sobre ocho scripts realistas, elegidos para morder los dos ejes que se ensancharon
(comillas y gestores de paquetes).

**Efecto lateral a favor, ahora probado:** los corchetes que se agregaron por IPv6 hacen que el guardia
vea los comodines IPv6 — `-H [::]` y `-H ::`, equivalentes de `0.0.0.0`, salen rojos.

`-H [::1]` sale rojo **y queda como decisión documentada**: es loopback, pero la mitigación nombra
`127.0.0.1`, un guardia que acepte un conjunto de hosts «equivalentes» tiene que acertar en la
equivalencia —y este archivo ya documenta un caso donde la intuición falla, `localhost`, que resuelve
por DNS—, y los costos son asimétricos: fallar cerrado sobre un valor seguro cuesta un rojo con el
comando en el mensaje; fallar abierto cuesta exposición silenciosa.

### WARN de la ronda 4

| ID | Hallazgo | Disposición |
|---|---|---|
| W-VER-14 | **Cosmético.** Para `[::1]` el mensaje dice «no fija exactamente un host **al loopback**», y `[::1]` *es* loopback: el mensaje contradice el hecho, que es la forma del defecto que la ronda 3 vino a arreglar. Se corrige cambiando una palabra («en `127.0.0.1`»), no la regla | Abierta. Puede viajar con el próximo cambio que toque el archivo |

---

## Veredicto final

**PASSED.** Gate `verify` satisfecho.

| Regla | Resultado |
|---|---|
| F-VER-01 · cada AC con test que pasa | ✅ 11/11 |
| F-VER-02 · cada bloque implementado | ✅ 5/5 |
| F-VER-03 · cobertura ≥ 80/80/80 | ✅ 97,81 / 95,45 / 95,55 |
| F-VER-04 · caminos tristes | ✅ 20 funciones con entrada, todas con caso inválido |
| F-VER-05 · lint y type checker | ✅ |
| F-VER-06 · tests de la spec | ✅ 61/61 |
| Condición 8 · las 9 mitigaciones con respaldo | ✅ |

**Suite: 158 tests en 11 archivos.** Cuatro rondas de verificación, 87 mutaciones acumuladas sobre el
guardia de red, y la lectura que el revisor dejó escrita: las cuatro rondas encontraron algo **en el
borde** de lo que el guardia declaraba vigilar y nunca en su centro, y el borde se fue angostando —
ronda 1 un control compensatorio sin ninguna red, ronda 2 un guardia que vigilaba dos nombres en vez
de la propiedad, ronda 3 un falso positivo que iba a morder al ticket siguiente, ronda 4 nada. El
único defecto de la última ronda lo encontró y corrigió el propio implementador antes de que el
revisor llegara.

### Lo que queda abierto, con nombre y disposición

| # | Qué | A dónde va |
|---|---|---|
| 1 | **FR-04 · ordenamiento en español.** El orden es la colación `BINARY`: todo carácter no-ASCII que sobrevive al plegado cae después de la Z, y basta que sea la letra decisiva | **Ticket propio**, con la enmienda de FR-04 como primer acto de su DEFINE. **Antes de que la librera cargue su inventario real**, por la cláusula de *Rollback* de esta spec |
| 2 | **Límite de identidad de `"Principito, El."`** — el mismo libro puede entrar dos veces y el `UNIQUE` no lo impide | **Requisito de entrada de FEAT-001b**, cuyo Excel de alta masiva es donde el pegado sucio llega en volumen |
| 3 | Las **6 divergencias spec↔código** | Enmienda de la spec |
| 4 | Los **9 refactors diferidos** | Candidatos de FEAT-001b. El de riesgo concreto es `FilaLibro`/`aLibro()` duplicados |
| 5 | **Enmienda del texto de la mitigación 1** del threat model, que nombra dos scripts donde el guardia ya vigila la propiedad | Próxima revisión del threat model (artefacto de PLAN) |
| 6 | W-VER-12 y W-VER-14 | Abiertas, registradas, sin acción |
