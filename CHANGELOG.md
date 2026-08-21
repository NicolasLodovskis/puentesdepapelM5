# Changelog

Todos los cambios notables de este proyecto se documentan acá.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [No liberado]

### Añadido

- FEAT-001a — Cimientos: aplicación Next.js con SQLite embebida vía `better-sqlite3`,
  esquema inicial con `libros`, `historial_precio` e `historial_stock`, y runner de
  migraciones sobre `PRAGMA user_version`.
- FEAT-001a — Dominio: plegado de texto que preserva la eñe, normalización de título
  con artículo pospuesto, e interpretación de precio con motivo explícito de rechazo.
- FEAT-001a — Alta manual de libro, con su entrada en cada historial dentro de la misma
  transacción y unicidad por título normalizado.
- FEAT-001a — Búsqueda por título o editorial, insensible a mayúsculas y acentos, y
  listado del catálogo activo ordenado por título.
- FEAT-001a — Pantalla principal como Server Component, sin JavaScript de cliente por
  fila; medición de rendimiento con 2.000 libros con p95 de 38,6 ms contra un
  presupuesto de 1 s.
- FEAT-001b — Vista de detalle de un libro, alcanzable desde su fila en el listado.
- FEAT-001b — Venta de un ejemplar desde el detalle, con confirmación explícita y
  registro en una tabla de ventas propia (fecha y precio vigente al momento de vender).
- FEAT-001b — Edición de título, editorial, stock y precio desde el detalle: cada campo
  reusa la validación del alta, y un campo que no cambia no deja rastro en ningún
  historial.
- FEAT-001b — Derivación de la identidad de un libro (título normalizado, orden y
  editorial normalizada) unificada en un único módulo de dominio, consumido por el
  alta, la edición y la migración de recálculo.
- FEAT-001c — Portada opcional de un libro: se agrega en el alta, y se asigna,
  reemplaza o quita desde el detalle. El estado "tiene foto o no" es puramente del
  filesystem (`data/portadas/{id}.jpg`), sin columna nueva en `libros`.
- FEAT-001c — Miniatura de 96px en el listado y en el detalle, servida por
  `GET /portadas/[id]`, que nunca falla: responde con el logo por defecto ante
  cualquier id inválido o portada inexistente/ilegible, siempre con status 200.

### Seguridad

- FEAT-001a — El servidor escucha únicamente en `127.0.0.1` y no se relaja la validación
  de `Origin` de los Server Actions: son los dos controles compensatorios del riesgo
  aceptado de no tener autenticación, y los dos tienen test de convención que los vigila.
- FEAT-001a — Toda consulta usa sentencias preparadas con parámetros; el término de
  búsqueda escapa `%`, `_` y la barra invertida con cláusula `ESCAPE`.
- FEAT-001b — El precio de venta y el stock descontado se leen dentro de la misma
  transacción `immediate` que los escribe: el formulario no puede fijar a qué precio se
  vendió ni repetir una venta por reenvío del navegador (POST-Redirect-GET).
- FEAT-001b — El recálculo de identidad es atómico: detecta toda colisión en memoria
  antes de escribir una sola fila y, ante colisión, revierte entero sin enumerar los
  libros en conflicto.
- FEAT-001c — `lib/portadas/` no importa `lib/db/` ni `better-sqlite3` por
  construcción: ninguna operación de portada puede escribir en `historial_precio` ni
  en `historial_stock`. El nombre de archivo de una portada siempre nace de
  `identificadorDeLibro()`, nunca de un dato crudo de la request.
- FEAT-001c — Toda foto subida se valida por tamaño (10 MB) antes de decodificar, y
  se acepta únicamente por éxito real de decodificación (nunca por extensión ni por
  `File.type`); se redimensiona a 96px y se guarda sin metadata EXIF. Los mensajes de
  error nunca exponen el texto nativo de `sharp`/`libvips` ni la ruta absoluta del
  archivo.

### Corregido

- FEAT-001b — `normalizarTitulo()` ya no distingue un título por su puntuación final:
  cierra la limitación conocida que dejó abierta FEAT-001a (un mismo libro ya no puede
  cargarse dos veces por un punto o una coma de más). Una migración recalcula la
  identidad de los libros ya cargados al arrancar.

### Limitaciones conocidas

- El orden del catálogo usa la colación binaria de SQLite, así que la `ñ` y los
  diacríticos que el plegado preserva ordenan después de la Z. FR-04 pide comparación
  en español: pendiente en un ticket propio, **antes de cargar el inventario real**.
