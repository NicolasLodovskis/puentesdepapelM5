/** Estado de un libro en el catálogo. La baja es lógica, nunca física (Principio III). */
export type EstadoLibro = 'activo' | 'archivado';

/**
 * Orígenes admitidos por `historial_precio`.
 * NO incluye `'venta'`: una venta nunca cambia un precio (PRD-001 RF-13).
 */
export type OrigenPrecio =
  | 'alta manual'
  | 'edición manual'
  | 'reactivación'
  | 'actualización masiva por Excel'
  | 'alta por Excel';

/**
 * Orígenes admitidos por `historial_stock`.
 * NO incluye `'actualización masiva por Excel'`: el excel de precios nunca toca stock
 * (PRD-001 RF-14).
 */
export type OrigenStock =
  'alta manual' | 'edición manual' | 'venta' | 'reactivación' | 'alta por Excel';

/**
 * Una fila de la tabla `ventas`: un ejemplar vendido (FR-07).
 *
 * **No lleva origen** y no le falta: toda fila de esa tabla es una venta. Y `precioVenta` es el
 * precio **vigente del libro en el momento de la venta**, no el actual: es una copia deliberada,
 * porque una corrección de precio posterior no puede reescribir lo que se cobró.
 */
export interface Venta {
  id: number;
  libroId: number;
  /** ISO-8601 en UTC. */
  fecha: string;
  precioVenta: number;
}

/** Una fila de la tabla `libros`. */
export interface Libro {
  id: number;
  titulo: string;
  /** Clave de identidad: título normalizado, con `UNIQUE` en la base. */
  tituloNormalizado: string;
  /** Clave de orden y de búsqueda por título. Distinta de la identidad. */
  tituloOrden: string;
  editorial: string;
  editorialNormalizada: string;
  stock: number;
  precio: number;
  estado: EstadoLibro;
  /** ISO-8601 en UTC. */
  creadoEn: string;
}
