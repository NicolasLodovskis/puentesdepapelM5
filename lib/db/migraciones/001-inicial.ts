import 'server-only';

/**
 * Migración 001 — esquema inicial de Puentes de Papel (FEAT-001a).
 *
 * El SQL vive **inlineado en TypeScript**, no en un `.sql` leído del disco: leerlo con
 * `readFileSync` desde `process.cwd()` haría que la app dependa del directorio desde el
 * que se la arranque, que el `.sql` no viaje al empaquetar (el output tracing no traza
 * lecturas dinámicas) y que un directorio de trabajo preparado por un tercero pudiera
 * inyectar su propio esquema — justo el riesgo R3 que la mitigación 4 cierra.
 *
 * No contiene BEGIN ni COMMIT: la transacción la abre el runner (`lib/db/migrar.ts`).
 *
 * Las tres tablas son STRICT. Sin eso, la afinidad INTEGER de SQLite acepta `'abc'`,
 * `1.5` y BLOBs —y como TEXT y BLOB comparan mayores que cualquier número, un
 * `CHECK (precio > 0)` los deja pasar—, con lo que la "última barrera contra un precio
 * fuera de dominio" del threat model admitía texto. STRICT lo rechaza en el motor.
 */
export const SQL_001_INICIAL = `
CREATE TABLE libros (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo                TEXT    NOT NULL CHECK (length(trim(titulo)) BETWEEN 1 AND 300),
  -- Clave de identidad del catálogo (FR-02).
  titulo_normalizado    TEXT    NOT NULL UNIQUE CHECK (length(titulo_normalizado) >= 1),
  -- Clave de orden y de búsqueda por título. Distinta de la identidad a propósito.
  titulo_orden          TEXT    NOT NULL,
  editorial             TEXT    NOT NULL CHECK (length(trim(editorial)) BETWEEN 1 AND 300),
  editorial_normalizada TEXT    NOT NULL,
  stock                 INTEGER NOT NULL CHECK (stock >= 0 AND stock <= 1000000),
  precio                INTEGER NOT NULL CHECK (precio > 0),
  estado                TEXT    NOT NULL DEFAULT 'activo'
                                CHECK (estado IN ('activo', 'archivado')),
  -- ISO-8601 en UTC.
  creado_en             TEXT    NOT NULL
) STRICT;

-- Soporta el filtro del catálogo activo y el ORDER BY de FR-04 en una sola estructura.
CREATE INDEX idx_libros_catalogo ON libros (estado, titulo_orden);
CREATE INDEX idx_libros_editorial ON libros (estado, editorial_normalizada);

-- ON DELETE RESTRICT, nunca CASCADE: el Principio III prohíbe borrar historial
-- y borrar libros físicamente.
CREATE TABLE historial_precio (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  libro_id        INTEGER NOT NULL
                          REFERENCES libros (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  fecha           TEXT    NOT NULL,
  -- >= 0, no > 0: AC-01 exige precio anterior 0 en el alta.
  precio_anterior INTEGER NOT NULL CHECK (precio_anterior >= 0),
  precio_nuevo    INTEGER NOT NULL CHECK (precio_nuevo > 0),
  -- NO admite 'venta': una venta nunca cambia un precio (PRD-001 RF-13).
  origen          TEXT    NOT NULL CHECK (
                            origen IN (
                              'alta manual',
                              'edición manual',
                              'reactivación',
                              'actualización masiva por Excel',
                              'alta por Excel'
                            )
                          )
) STRICT;

CREATE INDEX idx_historial_precio_libro ON historial_precio (libro_id, fecha);

CREATE TABLE historial_stock (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  libro_id             INTEGER NOT NULL
                               REFERENCES libros (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  fecha                TEXT    NOT NULL,
  cantidad_anterior    INTEGER NOT NULL CHECK (cantidad_anterior >= 0),
  cantidad_resultante  INTEGER NOT NULL CHECK (cantidad_resultante >= 0),
  -- NO admite 'actualización masiva por Excel': el excel de precios nunca toca stock
  -- (PRD-001 RF-14).
  origen               TEXT    NOT NULL CHECK (
                                 origen IN (
                                   'alta manual',
                                   'edición manual',
                                   'venta',
                                   'reactivación',
                                   'alta por Excel'
                                 )
                               )
) STRICT;

CREATE INDEX idx_historial_stock_libro ON historial_stock (libro_id, fecha);
`;
