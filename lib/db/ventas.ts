import 'server-only';

import type Database from 'better-sqlite3';

import { obtenerDb } from './conexion';
import type { ResultadoVender } from './errores';
import type { OrigenStock } from './tipos';

/**
 * Origen de la entrada de historial que produce la venta.
 *
 * El tipo es `OrigenStock` y **no** la intersección `OrigenPrecio & OrigenStock` que usa el alta:
 * `'venta'` sólo existe en la lista de `historial_stock`, porque una venta nunca cambia un precio
 * (PRD-001 RF-13). Un copy-paste del patrón del alta no compila, y está bien que no compile: el
 * arreglo no es ensanchar el tipo —eso dejaría a `historial_precio` aceptando un origen que su
 * propio `CHECK` rechaza— sino escribir el conjunto al que este módulo escribe de verdad.
 */
const ORIGEN_VENTA: OrigenStock = 'venta';

/** Una venta descuenta exactamente un ejemplar (FR-02). */
const EJEMPLARES_POR_VENTA = 1;

/**
 * La fila vigente del libro, leída **dentro de la transacción** de la venta (M4, riesgo R5).
 *
 * Traer el `precio` acá es la mitigación M2 entera: el precio de venta sale de esta fila y no del
 * formulario, así que un `POST` a mano no puede fijar a qué precio se vendió. Y traer el `stock`
 * acá, y no antes de abrir la transacción, es lo que cierra el check-then-act: entre comprobar que
 * hay ejemplares y descontarlos no queda ventana.
 *
 * Filtra `estado = 'activo'` por la misma razón que la lectura por id (M5, riesgo R6): un libro que
 * la vista de detalle no muestra tampoco se puede vender, y hoy ningún test de negocio se pondría
 * rojo si el filtro faltara, porque nada archiva todavía.
 *
 * Trae **dos** columnas y no tres: el `id` no se selecciona porque no se usa —el que viaja a las
 * tres escrituras es el parámetro ya validado, que es el mismo por el que filtra este `WHERE`—. Una
 * columna traída y nunca leída es una promesa de que alguien la mira.
 */
const SQL_LIBRO_A_VENDER = `
  SELECT stock, precio
    FROM libros
   WHERE estado = 'activo'
     AND id = ?
`;

/**
 * El descuento se escribe con el valor ya calculado y no con un `stock - 1` del motor.
 *
 * Es el mismo número que viaja como `cantidad_resultante` a `historial_stock`, así que el libro y su
 * historial no pueden discrepar: con la resta hecha en SQL serían dos cuentas distintas sobre el
 * mismo dato, y la que quedara mal no la delataría ningún error.
 */
const SQL_DESCONTAR_STOCK = `
  UPDATE libros
     SET stock = ?
   WHERE id = ?
`;

const SQL_INSERTAR_STOCK = `
  INSERT INTO historial_stock (libro_id, fecha, cantidad_anterior, cantidad_resultante, origen)
  VALUES (?, ?, ?, ?, ?)
`;

const SQL_INSERTAR_VENTA = `
  INSERT INTO ventas (libro_id, fecha, precio_venta)
  VALUES (?, ?, ?)
`;

/** Las dos columnas de las que depende la venta, tal como las devuelve SQLite. */
interface FilaAVender {
  stock: number;
  precio: number;
}

/**
 * Vende un ejemplar del libro: descuenta 1 de su stock, registra la venta y su historial (FR-02,
 * FR-07, FR-08, AC-02).
 *
 * Es el **único** camino de escritura de la tabla `ventas`, y el segundo —después del alta— que
 * escribe `libros`. El invariante de `lib/db/libros.ts` sigue valiendo y acá no se toca ninguna de
 * las tres columnas derivadas: la venta no cambia el título ni la editorial.
 *
 * Devuelve una unión discriminada y **no lanza por una condición de negocio**: el stock 0 y el libro
 * que no está son valores de retorno (`ResultadoVender`). Sólo se propaga un fallo de
 * infraestructura, que `app/acciones-libro.ts` traduce a un mensaje genérico (M8).
 *
 * Las cuatro operaciones —leer la fila vigente y las tres escrituras— ocurren dentro de **una sola**
 * transacción, y las tres escrituras son inseparables (Principio III, NFR-01, AC-11): no hay
 * descuento de stock sin su entrada de historial ni venta sin su descuento, y un fallo en cualquiera
 * de las tres revierte las otras dos. Se usa la variante `immediate` por la misma razón que
 * `crearLibro()`: un `BEGIN` diferido no toma el lock de escritura hasta la primera escritura, y la
 * gracia de tener el `SELECT` de control adentro es que no quede ventana entre comprobar y escribir.
 *
 * Las tres escrituras comparten el mismo `ahora`, también como el alta: la fila de `ventas` y la
 * entrada de `historial_stock` son dos rastros del mismo hecho, y con dos instantes distintos
 * emparejarlos volvería a ser un trabajo a ojo.
 *
 * Recibe un `id` ya validado, igual que `leerLibroPorId()`: el identificador llega del navegador y
 * lo valida `app/` antes (M1, riesgo R1) con `identificadorDeLibro()`. Acá viaja ligado por `?`,
 * nunca interpolado.
 *
 * `db` se recibe por parámetro con `obtenerDb()` por defecto: en producción nadie lo pasa y sale la
 * conexión única; los tests le dan una base `:memory:` migrada desde cero.
 */
export function venderEjemplar(id: number, db: Database.Database = obtenerDb()): ResultadoVender {
  const venta = db.transaction((): ResultadoVender => {
    // 1. La fila vigente, acá adentro (M4).
    const fila = db.prepare(SQL_LIBRO_A_VENDER).get(id) as FilaAVender | undefined;

    if (fila === undefined) {
      return { ok: false, motivo: 'libro_inexistente' };
    }

    // 2. Sin ejemplares no hay venta, y no se escribe **nada** (AC-03). Es el servidor el que lo
    //    impide: la pantalla no ofrece el control, pero un `POST` a mano no pasa por la pantalla.
    if (fila.stock < EJEMPLARES_POR_VENTA) {
      return { ok: false, motivo: 'sin_stock' };
    }

    const stockResultante = fila.stock - EJEMPLARES_POR_VENTA;
    const ahora = new Date().toISOString();

    // 3. El descuento.
    db.prepare(SQL_DESCONTAR_STOCK).run(stockResultante, id);

    // 4. Su entrada de historial, inseparable del descuento de arriba (Principio III).
    db.prepare(SQL_INSERTAR_STOCK).run(id, ahora, fila.stock, stockResultante, ORIGEN_VENTA);

    // 5. La venta, con el precio leído en el paso 1 y no con uno recibido de afuera (M2).
    const insercion = db.prepare(SQL_INSERTAR_VENTA).run(id, ahora, fila.precio);

    return {
      ok: true,
      venta: {
        id: Number(insercion.lastInsertRowid),
        libroId: id,
        fecha: ahora,
        precioVenta: fila.precio,
      },
    };
  });

  return venta.immediate();
}
