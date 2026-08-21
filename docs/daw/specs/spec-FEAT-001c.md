# Spec FEAT-001c: Portadas

| Field | Value |
|-------|-------|
| Ticket | FEAT-001c |
| PRD | `docs/daw/prd/prd-FEAT-001c.md` |
| Tier | FEATURE |
| Date | 2026-08-20 |
| Spec loops | 0 |
| Threat model | `docs/daw/security/threat-FEAT-001c.md` |

## Summary

El estado "un libro tiene foto o no" no se modela con una columna en `libros`: es puramente el
filesystem (`data/portadas/{id}.jpg` existe o no existe). Todo el código de portadas vive en un
módulo nuevo, `lib/portadas/`, sin ninguna dependencia de `lib/db/` ni de SQL — esto cierra por
construcción el riesgo que el propio PRD señalaba (una foto que desaparece del disco sin que la base
se entere). `sharp` decodifica, valida el formato real y redimensiona a 96 px de lado mayor
(`fit: contain`, sin recortar la tapa); el resultado se guarda ya procesado, así que servir una
portada es una lectura de disco simple, sin decodificar nada en el camino de lectura. Las diez
mitigaciones del threat model entran como requisitos de bloque, no como recomendaciones.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 2 |
| FR-02 | Block 3 |
| FR-03 | Block 3 |
| FR-04 | Block 1 (por construcción: ninguna función de `lib/portadas/` importa `lib/db/` ni ejecuta SQL), Block 2, Block 3 |
| FR-05 | Block 4 |
| FR-06 | Block 1 (el asset), Block 4 (la fila) |
| FR-07 | Block 4 |
| NFR-01 | Estrategia: el redimensionado ocurre una sola vez, al guardar (Block 1) — servir una portada es un `fs.read` de un JPEG ya achicado, sin `sharp` en el camino de lectura. Las filas sin foto apuntan al asset estático `public/logo-puentes-de-papel-96.jpg`, la misma URL para las 2.000, cacheable por el navegador. Se verifica extendiendo `test/rendimiento/listado.bench.test.ts` (mezcla con/sin portada dentro del catálogo sembrado, mismo presupuesto de AC-09) y con un benchmark nuevo y acotado sobre `GET /portadas/[id]` (Block 4) que mide la función exportada directamente, sin servidor HTTP real — mismo molde que el proyecto ya usa para Server Actions. |
| NFR-02 | Estrategia: cada bloque lleva su lista de tests obligatorios, escritos antes de la implementación (Principio I). El umbral de 80 % ya está configurado en `vitest.config.ts`. |

## Dependencies between blocks

Estrictamente secuencial: **1 → 2 → 3 → 4**, con 3 y 4 independientes entre sí una vez cerrado el 1.

- **2 depende de 1**: el alta necesita `procesarPortada()` y `guardarPortadaProcesada()`.
- **3 depende de 1**: la gestión desde el detalle necesita el mismo módulo.
- **4 depende de 1**: el listado y la ruta de servido necesitan `tienePortada()` y `leerPortada()`.
- **3 y 4 no dependen entre sí** y podrían implementarse en cualquier orden, pero comparten el mismo
  `crearLibro()`/`errores.ts` que toca el Block 2, así que van después de ese para no pisarse.

---

## Block 1 — Almacenamiento de portadas

**Files**
- `lib/rutas-confinadas.ts` (new) — extrae de `lib/db/ruta.ts` la lógica de confinamiento a la raíz
  del proyecto (mitigación 5 de FEAT-001a) a una función reusable, p. ej.
  `resolverRutaConfinada(variableDeEntorno: string | undefined, porDefecto: string): string`, que
  lanza el mismo error si la ruta resuelta se escapa de `process.cwd()`. Sin `import 'server-only'`
  propio: no toca ningún recurso, sólo calcula un `path`; lo heredan quienes la llaman.
- `lib/db/ruta.ts` (modified) — `rutaDb()` pasa a llamar a `resolverRutaConfinada('PUENTES_DB_PATH',
  RUTA_POR_DEFECTO)` en vez de reimplementar la validación. Ningún test de `test/db/ruta.test.ts`
  cambia de comportamiento esperado.
- `lib/portadas/ruta.ts` (new) — `import 'server-only'` primero. `rutaDirectorioPortadas()` llama a
  `resolverRutaConfinada('PUENTES_PORTADAS_PATH', path.join('data', 'portadas'))`. `rutaDeArchivo(id:
  number): string` devuelve `path.join(rutaDirectorioPortadas(), \`${id}.jpg\`)`.
- `lib/portadas/almacenamiento.ts` (new) — `import 'server-only'` primero.
  - `tienePortada(id: number): boolean` — `fs.existsSync(rutaDeArchivo(id))`.
  - `procesarPortada(bytesOriginales: Buffer): CampoValidado<Buffer>` — **async**, a pesar del nombre
    del tipo (ver Data model). Valida tamaño (mitigación M18) ANTES de invocar `sharp`; decodifica con
    `sharp(bytesOriginales)`, redimensiona con `{ width: 96, height: 96, fit: 'contain' }` y reencodea
    a JPEG **sin llamar `withMetadata()`** (mitigación M17 — el EXIF se descarta por default). Nunca
    aumenta `limitInputPixels` ni ninguna otra cota de `sharp` (mitigación M13). Cualquier excepción
    de `sharp` (formato no decodificable, corrupto) se captura y se traduce a
    `{ ok: false, error: { campo: 'foto', detalle: 'formato_no_admitido' } }` — nunca se propaga el
    mensaje de `sharp`/`libvips` (mitigación M16).
  - `guardarPortadaProcesada(id: number, buffer: Buffer): void` — escribe a un archivo temporal con
    sufijo único (`\`${id}.${process.pid}-${Date.now()}.tmp\`` o equivalente — mitigación M15) en el
    mismo directorio, y hace `fs.renameSync()` al nombre final. Crea el directorio con
    `fs.mkdirSync({ recursive: true })` si no existe, igual que `obtenerDb()` con el directorio del
    `.db`.
  - `guardarPortada(id: number, bytesOriginales: Buffer): CampoValidado<Buffer>` — combina las dos
    anteriores para el flujo de reemplazo desde el detalle (Block 3): si `procesarPortada()` falla,
    no escribe nada.
  - `quitarPortada(id: number): void` — `fs.rmSync(rutaDeArchivo(id), { force: true })` (ignora
    `ENOENT`).
  - `leerPortada(id: number): Buffer | undefined` — `undefined` si el archivo no existe o si
    `fs.readFileSync()` lanza (ilegible). Nunca propaga la excepción.
- `test/ayudas/entorno.ts` (modified) — agrega, junto a `PUENTES_DB_PATH`, la fijación de
  `PUENTES_PORTADAS_PATH` a un directorio bajo `.tmp-tests/`, con el mismo criterio de aislamiento
  (Regla #0).
- `test/rutas-confinadas.test.ts` (new) — casos de escape de raíz, ruta absoluta dentro/fuera,
  cadena vacía, directorio hermano con el mismo prefijo. Reemplaza el contenido equivalente que hoy
  vive sólo en `test/db/ruta.test.ts`; ese archivo pasa a verificar sólo que `rutaDb()` delega
  correctamente (mismos casos, pero ejercitados a través de `rutaDb()` para no perder cobertura de
  integración).
- `test/portadas/ruta.test.ts` (new) — espejo reducido de `test/db/ruta.test.ts`: sin
  `PUENTES_PORTADAS_PATH`, devuelve `data/portadas` bajo la raíz; con la variable fijada a algo fuera
  de la raíz, lanza. Aislamiento de entorno de test (Regla #0) explícito para portadas.
- `test/portadas/almacenamiento.test.ts` (new) — ver Required tests.
- `package.json` (modified) — agrega `sharp` a `dependencies`.
- `next.config.ts` (modified) — `serverExternalPackages: ['better-sqlite3', 'sharp']`.
- `public/logo-puentes-de-papel-96.jpg` (new, binario) — generado una sola vez a partir de
  `public/logo-puentes-de-papel.jpg` (1563×1563, 690 KB) con:
  ```
  node -e "require('sharp')('public/logo-puentes-de-papel.jpg').resize({width:96,height:96,fit:'contain'}).jpeg({quality:85}).toFile('public/logo-puentes-de-papel-96.jpg')"
  ```
  ejecutado después de instalar `sharp`, y commiteado como archivo binario (no hay script permanente
  que lo regenere — es un asset, no un paso de build).

**Logic**

`lib/portadas/` no importa nada de `lib/db/`, no ejecuta SQL y no abre `better-sqlite3`. Por
construcción, ninguna operación de portada puede escribir en `historial_precio` ni `historial_stock`
(FR-04): no hay ningún camino de código que llegue de `lib/portadas/` a esas tablas.

El nombre de archivo es siempre `identificadorDeLibro(id)` (ya validado por quien llama, ver Bloques
2-4) convertido a `\`${id}.jpg\`` — nunca deriva del nombre original subido ni de ningún otro dato de
la request (mitigación M20, invariante que sostiene `app/portadas/[id]/route.ts` en el Block 4).

**Data model**

No hay migración ni columna nueva. `CampoValidado<T>` no es un tipo compartido en el repositorio hoy
(cada módulo de `lib/db/` declara el suyo, ver `lib/db/libros.ts` y `lib/db/edicion.ts`); el valor que
devuelve `procesarPortada()` respeta la misma forma estructural (`{ ok: true; valor: T } | { ok:
false; error: ErrorCampo }`, con `T = Buffer`) para que entre sin adaptador en `recolectarErrores()`
en el Block 2 — no hace falta importar ningún tipo de `lib/db/`, sólo `ErrorCampo` (`import type`).

**Input validation**

- Tamaño máximo del archivo subido: **10 MB**, verificado sobre `bytesOriginales.byteLength` ANTES de
  llamar a `sharp` — mitigación M18. Motivo de rechazo: `{ campo: 'foto', detalle:
  'demasiado_grande' }`.
- Formato: el único criterio es que `sharp` lo decodifique con éxito. No hay lista de extensiones
  admitidas ni se confía en `File.type` del navegador (mitigación implícita: allowlist-por-éxito, no
  por extensión).

**Error handling**

- Cualquier excepción de `sharp` al decodificar → `{ ok: false, error: { campo: 'foto', detalle:
  'formato_no_admitido' } }`.
- Archivo más grande que el límite → `{ ok: false, error: { campo: 'foto', detalle:
  'demasiado_grande' } }`, sin invocar `sharp`.
- Fallo de infraestructura al escribir/leer/borrar (disco lleno, permisos) → se propaga como
  excepción sin capturar en `guardarPortadaProcesada()`/`quitarPortada()` (igual que `crearLibro()`
  ante un fallo de infraestructura); `leerPortada()` es la única función que absorbe cualquier fallo
  de lectura y devuelve `undefined`, porque su contrato es "no hay foto legible", no "algo salió mal".
  Ningún mensaje incluye la ruta absoluta del archivo ni el texto nativo de la excepción (mitigación
  M16) — lo capturan y lo traducen los llamadores (Bloques 2-4), con el mismo criterio que M8.

**Required tests**

- [ ] `resolverRutaConfinada()` rechaza una ruta que se escapa de la raíz — replica los 6 casos de
      `test/db/ruta.test.ts` de forma parametrizada.
- [ ] `rutaDb()` sigue devolviendo lo mismo que antes de delegar (regresión, sin cambiar
      `test/db/ruta.test.ts` de comportamiento esperado).
- [ ] `rutaDirectorioPortadas()`: sin `PUENTES_PORTADAS_PATH`, devuelve `data/portadas` bajo la raíz
      del proyecto; con la variable fijada fuera de la raíz, lanza.
- [ ] `import 'server-only'` es el primer import de `lib/portadas/ruta.ts` y de
      `lib/portadas/almacenamiento.ts` (guardia manual, mismo patrón que `test/db/libros.test.ts` y
      `test/db/consultas.test.ts` — `lib/portadas/` no entra en el registro derivado de `lib/db/`).
- [ ] `procesarPortada()` con un JPEG válido devuelve `{ ok: true, valor: Buffer }` cuyo buffer,
      decodificado de nuevo, mide ≤ 96 px de lado mayor.
- [ ] `procesarPortada()` con bytes que no son una imagen decodificable devuelve `{ ok: false, error:
      { campo: 'foto', detalle: 'formato_no_admitido' } }` — nunca lanza.
- [ ] `procesarPortada()` con un archivo de más de 10 MB devuelve `{ ok: false, error: { campo:
      'foto', detalle: 'demasiado_grande' } }` sin invocar `sharp` (se puede verificar con un espía
      que confirme que `sharp` no se llamó).
- [ ] `procesarPortada()` sobre una imagen con EXIF (GPS o cualquier metadato) produce un buffer de
      salida sin esos metadatos (mitigación M17) — decodificar el resultado con `sharp(...).metadata()`
      y afirmar que no trae `exif`/`gps`.
- [ ] `guardarPortadaProcesada()` dos veces seguidas para el mismo id reemplaza el archivo (el segundo
      contenido es el que queda).
- [ ] `guardarPortadaProcesada()` usa un nombre de archivo temporal distinto en cada llamada
      (mitigación M15) — se puede verificar interceptando `fs.renameSync` o comparando el patrón del
      nombre.
- [ ] `guardarPortadaProcesada()` propaga sin capturar un fallo de infraestructura al escribir
      (`fs.renameSync` mockeado para lanzar) — cierra el error documentado en Error handling.
- [ ] `quitarPortada()` sobre un id sin portada no lanza (`ENOENT` ignorado).
- [ ] `quitarPortada()` propaga sin capturar un fallo de infraestructura que no sea `ENOENT`
      (`fs.rmSync` mockeado para lanzar otro código) — cierra el error documentado en Error handling.
- [ ] `tienePortada()` es `false` antes de guardar y `true` después; vuelve a `false` después de
      `quitarPortada()`.
- [ ] `leerPortada()` sobre un id sin portada devuelve `undefined`, nunca lanza.
- [ ] `leerPortada()` ante un fallo de lectura que no sea "no existe" (`fs.readFileSync` mockeado
      para lanzar `EACCES` u otro código) también devuelve `undefined`, nunca lanza — cierra el
      contrato de "no propaga ningún fallo de lectura" documentado en Error handling.
- [ ] Guardia de convención: ningún archivo de `lib/portadas/` importa `better-sqlite3` ni ningún
      módulo de `lib/db/` (recorrido estático del código fuente, mismo criterio que las guardias de
      `app/` que buscan strings prohibidos en el fuente crudo) — sostiene FR-04 por construcción.

**Completion criterion**

`npx vitest run test/portadas/ test/rutas-confinadas.test.ts test/db/ruta.test.ts` pasa completo;
`tsc --noEmit` y `eslint .` limpios; `sharp` resuelve en `next build` (no falla por
`serverExternalPackages` mal configurado).

---

## Block 2 — Alta con foto (FR-01)

**Files**
- `lib/db/errores.ts` (modified) — `CampoLibro` gana `'foto'`. Nueva unión `DetalleFoto =
  'formato_no_admitido' | 'demasiado_grande'`, incorporada a `DetalleCampo` (`DetalleTexto |
  DetalleEntero | MotivoPrecio | DetalleFoto`).
- `app/mensajes.ts` (modified) — el `Record<CampoLibro, Partial<Record<DetalleCampo, string>>>`
  (`MENSAJES`, hoy en `:274`) gana la entrada `foto` con sus dos motivos. El compilador ya obliga a
  completarla en cuanto `CampoLibro` cambia — no es opcional.
- `lib/db/libros.ts` (modified) — `crearLibro()` acepta un parámetro adicional para el resultado ya
  calculado de `procesarPortada()` (un `CampoValidado<Buffer> | undefined`, `undefined` cuando el
  alta no trae foto) y lo funde en `recolectarErrores(titulo, editorial, stock, precio, fotoComoQuinto)`
  ANTES de decidir si escribe — el libro no se crea si la foto es inválida, igual que si lo fuera
  cualquier otro campo. La ubicación exacta del parámetro nuevo en la firma la resuelve el
  implementador sin romper las llamadas existentes de `test/db/libros.test.ts`
  (agregarlo al final, después de `db`, con default `undefined`, es la forma más segura). Si
  `crearLibro()` tiene éxito y había un buffer de foto válido, el buffer viaja en el resultado
  (`ResultadoCrearLibro` gana `bufferDePortada?: Buffer` en la rama `ok: true`, o el llamador lo
  retiene desde antes de invocar `crearLibro()` — cualquiera de las dos formas es válida mientras
  `app/acciones.ts` termine escribiendo el archivo con el id ya conocido).
- `app/componentes/formulario-alta.tsx` (modified) — agrega `<input type="file" name="foto"
  accept="image/*">`, sin `required` (FR-01: el alta sin foto sigue siendo válida), con su
  `<p className="error-de-campo">{mensajes.foto}</p>`. El formulario ya no puede tener
  `encType` implícito de `application/x-www-form-urlencoded`: al llevar un campo `file`, el
  navegador lo envía como `multipart/form-data` automáticamente en cuanto el `<form>` tiene un
  `<input type="file">` — no hace falta fijar `encType` a mano.
- `app/acciones.ts` (modified) — `altaDeLibro()` lee `datos.get('foto')`. Si es un `File` con
  `size > 0`, lee sus bytes (`await archivo.arrayBuffer()` → `Buffer.from(...)`) y llama
  `procesarPortada()` (Block 1) — **en memoria, sin tocar disco todavía**. El resultado (o
  `undefined` si no hay foto) se pasa a `crearLibro()`. Si `crearLibro()` devuelve éxito y había un
  buffer válido, se llama `guardarPortadaProcesada(libroCreado.id, buffer)` recién ahí. Si esa
  escritura a disco fallara (fallo de infraestructura, no de validación), se seguirá redirigiendo al
  éxito del alta —riesgo aceptado A4 del threat model— y el fallo se loguea sin el contenido del
  buffer (mitigación M16).

**Logic**

Orden dentro de `altaDeLibro()`:
1. Si hay un `File` no vacío en `foto`, llamar `procesarPortada()` (in-memory).
2. Llamar `crearLibro()` con los cuatro campos de siempre más el resultado del paso 1.
3. Si `crearLibro()` rechaza (por cualquier campo, foto incluida), devolver los mensajes por campo —
   **una sola respuesta con todos los rechazos juntos**, igual que hoy. No se creó nada.
4. Si `crearLibro()` tiene éxito, revalidar `/` y, si había un buffer de foto, escribir el archivo con
   el id ya asignado.

**Input validation**

Igual que Block 1: 10 MB, formato validado por éxito de decodificación. El HTML (`accept="image/*"`)
es comodidad, no barrera — mismo criterio que `maxLength`/`min`/`max` en los otros campos.

**Error handling**

- Foto inválida (formato o tamaño) → rechazo de campo `foto`, junto a cualquier otro rechazo, libro
  no creado.
- Fallo de infraestructura de `crearLibro()` → mensaje genérico ya existente
  (`MENSAJE_ERROR_INESPERADO`), sin cambios.
- Fallo de infraestructura al escribir el archivo DESPUÉS de crear el libro → alta exitosa igual
  (A4), log server-side sin el buffer.

**Required tests**

- [ ] Alta sin campo `foto` en el `FormData`: éxito idéntico al comportamiento actual (regresión) —
      cierra la mitad de **AC-01** (alta sin foto sigue siendo válida).
- [ ] Alta con una foto válida: el libro se crea, el archivo queda en `data/portadas/{id}.jpg`,
      `tienePortada(id)` es `true` — cierra la otra mitad de **AC-01** (persistencia).
- [ ] Alta con una foto inválida (formato) Y el título vacío: la respuesta trae **los dos** rechazos
      (`mensajes.titulo` y `mensajes.foto`), y no se creó ningún libro — verifica que se resolvió el
      hallazgo del arch-auditor (todos los rechazos juntos, nunca sólo uno); cierra **AC-07** aplicado
      al alta.
- [ ] Alta con una foto de más de 10 MB: rechazo `demasiado_grande` en `foto`, libro no creado —
      cierra **AC-07** para el motivo de tamaño.
- [ ] `MENSAJES.foto.formato_no_admitido` y `MENSAJES.foto.demasiado_grande` existen y no son
      cadenas vacías (guardia mecánica sobre el registro, mismo patrón que los demás campos).
- [ ] Alta con `crearLibro()` fallando por infraestructura (mockeado): mensaje genérico existente sin
      cambios — regresión ya cubierta por el test presente de `test/app/acciones.test.ts`, se deja
      constancia acá para que el error documentado en Error handling no quede sin su test.
- [ ] Alta con foto válida donde `guardarPortadaProcesada()` lanza DESPUÉS de que `crearLibro()` tuvo
      éxito (mockeado): el alta redirige a éxito igual (riesgo aceptado **A4**) y el log de servidor
      no contiene el buffer de la imagen.

**Completion criterion**

Los tests de `test/app/acciones.test.ts` (extendidos) y `test/db/libros.test.ts` (extendidos) pasan;
`tsc --noEmit` limpio con el `CampoLibro`/`DetalleCampo` ampliados propagados a todo consumidor
exhaustivo.

---

## Block 3 — Gestión desde el detalle (FR-02, FR-03, FR-04)

**Files**
- `app/acciones-libro.ts` (modified) — agrega dos Server Actions nuevas, junto a `ventaDeLibro()` y
  `edicionDeLibro()` (mismo archivo, mismo criterio de "un archivo de Server Actions por pantalla"):
  - `asignarFoto(estadoPrevio: ResultadoAsignarFoto | null, datos: FormData):
    Promise<ResultadoAsignarFoto>` — sigue el molde de `edicionDeLibro()` (usa `useActionState`,
    puede rechazar por campo). Valida el id con `identificadorDeLibro()` (mitigación M19, mismo
    patrón M1). Lee el `File` de `datos.get('foto')`, llama `guardarPortada(id, bytes)` (Block 1,
    valida+redimensiona+escribe en un solo paso, porque acá no hay nada más que crear-o-fallar como
    en el alta). Si falla la validación → `{ ok: false, mensajes: { foto: mensajeDeCampo(...) } }`,
    sin redirigir. Si tiene éxito → `revalidatePath('/')` + `revalidatePath(rutaDelDetalle(id))` +
    `redirect(rutaDelDetalle(id))` (mitigación M3, mismo patrón que venta/edición).
  - `quitarFoto(datos: FormData): Promise<void>` — sigue el molde de `ventaDeLibro()` (sin
    `useActionState`, sin mensajes por campo: no hay nada que validar más que el id). Valida el id,
    llama `quitarPortada(id)`, revalida las dos rutas, redirige. Si el id no es válido → `notFound()`,
    igual que venta.
- `app/mensajes.ts` (modified) — tipo `ResultadoAsignarFoto` (mismo shape que `ResultadoEdicion`:
  `{ ok: false; mensajes: MensajesPorCampo; general?: string }`), textos: título de la sección,
  texto del botón "Cambiar foto"/"Quitar foto", mensaje de error genérico de infraestructura.
- `app/componentes/formulario-portada.tsx` (new) — Client Component, mismo patrón
  `useActionState` que `FormularioEdicion`: un `<input type="file" name="foto">` +
  `<input type="hidden" name="id">` + botón "Cambiar foto"/"Guardar foto", con
  `<p className="error-de-campo">{mensajes.foto}</p>`. Un segundo `<form action={quitarFoto}>` con
  el mismo id oculto y un botón "Quitar foto", **sólo si la portada existe** (ver prop de abajo) —
  quitar una foto que no existe no tiene sentido para la usuaria y evita un viaje al servidor que
  sólo puede terminar en no-op.
- `app/libros/[id]/page.tsx` (modified) — además de `leerLibroPorId()`, llama
  `tienePortada(libro.id)` (única llamada a `lib/portadas/` en esta página) y arma la ruta final
  para mostrar la portada vigente: `tienePortada ? \`/portadas/${libro.id}\` :
  '/logo-puentes-de-papel-96.jpg'` — vía la función compartida `resolverRutaMostrable(id)` que agrega
  este mismo bloque a `lib/portadas/almacenamiento.ts` (ver Logic), para no duplicar la rama
  con el Block 4. Pasa `rutaPortada: string` y `tienePortada: boolean` a `DetalleLibro`.
- `app/componentes/detalle-libro.tsx` (modified) — recibe `rutaPortada: string` y `tienePortada:
  boolean` como props (tipo local `interface PropsDetalle extends { libro: Libro; rutaPortada:
  string; tienePortada: boolean }` — no importa nada de `lib/portadas/` ni de `lib/db/` más de lo
  que ya importa). Renderiza `<img src={rutaPortada} width={96} height={96} alt="Portada">` antes de
  `FormularioEdicion`, y monta `FormularioPortada` con `tienePortada` para decidir si muestra el
  botón "Quitar foto".
- `lib/portadas/almacenamiento.ts` (modified respecto del Block 1) — agrega
  `resolverRutaMostrable(id: number): string` = `tienePortada(id) ? \`/portadas/${id}\` :
  '/logo-puentes-de-papel-96.jpg'`. Es la única función que decide esa rama; la usan
  `app/libros/[id]/page.tsx` (este bloque) y `app/page.tsx` (Block 4) — cierra el WARN de precisión
  del segundo arch-audit (una sola función, no la regla duplicada en dos páginas).

**Logic**

`asignarFoto` reemplaza sin pedir confirmación (FR-02: "asignar o reemplazar"), igual como
`edicionDeLibro()` sobrescribe sin confirmación los otros campos. `quitarFoto` no tiene validación de
campo, así que no necesita `useActionState`: es una operación binaria como la venta.

**Input validation**

Id de libro: `identificadorDeLibro()`, mismo criterio que venta y edición (mitigación M19). Foto en
`asignarFoto`: mismas reglas que Block 1/2 — 10 MB máximo, formato aceptado por éxito de
decodificación en `sharp`, nunca por extensión ni por `File.type`. `quitarFoto` no recibe ningún
campo más que el id.

**Error handling**

- Id inválido en cualquiera de las dos acciones → `notFound()` (mismo criterio que venta/edición: un
  404 indistinguible del de un id que no existe).
- Foto inválida en `asignarFoto` → rechazo de campo, formulario se re-renderiza con el error,
  **la foto anterior no se toca** (AC-07: `guardarPortada()`/`procesarPortada()` no escriben nada si
  la validación falla).
- Fallo de infraestructura en `asignarFoto` → mensaje genérico curado devuelto por `useActionState`
  (mismo molde que `edicionDeLibro()`), log sin el contenido del buffer (M16).
- Fallo de infraestructura en `quitarFoto` → no hay `useActionState` que muestre un campo: se loguea
  y se relanza un `Error` con mensaje curado (mismo molde que `ventaDeLibro()`), sin el texto nativo
  de la excepción (M16).

**Required tests**

- [ ] `asignarFoto` con una foto válida sobre un libro sin portada: after, `tienePortada(id)` es
      `true`, redirige al detalle — cierra **AC-05** (asignar).
- [ ] `asignarFoto` sobre un libro que ya tenía portada, con una foto distinta: el archivo se
      reemplaza (contenido cambia), no se acumulan archivos — cierra **AC-05** (reemplazar).
- [ ] `asignarFoto` con una foto inválida: rechazo de campo, no redirige, la portada previa (si
      había) sigue intacta — verifica **AC-07** literalmente comparando bytes antes/después.
- [ ] `asignarFoto` con un id inválido: `notFound()`, sin tocar el filesystem.
- [ ] `asignarFoto` ante un fallo de infraestructura (mockeado): mensaje genérico curado, no
      redirige, no expone texto del motor ni rutas del disco (mitigación M16).
- [ ] `quitarFoto` ante un fallo de infraestructura (mockeado): relanza un `Error` con mensaje
      curado, sin el texto nativo de la excepción (mitigación M16).
- [ ] `quitarFoto` sobre un libro con portada: after, `tienePortada(id)` es `false`, redirige —
      cierra **AC-06**.
- [ ] `quitarFoto` sobre un libro sin portada: no lanza, redirige igual (idempotente).
- [ ] `quitarFoto` con un id inválido: `notFound()`, sin tocar el filesystem.
- [ ] `quitarFoto` deja sin cambios título, editorial, stock, precio e historiales del libro — cierra
      explícitamente la segunda mitad de **AC-06** ("sin alterar ningún otro de sus datos").
- [ ] Ninguna de las dos acciones inserta una fila en `historial_precio` ni en `historial_stock`
      (FR-04, y la mitad restante de **AC-05**/**AC-06**) — se verifica contando filas antes/después
      sobre una base de prueba real.
- [ ] `DetalleLibro` muestra `rutaPortada` en un `<img>` con los atributos de tamaño fijos.
- [ ] `FormularioPortada` no renderiza el botón "Quitar foto" cuando `tienePortada` es `false`.
- [ ] Guardia de convención: `asignarFoto` y `quitarFoto` son detectadas por
      `test/convenciones/acciones-de-servidor.test.ts` (se referencian con `action={...}` o como
      primer argumento de `useActionState`, no hace falta registro manual).

**Completion criterion**

Tests nuevos y existentes de `test/app/` pasan; `daw-validate-arch` no reporta la capa de
presentación importando `lib/portadas/` fuera de las dos páginas (`page.tsx`, `libros/[id]/page.tsx`).

---

## Block 4 — Miniaturas en el listado y ruta de servido (FR-05, FR-06, FR-07, NFR-01)

**Files**
- `app/portadas/[id]/route.ts` (new) — Route Handler, `export async function GET(request: Request,
  { params }: { params: Promise<{ id: string }> })`. Valida el id con `identificadorDeLibro()`
  (mitigación M19, mismo patrón que TB-5). Si el id es inválido, o `leerPortada(id)` devuelve
  `undefined`, responde con los bytes de `public/logo-puentes-de-papel-96.jpg` (leído del disco, no
  con un `redirect` — evita un round-trip extra y mantiene la URL de la portada estable para el
  navegador). Si `leerPortada(id)` devuelve un buffer, responde con él. En los dos casos:
  `Content-Type: image/jpeg` (constante fija, mitigación M21), `X-Content-Type-Options: nosniff`
  (mitigación M21), y `Last-Modified`/`ETag` derivados del `mtime`/tamaño del archivo real
  (`fs.statSync`) para que un reemplazo posterior (Block 3) invalide el caché del navegador sin
  cambiar la URL.
- `app/page.tsx` (modified) — además de `buscarLibros()`, mapea cada `Libro` a
  `{ ...libro, rutaPortada: resolverRutaMostrable(libro.id) }` (la misma función del Block 3, en
  `lib/portadas/almacenamiento.ts`) antes de pasarlo a `ListadoLibros`. Es la única llamada a
  `lib/portadas/` en esta página.
- `app/componentes/listado-libros.tsx` (modified) — tipo local `interface LibroConPortada extends
  Libro { rutaPortada: string }` (mismo patrón que `PropsListado`/`PropsDetalle`, declarado en el
  archivo, no en `lib/db/tipos.ts` ni en `lib/portadas/`). Nueva columna "Portada": por fila,
  `<td data-campo="portada"><img src={fila.rutaPortada} width={96} height={96} loading="lazy"
  alt=""></img></td>`. Sigue sin `'use client'` (M11 de FEAT-001b se mantiene: cero JavaScript de
  cliente por fila).
- `app/globals.css` (o el archivo de estilos que ya use el proyecto — a confirmar su nombre exacto
  al implementar; si no existe uno global, se agrega inline `style` con las mismas propiedades) —
  clase `.miniatura-portada { width: 96px; height: 96px; object-fit: contain; background:
  [color neutro] }` para que el recuadro sea uniforme incluso si el navegador no respeta
  `width`/`height` del `<img>` antes de que cargue.
- `test/rendimiento/listado.bench.test.ts` (modified) — `scripts/sembrar-catalogo.ts` (o el propio
  test) crea, para una fracción determinista del catálogo sembrado (p. ej. cada 3er libro), un
  archivo vacío o mínimo en `data/portadas/{id}.jpg` bajo el directorio temporal de la corrida —
  sólo hace falta que `tienePortada()` (un `fs.existsSync`) lo vea, no que el contenido sea una
  imagen real, porque este bench mide el costo de `resolverRutaMostrable()` dentro de
  `app/page.tsx`, no la decodificación.
- `test/rendimiento/portadas-route.bench.test.ts` (new) — invoca el `GET` exportado de
  `app/portadas/[id]/route.ts` **como función async**, con un `Request`/`NextRequest` construido a
  mano (sin servidor HTTP real — condición del segundo arch-audit, mismo molde que
  `test/app/acciones.test.ts` trata las Server Actions). Mide el p95 sobre 100 iteraciones sirviendo
  (a) una portada real pregenerada y (b) el fallback al logo, contra el mismo presupuesto de 1000 ms
  de AC-09 — deja evidencia concreta del costo que el bench de renderizado no puede capturar (el
  proyecto no tiene e2e/DOM, `AGENTS.md` § Stack).
- `test/app/portadas-route.test.ts` (new) — comportamiento funcional del Route Handler (no
  rendimiento): ver Required tests.

**Logic**

`resolverRutaMostrable()` (Block 1/3) es la única fuente de la rama "con foto vs. sin foto" — tanto
el listado como el detalle la llaman, nunca la reimplementan. Una fila sin foto nunca toca
`app/portadas/[id]/route.ts`: apunta directo al asset estático, que Next sirve con su propio
mecanismo de archivos estáticos, compartiendo una sola URL cacheable entre las 2.000 filas que no
tengan portada.

**API contract**

- Método + ruta: `GET /portadas/{id}`
- Request: segmento de ruta `id` (string arbitrario del navegador, ver TB-5/TB-6 del threat model)
- Response: `image/jpeg`, cuerpo binario (la portada o el logo)
- Códigos de error: ninguno — un id inválido o una portada faltante/ilegible siempre responden `200`
  con el logo, nunca `404` ni `500` (FR-07: "no debe fallar")
- Auth: ninguna (PRD-001 §6), igual que el resto de las rutas del proyecto

**Input validation**

El único input es el segmento de ruta `id`: se valida con `identificadorDeLibro()`, la misma función
que usan `/libros/[id]`, `asignarFoto` y `quitarFoto` (mitigación M19) — nunca una segunda
implementación. Cualquier valor que no pase esa validación se trata igual que un id de un libro sin
portada (mitigación M20: el nombre de archivo que el handler intenta leer nace siempre de ese
resultado, nunca de otro dato de la request).

**Error handling**

- Id no numérico, negativo o fuera de rango → logo.
- `leerPortada()` devuelve `undefined`, ya sea porque el archivo no existe o porque falló al leerlo
  (permisos, corrupción) → logo en los dos casos, indistinguibles para quien llama (mismo criterio
  que "un libro archivado es indistinguible de uno inexistente" en `leerLibroPorId()`).
- La presencia de `public/logo-puentes-de-papel-96.jpg` es un invariante de build (el archivo se
  commitea en el Block 1), no una condición de error en tiempo de ejecución: no hay branch de código
  para su ausencia y por lo tanto no hay test que lo cubra bajo F-SPEC-16 — es equivalente a que
  falte cualquier otro asset de `public/` que el proyecto ya da por existente.

**Required tests**

- [ ] `GET /portadas/{id}` con un id de un libro con portada devuelve exactamente esos bytes, con
      `Content-Type: image/jpeg` — cierra la mitad "con foto" de **AC-02**.
- [ ] `GET /portadas/{id}` con un id de un libro sin portada devuelve los bytes del logo optimizado —
      cierra **AC-03**.
- [ ] `GET /portadas/{id}` cuando `leerPortada(id)` devuelve `undefined` por un fallo de lectura
      (mockeado, no por ausencia del archivo) devuelve el logo igual que si no existiera — cierra
      **AC-04** ("la foto no se puede leer"), reusando el mismo contrato que ya prueba
      `test/portadas/almacenamiento.test.ts` (Block 1) para `leerPortada()`. **No** se revalida el
      formato de la imagen en el camino de lectura (decodificar con `sharp` en cada `GET` reintroduce
      el costo por request que NFR-01 evita): el diseño confía en que sólo
      `guardarPortadaProcesada()` escribe en `data/portadas/`, así que un archivo legible ahí siempre
      es un JPEG válido por construcción.
- [ ] `GET /portadas/{id}` con `id = 'abc'`, `id = '-1'`, `id = '9e99'` devuelve el logo (nunca un
      error) — mismo criterio de aceptación que `identificadorDeLibro()` en el resto del proyecto.
- [ ] La respuesta lleva `X-Content-Type-Options: nosniff` en los dos casos.
- [ ] `Last-Modified`/`ETag` cambian después de reemplazar la portada de un libro (mitigación de
      invalidación de caché) — se verifica llamando al handler antes y después de un
      `guardarPortadaProcesada()`.
- [ ] Guardia de invariante (mitigación M20): el nombre de archivo que el handler intenta leer
      siempre tiene la forma `\`${entero}.jpg\`` derivada de `identificadorDeLibro()` — se verifica
      con un espía sobre `leerPortada`/`rutaDeArchivo` que registre el argumento recibido en varios
      casos (incluidos los inválidos) y afirme que nunca es otra cosa que un `number`.
- [ ] `ListadoLibros` renderiza la columna "Portada" con `data-campo="portada"` en cada fila, con el
      recuadro de 96 px en cada `<img>` — cierra **AC-02**. El `src` de cada fila coincide con
      `fila.rutaPortada` (no con ningún dato derivado del título o la editorial — cierra cualquier
      duda de XSS sobre este campo nuevo).
- [ ] Integración: un libro dado de alta con foto (Block 2) aparece en `buscarLibros()` con
      `resolverRutaMostrable(id)` devolviendo `/portadas/{id}`, y ese mismo `id` sirve bytes reales
      vía `GET /portadas/{id}` — cierra **AC-01** de punta a punta (persistencia + miniatura en el
      listado).
- [ ] Extensión de `test/rendimiento/listado.bench.test.ts`: con la mezcla con/sin portada sembrada,
      el p95 del catálogo completo (2.000 filas) sigue por debajo de 1000 ms — cierra **AC-08**.
- [ ] `test/rendimiento/portadas-route.bench.test.ts`: p95 de servir una portada real y de servir el
      fallback al logo, cada uno por debajo de 1000 ms sobre 100 iteraciones (mismo presupuesto de
      AC-08, aplicado al costo nuevo que introduce este bloque).

**Completion criterion**

Todos los tests de `test/app/portadas-route.test.ts`, `test/rendimiento/portadas-route.bench.test.ts`
y `test/rendimiento/listado.bench.test.ts` pasan; `npm run lint`, `npm run format:check` y `tsc
--noEmit` limpios; `npm run build` produce el build sin errores de `serverExternalPackages`.

---

## Final verification

- Los nueve AC del PRD (`docs/daw/prd/prd-FEAT-001c.md`) tienen al menos un test que los nombra por
  id, en algún bloque de los cuatro.
- Ninguna operación de portada (alta con foto, asignar, reemplazar, quitar) inserta una fila en
  `historial_precio` ni en `historial_stock` (FR-04) — verificado en Block 2 y Block 3 con conteo de
  filas antes/después.
- `lib/portadas/*.ts` no importa `better-sqlite3` ni ningún módulo de `lib/db/` (guardia de Block 1).
- Ningún componente de presentación (`listado-libros.tsx`, `detalle-libro.tsx`,
  `formulario-portada.tsx`) importa `lib/portadas/` ni `lib/db/` — sólo `app/page.tsx` y
  `app/libros/[id]/page.tsx` lo hacen, preservando el patrón de capas que ya usa el proyecto.
- Las diez mitigaciones de `docs/daw/security/threat-FEAT-001c.md` §5 están incorporadas: M12 y M13
  a M21 verificables cada una por al menos un test o una revisión de código explícita en el bloque
  que las cierra.
- `npm test` (cobertura ≥ 80 % líneas/ramas/funciones sobre el código nuevo — cierra **AC-09**),
  `npm run lint`, `npm run format:check` y `tsc --noEmit` limpios sobre el árbol completo.
- `npm run build` completa sin errores (confirma que `sharp` resuelve correctamente con
  `serverExternalPackages`).
