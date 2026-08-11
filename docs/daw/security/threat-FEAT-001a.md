# Threat Model — FEAT-001a: Cimientos y catálogo

| Campo | Valor |
|---|---|
| Ticket | FEAT-001a |
| Tier | FEATURE |
| Fecha | 2026-08-07 |
| PRD | `docs/daw/prd/prd-FEAT-001a.md` |
| Metodología | STRIDE (F-TM-01 a F-TM-07 de `.daw/rules/validation-rules.instructions.md` §3) |
| Resultado | **PASSED** — todo riesgo HIGH tiene mitigación incorporada a la spec |

---

## 1. Arquitectura analizada

Este modelo se aplica al diseño concreto de FEAT-001a, no a una plantilla genérica (F-TM-06):

| ID | Componente | Descripción |
|---|---|---|
| C1 | Navegador | Formulario de alta y listado renderizados en el navegador de la librera. |
| C2 | Server Action de alta | `app/` — recibe el formulario, valida y llama al repositorio. Es un endpoint HTTP real, aunque no se vea como tal. |
| C3 | Server Component de listado | `app/` — ejecuta la consulta de búsqueda/catálogo y devuelve HTML ya renderizado. |
| C4 | `lib/dominio/` | `normalizarTitulo()` y `parsearPrecio()`. Funciones puras, sin E/S. |
| C5 | `lib/db/` | Conexión a SQLite, runner de migraciones (`PRAGMA user_version`) y repositorio de libros con escritura transaccional. |
| C6 | `data/puentes.db` | Archivo SQLite en el disco local. Contiene todo el inventario y los historiales. |
| C7 | Dependencias npm | Next.js, React, `better-sqlite3` (módulo **nativo**, compila en la instalación), Vitest. |

### Fronteras de confianza (F-TM-02)

| ID | Frontera | Por qué es una frontera |
|---|---|---|
| TB-1 | Navegador (C1) → servidor Next (C2, C3) | Todo lo que llega del formulario es entrada no confiable, aunque el único usuario sea la dueña. Un Server Action es un endpoint HTTP invocable directamente. |
| TB-2 | Red local → proceso Node | El servidor escucha en un puerto TCP. Si escucha en todas las interfaces, cualquier dispositivo de la red de la librería lo alcanza — y **no hay autenticación, por decisión de producto** (PRD-001 §6). |
| TB-3 | Proceso Node (C5) → sistema de archivos (C6) | La ruta del `.db` y la lista de migraciones son entradas al proceso. Una ruta construida con datos externos cruza esta frontera. |
| TB-4 | Registro npm (C7) → build local | Código de terceros ejecutándose con los permisos de la usuaria, incluido un módulo nativo con scripts de instalación. |

### Clasificación de datos (F-TM-05)

| Dato | Clasificación | Cifrado |
|---|---|---|
| Título, editorial, precio, stock, historiales | **Comercial interno** — el inventario y los precios del negocio. Su divulgación tiene impacto competitivo, no regulatorio. | No aplica F-TM-07: no es PII ni credenciales. Ver riesgo aceptado A2. |
| Datos personales de clientes | **No existen.** El sistema no registra clientes ni ventas nominadas: el historial de ventas guarda fecha y precio, nada más. | — |
| Credenciales, tokens, claves | **No existen.** No hay login, ni sesiones, ni integraciones externas (PRD-001 §6). | — |

F-TM-07 se satisface por ausencia: no hay dato clasificado como PII ni como credencial en todo el
alcance de este sub-ticket. Se deja escrito en vez de omitido, porque una omisión no se distingue de
un olvido.

---

## 2. Análisis STRIDE por componente (F-TM-01)

### C1 — Navegador

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No hay identidad que suplantar: sistema mono-usuario sin autenticación. Riesgo aceptado A1. |
| **T** Tampering | La usuaria puede alterar el HTML y enviar valores arbitrarios al Server Action. Cubierto por la validación de servidor (R2, R6): el cliente no es una barrera. |
| **R** Repudiation | Sin usuarios no hay atribución posible. Riesgo R8. |
| **I** Information Disclosure | El listado muestra el inventario completo. Es su función; el control es no exponer el servidor (R1). |
| **D** Denial of Service | Pedir el catálogo completo (2.000 filas) repetidamente. Impacto local y acotado; es la vista por defecto del producto. Riesgo R6. |
| **E** Elevation of Privilege | No hay niveles de privilegio que escalar. |

### C2 — Server Action de alta

| Categoría | Análisis |
|---|---|
| **S** Spoofing | Un Server Action se puede invocar desde otro origen. Next.js valida el header `Origin` por defecto; relajar `serverActions.allowedOrigins` rompe esa protección. Riesgo R5. |
| **T** Tampering | Entrada del formulario sin restricción de tipo, longitud ni rango. Riesgos R2 y R6. |
| **R** Repudiation | El alta escribe sus dos entradas de historial con fecha (FR-05, FR-06): queda el qué y el cuándo, no el quién. |
| **I** Information Disclosure | Un error de la restricción `UNIQUE` propagado crudo revela el esquema. Riesgo R10. |
| **D** Denial of Service | Altas masivas automatizadas inflan la base. Acotado por R6 y por el aislamiento de red de R1. |
| **E** Elevation of Privilege | No aplica: no hay privilegios. |

### C3 — Server Component de listado

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No aplica. |
| **T** Tampering | El término de búsqueda entra a una cláusula SQL. **Riesgo R2 — el más importante de este sub-ticket.** |
| **R** Repudiation | Operación de sólo lectura; no modifica nada. |
| **I** Information Disclosure | Devuelve todo el catálogo activo por diseño (FR-04). Controlado por R1. |
| **D** Denial of Service | Un término de búsqueda patológico degrada la consulta. Con 2.000 filas y un índice, el costo es marginal. |
| **E** Elevation of Privilege | No aplica. |

### C4 — `lib/dominio/`

| Categoría | Análisis |
|---|---|
| **S/R/E** | No aplican: funciones puras, sin identidad, sin E/S, sin privilegios. |
| **T** Tampering | `parsearPrecio()` es una frontera de validación: si acepta lo que debe rechazar, corrompe un importe. Mitigado por su batería de tests (AC-04, AC-05). |
| **I** Information Disclosure | No accede a datos. |
| **D** Denial of Service | `normalizarTitulo()` usa expresiones regulares sobre entrada del usuario: una regex con retroceso catastrófico sería un ReDoS. Riesgo R12. |

### C5 — `lib/db/`

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No aplica. |
| **T** Tampering | Toda escritura pasa por acá. La atomicidad (NFR-02) impide estados intermedios: un fallo no deja un libro sin historial. Los `CHECK` del esquema son la última barrera contra un stock o un precio fuera de dominio. |
| **R** Repudiation | Los historiales son **append-only**: no se editan ni se borran (Principio III de `AGENTS.md`). Es el control anti-repudio del sistema. |
| **I** Information Disclosure | El runner de migraciones y la conexión manejan rutas de archivo. Riesgos R3 y R4. |
| **D** Denial of Service | SQLite bloquea el archivo; con un solo proceso no hay contención. |
| **E** Elevation of Privilege | El runner ejecuta SQL arbitrario desde archivos. Riesgo R3. |

### C6 — `data/puentes.db`

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No aplica. |
| **T** Tampering | Cualquiera con acceso al sistema de archivos edita la base con `sqlite3` y evita todas las validaciones. Riesgo aceptado A2. |
| **R** Repudiation | Una edición directa del archivo no deja rastro en ningún historial. Parte de A2. |
| **I** Information Disclosure | Archivo sin cifrar: copiarlo entrega el inventario completo. Riesgo aceptado A2. |
| **D** Denial of Service | Borrar o corromper el archivo destruye el inventario, y no hay backup automático (PRD-001 §7). Parte de A2. |
| **E** Elevation of Privilege | No aplica. |

### C7 — Dependencias npm

| Categoría | Análisis |
|---|---|
| **S** Spoofing | Typosquatting de paquetes. Mitigado por lockfile y nombres verificados. |
| **T** Tampering | Un paquete comprometido altera el comportamiento. Riesgo R7. |
| **R** Repudiation | El lockfile fija exactamente qué se instaló. |
| **I** Information Disclosure | Un paquete malicioso lee el `.db`. Parte de R7. |
| **D** Denial of Service | No aplica en tiempo de ejecución. |
| **E** Elevation of Privilege | `better-sqlite3` es nativo y compila en la instalación: ejecuta código con los permisos de la usuaria. Riesgo R7. |

---

## 3. Riesgos y mitigaciones (F-TM-03)

| ID | Riesgo | STRIDE | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|---|
| **R1** | 🟠 El servidor Next escucha en todas las interfaces. Cualquier dispositivo de la red de la librería abre la app y, sin autenticación, ve el inventario y da de alta libros. | I, T | Alta | Alto | **Fijar el bind a `127.0.0.1` explícitamente** en los scripts `dev` y `start` de `package.json` (`next dev -H 127.0.0.1`). El aislamiento de red reemplaza a la autenticación que el producto decidió no tener. |
| **R2** | 🟠 Inyección SQL en la búsqueda: el término del usuario entra a una cláusula `LIKE`. | T | Alta | Crítico | **Prepared statements con parámetros en el 100 % de las consultas.** Prohibida la concatenación o interpolación de entrada del usuario en SQL, sin excepción. Además, escapar `%` y `_` del patrón `LIKE` con `ESCAPE`. |
| **R3** | 🟡 El runner de migraciones ejecuta SQL desde archivos. Un `readdir` sobre una ruta configurable ejecutaría SQL arbitrario. | E, T | Baja | Crítico | **Lista estática de migraciones importada en el código**, no descubrimiento dinámico de archivos ni ruta configurable. Cada migración se aplica una sola vez, en orden, según `PRAGMA user_version`. |
| **R4** | 🟡 La ruta del `.db` sale de una variable de entorno; sin validar, apunta a cualquier archivo del sistema. | T, I | Baja | Alto | Valor por defecto fijo `data/puentes.db`. Si se permite override, resolver con `path.resolve` y **rechazar toda ruta que quede fuera de la raíz del proyecto**. |
| **R5** | 🟡 CSRF sobre el Server Action de alta si se relaja la validación de origen de Next.js. | S, T | Baja | Medio | No configurar `serverActions.allowedOrigins`. Dejar activa la validación de `Origin` que Next.js trae por defecto, y documentar que no se toca. |
| **R6** | 🟡 Título y editorial sin longitud máxima: filas gigantes que inflan la base y degradan el listado. | D | Media | Medio | **Validación de servidor con allowlist de tipo, longitud y rango**: título y editorial no vacíos y ≤ 300 caracteres, stock entero 0 ≤ n ≤ 1.000.000, precio entero > 0. La validación de servidor es obligatoria; la de cliente es comodidad. |
| **R7** | 🟡 Cadena de suministro: `better-sqlite3` es un módulo nativo con scripts de instalación. | E, T | Baja | Alto | `package-lock.json` versionado, versiones fijadas, y `npm audit` como parte del gate de SAST en CODE (F-SAST-13). |
| **R10** | 🟡 El error de la restricción `UNIQUE` propagado crudo expone nombres de tablas y columnas. | I | Media | Bajo | El repositorio **traduce** el error de constraint a un error de dominio ("ya existe un libro con ese título"), que es además lo que AC-03 pide mostrar. Nunca se propaga el error de SQLite a la interfaz. |
| **R12** | 🟡 ReDoS en `normalizarTitulo()` si usa una expresión regular con retroceso catastrófico sobre un título largo. | D | Baja | Bajo | Expresiones regulares lineales, sin cuantificadores anidados. Acotado además por el límite de longitud de R6. |
| **R8** | 🟢 Sin usuarios no hay atribución: ninguna acción se puede imputar a nadie. | R | — | Bajo | Inherente al diseño mono-usuario. Los historiales append-only de precio y stock dejan el qué y el cuándo, que es lo reconstruible en un sistema de un solo acceso. |
| **R9** | 🟢 XSS a través de títulos y editoriales cargados por la usuaria. | T | Baja | Bajo | React escapa por defecto. La spec **prohíbe `dangerouslySetInnerHTML`** en todo el alcance del ticket. |

## 4. Riesgos aceptados (F-TM-04)

### A1 — Ausencia de autenticación

| Campo | Valor |
|---|---|
| Riesgo | El sistema no tiene login, roles ni sesiones. Quien alcance el proceso opera sin restricción. |
| Quién lo acepta | La propietaria del producto, en PRD-001 §6, confirmado por Nicolás Lodovskis en este ticket. |
| Justificación | Decisión explícita de producto: sistema mono-usuario, de un solo acceso local. No existe un segundo usuario del cual proteger los datos, así que no hay criterio de aislamiento que aplicar. PRD-001 §7 pone la autenticación fuera de alcance. |
| Control compensatorio | R1: el proceso escucha únicamente en `127.0.0.1`. El aislamiento de red hace el trabajo que haría la autenticación. |
| Condiciones de revisión | Se reevalúa si el sistema deja de ser mono-usuario, si se expone fuera de la máquina de la librería, o si se accede desde otro dispositivo. Revisión máxima: **2027-02-07**. |

### A2 — Base de datos sin cifrar y sin resguardo automático

| Campo | Valor |
|---|---|
| Riesgo | `data/puentes.db` es un archivo plano sin cifrar. Copiarlo entrega el inventario completo; editarlo con `sqlite3` evita todas las validaciones sin dejar rastro; borrarlo destruye el inventario y los historiales. |
| Quién lo acepta | La propietaria del producto, en PRD-001 §7 ("riesgo asumido"), confirmado por Nicolás Lodovskis en este ticket. |
| Justificación | El dato es comercial interno, no PII ni credenciales, y el atacante que necesita este ataque ya tiene acceso al sistema de archivos de la máquina de la librería — punto en el que el cifrado a nivel aplicación no agrega nada, porque la clave viviría en la misma máquina. Backup, exportación y restauración están fuera de alcance por decisión de producto. |
| Control compensatorio | Resguardo manual del archivo `.db` a cargo de la usuaria, por fuera del sistema. Cifrado de disco del sistema operativo, si la máquina lo tiene. |
| Condiciones de revisión | Se reevalúa si el sistema pasa a registrar datos de clientes (PII), si la base sale de la máquina de la librería, o si se incorpora el módulo de facturación que PRD-001 §7 hoy excluye. Revisión máxima: **2027-02-07**. |

## 5. Mitigaciones a incorporar a la spec

Estas nueve entran como requisitos de implementación, no como recomendaciones:

1. **Bind a `127.0.0.1`** en los scripts `dev` y `start` de `package.json` (R1).
2. **Prepared statements con parámetros en toda consulta**, sin excepción; prohibida la concatenación de entrada del usuario en SQL (R2).
3. **Escapado de `%` y `_`** en el patrón `LIKE` de la búsqueda, con cláusula `ESCAPE` (R2).
4. **Lista estática de migraciones** importada en el código; sin descubrimiento dinámico ni ruta configurable (R3).
5. **Ruta del `.db` fija por defecto** y, si se permite override, resuelta y confinada a la raíz del proyecto (R4).
6. **No configurar `serverActions.allowedOrigins`**: se conserva la validación de origen por defecto (R5).
7. **Validación de servidor con allowlist** de tipo, longitud y rango en el alta: título y editorial no vacíos y ≤ 300 caracteres, stock entero 0 ≤ n ≤ 1.000.000, precio entero > 0 (R6, R12).
8. **Traducción del error de `UNIQUE`** a un error de dominio; nunca propagar el error de SQLite a la interfaz (R10).
9. **Prohibido `dangerouslySetInnerHTML`** en todo el alcance del ticket (R9).

Y dos que se verifican en el gate de SAST de la fase CODE: `package-lock.json` versionado con versiones fijadas, y `npm audit` sin CVEs Critical/High (R7).

---

```
┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling — PASSED                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Superficies de ataque identificadas: 7                  │
│  Fronteras de confianza declaradas: 4                    │
│                                                          │
│  Riesgos:                                                │
│    🔴 CRITICAL: ninguno                                  │
│    🟠 HIGH: R1 exposición en red · R2 inyección SQL      │
│    🟡 MEDIUM: R3 R4 R5 R6 R7 R10 R12                     │
│    🟢 LOW: R8 repudio · R9 XSS                           │
│    ⚪ ACEPTADOS: A1 sin autenticación · A2 .db sin cifrar │
│                                                          │
│  Mitigaciones a incorporar a la spec: 9 (+2 en SAST)     │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│  Riesgos: C:0 H:2 M:7 L:2 · Aceptados: 2                 │
│  Report: docs/daw/security/threat-FEAT-001a.md           │
└─────────────────────────────────────────────────────────┘
```
