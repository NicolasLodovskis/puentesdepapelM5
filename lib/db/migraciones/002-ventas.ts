import 'server-only';

/**
 * Migración 002 — historial de ventas (FEAT-001b FR-07).
 *
 * El SQL vive **inlineado en TypeScript** por el mismo motivo que el de la 001: leerlo del
 * disco haría que el esquema dependa del directorio desde el que se arranque el proceso y
 * dejaría que un directorio de trabajo preparado por un tercero inyecte el suyo (riesgo R3 de
 * FEAT-001a).
 *
 * No contiene BEGIN ni COMMIT: la transacción la abre el runner (`lib/db/migrar.ts`).
 *
 * `STRICT` como las tres tablas de la 001. Sin eso, la afinidad INTEGER de SQLite acepta
 * `'abc'`, `1.5` y BLOBs, y como TEXT y BLOB comparan mayores que cualquier número, el
 * `CHECK (precio_venta > 0)` los dejaría pasar: la serie que reconstruye la facturación del
 * negocio admitiría texto.
 *
 * **Sin columna de origen**: toda fila de esta tabla es una venta. Los dos historiales de la
 * 001 la necesitan porque el mismo cambio de stock o de precio puede venir de un alta, de una
 * edición o de un Excel; acá no hay más de un origen posible.
 */
export const SQL_002_VENTAS = `
-- ON DELETE RESTRICT, nunca CASCADE: el Principio III prohíbe borrar historial y borrar
-- libros físicamente, y esta tabla es el historial más sensible del sistema.
CREATE TABLE ventas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  libro_id     INTEGER NOT NULL
                       REFERENCES libros (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- ISO-8601 en UTC, igual que en los dos historiales de la 001.
  fecha        TEXT    NOT NULL,
  -- Replica el CHECK de libros.precio: se registra el precio vigente, que nunca es 0.
  precio_venta INTEGER NOT NULL CHECK (precio_venta > 0)
) STRICT;

-- Las ventas se consultan por libro y en orden de fecha (PRD-001 RF-15).
CREATE INDEX idx_ventas_libro ON ventas (libro_id, fecha);
`;
