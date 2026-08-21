# Threat Model — FEAT-001c: Portadas

| Campo | Valor |
|---|---|
| Ticket | FEAT-001c |
| Tier | FEATURE |
| Fecha | 2026-08-20 |
| PRD | `docs/daw/prd/prd-FEAT-001c.md` |
| Metodología | STRIDE (F-TM-01 a F-TM-07 de `.daw/rules/validation-rules.instructions.md` §3) |
| Antecedente | `threat-FEAT-001a.md` y `threat-FEAT-001b.md` — este modelo los continúa, no los repite |
| Resultado | **PASSED** — todo riesgo CRÍTICO/ALTO tiene mitigación incorporada a la spec |

---

## 1. Arquitectura analizada

Se analiza el diseño concreto de FEAT-001c (F-TM-06), tal como quedó después del chequeo de impacto
y de la auditoría de arquitectura. Lo que FEAT-001a/b ya modelaron sigue vigente y no se re-analiza;
acá van los componentes **nuevos o modificados**.

| ID | Componente | Novedad |
|---|---|---|
| D11 | `lib/portadas/ruta.ts` | **Nuevo.** Resuelve `data/portadas/` bajo la raíz del proyecto, con `PUENTES_PORTADAS_PATH` como variable de entorno opcional — mismo propósito que `lib/db/ruta.ts` (`rutaDb()`). |
| D12 | `lib/portadas/almacenamiento.ts` | **Nuevo.** `procesarPortada()` decodifica con `sharp` bytes que llegan del navegador, valida el formato real, redimensiona a 96 px (`fit: 'contain'`) y reencodea a JPEG. `guardarPortadaProcesada()` escribe atómicamente (temporal + rename). `quitarPortada()`, `leerPortada()`, `tienePortada()`. Es la primera vez que el proyecto decodifica un blob binario arbitrario del navegador con una librería nativa de terceros. |
| D13 | `app/acciones-portada.ts` | **Nuevo.** Server Actions `asignarFoto`/`quitarFoto`, mismo patrón M1/M3 que `app/acciones-libro.ts`. |
| D14 | `app/portadas/[id]/route.ts` | **Nuevo.** Route Handler GET. Primera superficie del proyecto que responde con bytes de un archivo del disco en vez de HTML/JSON armado por el proyecto. |
| D15 | `app/acciones.ts` (`altaDeLibro`) | **Modificado.** Ahora puede recibir un `File` y llamar a `procesarPortada()` antes de `crearLibro()`. |
| D16 | `sharp` (dependencia npm) | **Nuevo.** Módulo nativo (como `better-sqlite3`), envuelve `libvips`. |
| D17 | `formulario-alta.tsx`, `formulario-portada.tsx` (nuevo), `detalle-libro.tsx`, `listado-libros.tsx` | **Modificados/nuevo.** Presentación; ningún texto de usuario nuevo se inyecta en el DOM (el `src` de la imagen se arma siempre con el id entero). |

### Fronteras de confianza (F-TM-02)

TB-1 a TB-5 se heredan de `threat-FEAT-001a.md`/`threat-FEAT-001b.md`. Tres se **extienden** y se
agrega una nueva:

| ID | Frontera | Extensión / novedad |
|---|---|---|
| TB-1 | Navegador → servidor Next | Se reafirma para `asignarFoto` y `quitarFoto` (D13): son endpoints HTTP invocables directamente, sin pasar por la pantalla. |
| TB-3 | Proceso Node → sistema de archivos | Se extiende a `data/portadas/` (D11), directorio nuevo con el mismo criterio de confinamiento que `data/puentes.db`. |
| TB-4 | Registro npm → build local | Se extiende: segunda dependencia nativa (`sharp`/`libvips`, D16) con su propio binario precompilado en la instalación. |
| TB-5 | Navegador → segmento de URL `[id]` → dato interno | Se extiende: `/portadas/[id]` (D14) es el segundo consumidor de este patrón, además de `/libros/[id]`. Debe reusar `identificadorDeLibro()`, no una segunda validación. |
| **TB-6** | Navegador → bytes de archivo subido → decodificador nativo (`sharp`/`libvips`, D12) | **Nueva en el proyecto.** Hasta ahora toda entrada no confiable era texto validado campo por campo o un id entero. Acá es un blob binario arbitrario cuyo contenido lo interpreta un parser en C/C++ fuera del control del proyecto — la superficie de mayor riesgo de este sub-ticket. |

### Clasificación de datos (F-TM-05)

| Dato | Clasificación | Cifrado |
|---|---|---|
| Foto de portada (JPEG reencodeado, 96 px) | **Comercial interno**, mismo criterio que el resto del inventario (título, editorial, precio, stock). No es un dato sobre una persona: es la tapa de un libro. | No aplica F-TM-07. Cae bajo el riesgo aceptado **A2** (heredado): archivo sin cifrar, resguardo manual a cargo de la usuaria — igual que `data/puentes.db`, ahora también `data/portadas/`. |
| Metadatos EXIF del archivo original (GPS, fecha, dispositivo) | **Potencialmente sensible si se preservara** — ver **R18**. El diseño los descarta al reencodear, así que no llegan a persistir. | No aplica: se eliminan antes de guardar (M17). |
| Datos personales de clientes | Sin cambios respecto de FEAT-001a/b: no existen. | — |
| Credenciales, tokens, claves | No existen. | — |

F-TM-07 se satisface por ausencia una vez aplicada M17: sin ella, el EXIF preservado podría contener
coordenadas GPS, que sí serían PII. La mitigación no es opcional para mantener esta clasificación.

---

## 2. Análisis STRIDE por componente (F-TM-01)

### D11 — `lib/portadas/ruta.ts`

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No aplica. |
| **T** Tampering | `PUENTES_PORTADAS_PATH` es una variable de entorno, no una entrada de red — pero si su resolución no valida el escape de la raíz del proyecto de la misma forma que `rutaDb()` (mitigación 5 de FEAT-001a), una configuración de despliegue equivocada (o dos implementaciones que divergen con el tiempo) podría dejar leer/escribir fuera del proyecto. **R13.** |
| **R/I/E** | No aplican: es resolución de ruta, sin E/S propia. |
| **D** Denial of Service | No aplica. |

### D12 — `lib/portadas/almacenamiento.ts`

| Categoría | Análisis |
|---|---|
| **S** Spoofing | Sin identidad que suplantar (A1). |
| **T** Tampering | (a) **Pixel/decompression bomb**: un archivo pequeño que declara dimensiones enormes fuerza a `sharp` a reservar memoria desproporcionada al decodificar. **R14.** (b) **Vulnerabilidad de memoria en el decodificador nativo** (`libvips`) ante un archivo deliberadamente malformado. **R15.** (c) Traversal por el id: cerrado por diseño — el nombre de archivo es siempre `identificadorDeLibro(id) + '.jpg'`, nunca deriva del nombre original subido; no hay mitigación nueva que agregar, sólo mantenerlo así (ver R22). (d) **Escritura concurrente de la misma portada**: si el archivo temporal de `guardarPortadaProcesada()` usa un nombre fijo por id, dos reemplazos simultáneos pueden pisarse entre el `write` y el `rename`. **R16.** |
| **R** Repudiation | Mono-usuario, sin atribución (A1). No hay historial de portada — y es correcto: FR-04 pide exactamente que esta operación no escriba historial. El `mtime` del archivo es el único rastro de cambio, y alcanza para invalidar caché (D14). |
| **I** Information Disclosure | (e) Un fallo de infraestructura (disco lleno, permisos) no debe propagar texto del motor ni la ruta absoluta del archivo. **R17.** (f) **EXIF con metadatos de ubicación**: si el reencodeo preservara los metadatos originales (`sharp` los descarta por defecto salvo que se llame `withMetadata()`), una foto tomada con el celular podría filtrar dónde se sacó. **R18.** |
| **D** Denial of Service | (g) Archivo subido sin límite de tamaño agota memoria o disco antes incluso de llegar a `sharp`. **R19.** |
| **E** Elevation of Privilege | No aplica. |

### D13 — `app/acciones-portada.ts`

| Categoría | Análisis |
|---|---|
| **S** Spoofing | A1. |
| **T** Tampering | Reafirma TB-1: es un POST invocable directamente, sin pasar por el formulario. El id debe validarse con la misma `identificadorDeLibro()` que venta y edición — no una validación paralela. **R20.** |
| **R** Repudiation | Igual que D2/D3 de FEAT-001b: mono-usuario, sin atribución (A1). |
| **I** Information Disclosure | Mismo patrón M8: los catches de infraestructura no propagan el error del motor ni el contenido del `FormData`. |
| **D** Denial of Service | Un POST repetido en bucle reescribe el archivo de portada sin límite de tasa. Alcance: quien ya llega al puerto local (A1). Bajo — mismo criterio que R2/D2 de FEAT-001b. |
| **E** Elevation of Privilege | No aplica. |

### D14 — `app/portadas/[id]/route.ts`

| Categoría | Análisis |
|---|---|
| **S** Spoofing | No aplica. |
| **T** Tampering | Mismo patrón que TB-5: el `[id]` debe validarse con `identificadorDeLibro()`, no con una segunda implementación más floja. **R21** (mismo cierre que R20, dos sitios). |
| **R** Repudiation | Sólo lectura, nada que repudiar. |
| **I** Information Disclosure | (i) **Es la única superficie del proyecto que responde con bytes de un archivo del disco.** Hoy el nombre servido sale siempre de un entero validado — nunca de un dato adicional de la request (nombre original, extensión declarada por el navegador). Si un cambio futuro erosionara ese invariante, este endpoint podría servir el contenido de cualquier archivo legible por el proceso (path traversal, CWE-22). **R22 — el de mayor impacto potencial del sub-ticket.** (j) El `Content-Type` de la respuesta debe ser la constante `image/jpeg` (el formato de salida es siempre JPEG por construcción), nunca inferido; sin `X-Content-Type-Options: nosniff`, un navegador antiguo podría interpretar la respuesta por sniffing. **R23.** |
| **D** Denial of Service | Cada fila del listado *con* foto golpea este handler (las filas *sin* foto se resuelven contra el asset estático, sin pasar por acá — ver Block 4 del plan). Es una lectura de disco simple, sin decodificar con `sharp` en el camino de lectura: el resize ya ocurrió al guardar. Costo bajo, ya contemplado en la interpretación de NFR-01 acordada. Sin mitigación nueva. |
| **E** Elevation of Privilege | No aplica. |

### D15 — `app/acciones.ts` (`altaDeLibro` modificado)

| Categoría | Análisis |
|---|---|
| **T** Tampering | El orden elegido (`procesarPortada()` antes de `crearLibro()`) evita un libro creado por un intento de alta con foto inválida, pero abre una ventana distinta: si el disco falla al escribir el archivo **después** de que el libro ya se creó con éxito, el libro queda registrado sin foto y sin que la usuaria vea un error — sólo un log de servidor. No es una vulnerabilidad explotable por un tercero (requiere un fallo de infraestructura real), pero es un comportamiento que hay que aceptar formalmente. **A4.** |
| **D** Denial of Service | Acotado por el mismo límite de tamaño de R19: no hay forma de gastar CPU decodificando una imagen fuera de ese presupuesto antes de que el alta la rechace. |
| **S/R/I/E** | Sin novedad respecto del alta ya modelada en FEAT-001a. |

### D16 — `sharp` (dependencia nativa nueva)

| Categoría | Análisis |
|---|---|
| **Supply chain (W-TM-01)** | Mismo patrón que `better-sqlite3` (TB-4 de FEAT-001a): paquete de proveedor reconocido y activamente mantenido, con binario precompilado por plataforma. No se crea una categoría de riesgo nueva — se extiende la misma aceptación de TB-4 (lockfile commiteado, `npm audit` de rutina). |

### D17 — Presentación (`formulario-alta.tsx`, `formulario-portada.tsx`, `detalle-libro.tsx`, `listado-libros.tsx`)

| Categoría | Análisis |
|---|---|
| **I** Information Disclosure | El `src` de cada `<img>` se arma siempre con el id entero del libro (`/portadas/{id}`) o con la ruta fija del asset estático — nunca con texto que la usuaria escribió. No reabre el vector de XSS que la mitigación 9 de FEAT-001a ya prohíbe (inyectar HTML sin escapar). |
| **D** Denial of Service | `listado-libros.tsx` sigue sin `'use client'` — cero JavaScript de cliente por fila (M11 de FEAT-001b se mantiene sin modificación). |

---

## 3. Riesgos y mitigaciones

| ID | Riesgo | STRIDE | Probab. | Impacto | Mitigación |
|---|---|---|---|---|---|
| R13 | `lib/portadas/ruta.ts` no replica la validación de escape de raíz de `rutaDb()` | T | Baja | Alto | **M12** |
| R14 | Pixel/decompression bomb al decodificar con `sharp` | D | Media | Alto | **M13** |
| R15 | Vulnerabilidad de memoria en `libvips` ante un archivo malformado | T | Baja | Crítico (si existiera) | **M14** |
| R16 | Escritura concurrente de la misma portada sin nombre temporal único | T | Baja | Medio | **M15** |
| R17 | Error de infraestructura de `lib/portadas/` expone texto del motor o rutas del disco | I | Media | Medio | **M16** |
| R18 | EXIF (incluida geolocalización) preservado al reencodear | I | Media | Medio | **M17** |
| R19 | Archivo subido sin límite de tamaño agota memoria o disco | D | Media | Alto | **M18** |
| R20 | Id no validado con `identificadorDeLibro()` en `acciones-portada.ts` | T | Baja | Medio | **M19** |
| R21 | Id no validado con `identificadorDeLibro()` en la ruta de servido | T | Baja | Medio | **M19** |
| R22 | Erosión futura del invariante "el archivo servido sale siempre de un id entero" → path traversal | T/I | Baja hoy | **Crítico** si se erosiona | **M20** |
| R23 | `Content-Type` no fijo permite MIME-sniffing | I | Baja | Medio | **M21** |

---

## 4. Riesgos aceptados (F-TM-04)

**A1 — Ausencia de autenticación** y **A2 — Datos sin cifrar y sin resguardo automático** se heredan
de `threat-FEAT-001a.md` §4 sin cambios en su sustancia: mismo aceptante (Nicolás Lodovskis, sobre la
decisión de producto de PRD-001 §6 y §7), misma justificación, mismo control compensatorio
(`127.0.0.1`, resguardo manual) y misma fecha de revisión máxima, **2027-02-07**.

Este sub-ticket agrega `data/portadas/` al alcance de A2 — un directorio nuevo con el mismo criterio
que `data/puentes.db`: sin cifrar, sin resguardo automático, responsabilidad de la usuaria (PRD-001
§7, y explícito en el Risks table de `prd-FEAT-001c.md`). No cambia la clasificación del dato
(comercial interno, no PII), siempre que se aplique **M17** (descartar EXIF).

**A4 — Alta con foto que falla al escribir el archivo, después de crear el libro**

| Campo | Valor |
|---|---|
| Riesgo | Si el disco falla al escribir la portada procesada **después** de que `crearLibro()` ya tuvo éxito, el libro queda registrado sin foto, sin que la usuaria vea un error — sólo queda un log de servidor. |
| Quién lo acepta | Nicolás Lodovskis, en este ticket. |
| Justificación | La alternativa —revertir el alta completa por el fallo de una característica opcional y no crítica— contradice AC-01 ("un alta sin foto debe seguir siendo válida") y deja a la usuaria peor que un libro sin foto corregible después desde el detalle. El fallo requiere un problema real de infraestructura (disco lleno, permisos), no es alcanzable con un `POST` armado a mano. |
| Control compensatorio | El libro sigue siendo válido y editable: la foto se puede asignar después desde el detalle (FR-02), sin perder ningún otro dato. El log de servidor (M16) deja rastro del fallo para quien mantenga la instalación. |
| Condiciones de revisión | Se reevalúa si se agrega una notificación de alta parcial a la usuaria, o si aparecen fallos de escritura de disco recurrentes en uso real. Revisión máxima: **2027-02-12** (misma ventana que A3 de FEAT-001b). |

---

## 5. Mitigaciones a incorporar a la spec

1. **M12 — `lib/portadas/ruta.ts` reusa el mismo helper de confinamiento de ruta que `rutaDb()`**, no
   una segunda implementación. Si `lib/db/ruta.ts` no expone hoy esa lógica como reusable, se extrae
   a un módulo neutral (p. ej. `lib/rutas-confinadas.ts`) del que ambos importan. Cierra **R13**.
   *(Bloque 1)*
2. **M13 — Límite de tamaño de archivo aplicado ANTES de invocar `sharp`**, y el límite de píxeles por
   defecto de `sharp`/`libvips` no se deshabilita ni se aumenta. Cierra **R14**. *(Bloque 1)*
3. **M14 — `sharp` se mantiene en la versión estable más reciente al momento de implementar**, sin
   fijar un rango laxo en `package.json`. No hay mitigación de código posible contra una CVE de
   `libvips` todavía no descubierta; el control es mantener la dependencia al día (W-TM-01). Cierra
   **R15**. *(Bloque 1)*
4. **M15 — El archivo temporal de `guardarPortadaProcesada()` lleva un sufijo único por operación**
   (no un nombre fijo derivado sólo del id), y el `rename()` final es atómico. Dos reemplazos
   concurrentes del mismo libro terminan en last-write-wins sin corromper el archivo. Cierra **R16**.
   *(Bloque 1)*
5. **M16 — Ningún mensaje de `lib/portadas/` expone texto del motor ni rutas del disco.** Extiende la
   mitigación 8 de FEAT-001a: los fallos de infraestructura de portadas devuelven un mensaje curado y
   loguean sin el contenido del buffer de la imagen. Cierra **R17**. *(Bloques 1, 2 y 3)*
6. **M17 — El reencodeo a JPEG NO llama `withMetadata()`.** `sharp` descarta EXIF por defecto; se deja
   un test-guardia que lo afirme explícitamente (buscando la portada de salida sin campos EXIF), para
   que no sea un comportamiento por omisión sin quien lo sostenga. Cierra **R18**. *(Bloque 1)*
7. **M18 — Tamaño máximo de subida explícito** (a fijar en la spec, orden de magnitud ~10-15 MB),
   validado sobre los bytes recibidos antes de pasarlos a `sharp`, y rechazado con el mismo
   `ErrorCampo` (`detalle: 'demasiado_grande'`) que ya contempla el campo `foto`. Cierra **R19**.
   *(Bloques 1 y 2)*
8. **M19 — Todo id de libro que toca `lib/portadas/` se valida con la misma `identificadorDeLibro()`**
   que usan venta, edición y el detalle — nunca una validación paralela, en `acciones-portada.ts` ni
   en la ruta de servido. Cierra **R20** y **R21**. *(Bloques 3 y 4)*
9. **M20 — Invariante explícito y con test-guardia dedicado: el nombre de archivo que sirve
   `app/portadas/[id]/route.ts` sale siempre de `identificadorDeLibro(id)` convertido a
   `{entero}.jpg`, nunca de ningún otro dato de la request** (nombre original del archivo, extensión
   declarada por el navegador, query string). El test afirma la forma del nombre, no sólo que la ruta
   "funcione". Cierra **R22**. *(Bloque 4)*
10. **M21 — `Content-Type: image/jpeg` fijo (constante, no inferida) + `X-Content-Type-Options:
    nosniff`** en la respuesta de `app/portadas/[id]/route.ts`. Cierra **R23**. *(Bloque 4)*

---

## 6. Resultado

```
┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling FEAT-001c — PASSED                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Superficies de ataque identificadas: 7 (D11-D17)         │
│  Fronteras de confianza declaradas: 6 (5 heredadas/       │
│    extendidas + 1 nueva: TB-6)                             │
│                                                          │
│  🔴 CRÍTICO: ninguno actual — R15 y R22 son "crítico si    │
│      se explotara/erosionara", con mitigación preventiva   │
│      ya incorporada (M14, M20)                              │
│  🟠 ALTO:    R14 pixel bomb → M13                           │
│  🟠 ALTO:    R19 archivo sin límite de tamaño → M18         │
│  🟡 MEDIO:   R13 · R16 · R17 · R18 · R20 · R21 · R23        │
│              → M12 · M15 · M16 · M17 · M19 · M21            │
│  🟢 BAJO:    ninguno adicional (R2/enumeración ya cubierto  │
│              por A1, sin cambios)                            │
│                                                          │
│  Riesgos aceptados: A1, A2 (heredados, alcance extendido    │
│    a data/portadas/) · A4 (nuevo)                            │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│  Riesgos: C:0 H:2 M:7 L:0                                 │
│  Mitigaciones a la spec: 10                                │
└─────────────────────────────────────────────────────────┘
```

Todo riesgo ALTO tiene mitigación concreta asignada a un bloque de la spec (F-TM-03), y los dos
riesgos "crítico potencial" (R15, R22) llevan su mitigación preventiva incorporada de entrada en vez
de quedar como riesgo aceptado. Los tres riesgos aceptados (A1, A2 heredados, A4 nuevo) llevan sus
tres campos: quién acepta, justificación y condiciones de revisión (F-TM-04).
