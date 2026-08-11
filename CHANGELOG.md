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

### Seguridad

- FEAT-001a — El servidor escucha únicamente en `127.0.0.1` y no se relaja la validación
  de `Origin` de los Server Actions: son los dos controles compensatorios del riesgo
  aceptado de no tener autenticación, y los dos tienen test de convención que los vigila.
- FEAT-001a — Toda consulta usa sentencias preparadas con parámetros; el término de
  búsqueda escapa `%`, `_` y la barra invertida con cláusula `ESCAPE`.

### Limitaciones conocidas

- El orden del catálogo usa la colación binaria de SQLite, así que la `ñ` y los
  diacríticos que el plegado preserva ordenan después de la Z. FR-04 pide comparación
  en español: pendiente en un ticket propio, **antes de cargar el inventario real**.
- Un título con puntuación final (`"Principito, El."`) normaliza distinto de
  `"El Principito"`, así que el mismo libro puede entrar dos veces. Requisito de entrada
  de FEAT-001b.
