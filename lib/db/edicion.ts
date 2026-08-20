import 'server-only';

import type Database from 'better-sqlite3';

import { derivarLibro } from '@/lib/dominio/derivar-libro';
import { parsearPrecio } from '@/lib/dominio/parsear-precio';

import { obtenerDb } from './conexion';
import type { ErrorCampo, ResultadoEditar } from './errores';
import { buscarConflicto, esViolacionDeUnique, validarStock, validarTexto } from './libros';
import type { EstadoLibro, OrigenPrecio, OrigenStock } from './tipos';

/**
 * Edita título, editorial, stock y precio de un libro (FEAT-001b Block 5: FR-03 a FR-06, FR-09).
 *
 * **Reusa la validación del alta, no la reimplementa.** `validarTexto()` y `validarStock()` son las
 * mismas funciones de `lib/db/libros.ts`, exportadas para este módulo: dos vocabularios de rechazo
 * para el mismo campo es cómo la usuaria deja de entender por qué le rechazan un dato. `precio` es
 * la única excepción — la spec pide reusar `parsearPrecio()` y no el `validarPrecio()` privado del
 * alta — así que este módulo lleva su propio envoltorio, `validarPrecioDeEdicion()`, que produce el
 * mismo `ErrorCampo` con `campo: 'precio'` sin copiar ni el regex ni las reglas de interpretación.
 */

/** Entrada de una edición, tal como llega del `FormData` del formulario del detalle. */
export interface EntradaEdicion {
  titulo: unknown;
  editorial: unknown;
  stock: unknown;
  precio: unknown;
}

/**
 * Origen de las entradas de historial que produce una edición manual.
 *
 * Es la intersección `OrigenPrecio & OrigenStock`, igual que `ORIGEN_ALTA` de `libros.ts`: esta
 * operación puede escribir en las dos tablas de historial —según qué campo cambie— y las dos listas
 * de orígenes son distintas, así que sólo un literal admitido por ambas puede sentarse acá.
 */
const ORIGEN_EDICION: OrigenPrecio & OrigenStock = 'edición manual';

/**
 * La fila vigente del libro, leída **dentro de la transacción** de la edición (M4, riesgo R5).
 *
 * Filtra `estado = 'activo'`, igual que la venta (M5, riesgo R6): un libro que la vista de detalle
 * no muestra tampoco se puede editar, y un `POST` a mano no pasa por esa pantalla.
 */
const SQL_LIBRO_A_EDITAR = `
  SELECT titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
         stock, precio, estado, creado_en
    FROM libros
   WHERE estado = 'activo'
     AND id = ?
`;

/**
 * Las cuatro escrituras posibles sobre `libros`, una por campo que puede cambiar.
 *
 * Son cuatro sentencias separadas y no una sola con un `SET` armado según qué cambió: ese `SET`
 * tendría que concatenarse en tiempo de ejecución, que es exactamente lo que M9 prohíbe (ninguna
 * sentencia se arma con `${}` ni por concatenación). Cuatro sentencias fijas, cada una ejecutada
 * sólo si le corresponde, cumplen FR-09 —«para cada campo que no cambia, no se escribe nada»— sin
 * necesitar SQL dinámico.
 */
const SQL_ACTUALIZAR_TITULO = `
  UPDATE libros
     SET titulo = ?, titulo_normalizado = ?, titulo_orden = ?
   WHERE id = ?
`;

const SQL_ACTUALIZAR_EDITORIAL = `
  UPDATE libros
     SET editorial = ?, editorial_normalizada = ?
   WHERE id = ?
`;

const SQL_ACTUALIZAR_PRECIO = `
  UPDATE libros
     SET precio = ?
   WHERE id = ?
`;

const SQL_ACTUALIZAR_STOCK = `
  UPDATE libros
     SET stock = ?
   WHERE id = ?
`;

const SQL_INSERTAR_HISTORIAL_PRECIO = `
  INSERT INTO historial_precio (libro_id, fecha, precio_anterior, precio_nuevo, origen)
  VALUES (?, ?, ?, ?, ?)
`;

const SQL_INSERTAR_HISTORIAL_STOCK = `
  INSERT INTO historial_stock (libro_id, fecha, cantidad_anterior, cantidad_resultante, origen)
  VALUES (?, ?, ?, ?, ?)
`;

/**
 * Mensaje del único fallo que `editarLibro()` fabrica, igual que `crearLibro()`: genérico y sin
 * nombrar tablas, columnas ni códigos de SQLite (mitigación 8, riesgo R10).
 */
const ERROR_UNIQUE_SIN_CONFLICTO =
  'No se pudo editar el libro: la base rechazó la identidad del título, ' +
  'pero el libro en conflicto no aparece en el catálogo.';

/** La fila vigente, tal como la devuelve SQLite: columnas en snake_case. */
interface FilaAEditar {
  titulo: string;
  titulo_normalizado: string;
  titulo_orden: string;
  editorial: string;
  editorial_normalizada: string;
  stock: number;
  precio: number;
  estado: EstadoLibro;
  creado_en: string;
}

/** Un campo validado: o su valor ya interpretado, o el motivo del rechazo. Igual que en `libros.ts`. */
type CampoValidado<T> = { ok: true; valor: T } | { ok: false; error: ErrorCampo };

/**
 * Valida `precio` delegando en `parsearPrecio()`, sin pasar por el `validarPrecio()` privado del
 * alta: la spec nombra `parsearPrecio()` a propósito, y este envoltorio traslada su motivo tal cual
 * —`decimal`, `separador_miles`, `ausente`, `no_numerico` o `fuera_de_rango`— sin reagruparlos.
 */
function validarPrecioDeEdicion(valor: unknown): CampoValidado<number> {
  const interpretable =
    valor === null || valor === undefined || typeof valor === 'string' || typeof valor === 'number';

  if (!interpretable) {
    // Un `File` de un `FormData` manipulado no es numérico. No se lo pasa por `String()`:
    // convertirlo sería inventar un precio.
    return { ok: false, error: { campo: 'precio', detalle: 'no_numerico' } };
  }

  const precio = parsearPrecio(valor);

  return precio.ok
    ? { ok: true, valor: precio.valor }
    : { ok: false, error: { campo: 'precio', detalle: precio.motivo } };
}

/** Junta los rechazos en el orden de los campos del formulario: uno por campo, nunca dos. */
function recolectarErrores(...campos: Array<CampoValidado<unknown>>): ErrorCampo[] {
  return campos.flatMap((campo) => (campo.ok ? [] : [campo.error]));
}

/**
 * Edita título, editorial, stock y precio de un libro existente.
 *
 * Devuelve una unión discriminada y **no lanza por una condición de negocio**: el campo inválido,
 * el título duplicado y el libro que no está son valores de retorno (`ResultadoEditar`). Sólo se
 * propaga un fallo de infraestructura, que `app/acciones-libro.ts` traduce a un mensaje genérico.
 *
 * Los cuatro pasos —leer la fila vigente, validar, comparar contra lo vigente y escribir sólo lo
 * que cambió— ocurren dentro de **una sola** transacción `immediate` (M4, NFR-01): la lectura de
 * control y las escrituras no pueden tener una ventana entre medio, y las escrituras de un mismo
 * campo (el libro y su historial) son inseparables (Principio III, AC-11): un fallo en cualquiera
 * de las dos revierte la otra.
 *
 * **Para cada campo que no cambia, no se escribe nada** (FR-09, AC-10): ni la columna del libro ni
 * su entrada de historial. Es la razón por la que las escrituras de `libros` son cuatro sentencias
 * fijas —una por campo— y no un único `UPDATE` con las cuatro columnas: escribir siempre las cuatro
 * columnas, aunque tres conserven su propio valor, seguiría siendo una escritura sobre la fila, y
 * AC-10 pide que no haya ninguna cuando nada cambia.
 *
 * Si cambia el título o la editorial, las tres columnas derivadas se recalculan con `derivarLibro()`
 * —el único productor del proyecto (Block 1)— y se busca un conflicto de identidad **excluyendo el
 * propio libro** con `buscarConflicto(db, tituloNormalizado, id)`: sin la exclusión, un libro que no
 * cambia su título colisionaría con su propia fila.
 */
export function editarLibro(
  id: number,
  entrada: EntradaEdicion,
  db: Database.Database = obtenerDb(),
): ResultadoEditar {
  const edicion = db.transaction((): ResultadoEditar => {
    // 1. La fila vigente, acá adentro (M4).
    const fila = db.prepare(SQL_LIBRO_A_EDITAR).get(id) as FilaAEditar | undefined;

    if (fila === undefined) {
      return { ok: false, motivo: 'libro_inexistente' };
    }

    // 2. Validar, reusando las reglas del alta. Si algo falla, no se toca la base.
    const titulo = validarTexto(entrada.titulo, 'titulo');
    const editorial = validarTexto(entrada.editorial, 'editorial');
    const stock = validarStock(entrada.stock);
    const precio = validarPrecioDeEdicion(entrada.precio);

    if (!titulo.ok || !editorial.ok || !stock.ok || !precio.ok) {
      return {
        ok: false,
        motivo: 'campos_invalidos',
        errores: recolectarErrores(titulo, editorial, stock, precio),
      };
    }

    // 3. Comparar con lo vigente: sólo se escribe lo que de verdad cambia (FR-09, AC-10).
    const cambiaTitulo = titulo.valor !== fila.titulo;
    const cambiaEditorial = editorial.valor !== fila.editorial;
    const cambiaPrecio = precio.valor !== fila.precio;
    const cambiaStock = stock.valor !== fila.stock;

    let tituloNormalizado = fila.titulo_normalizado;
    let tituloOrden = fila.titulo_orden;
    let editorialNormalizada = fila.editorial_normalizada;

    // 4. Si cambia el título o la editorial: recalcular las tres columnas derivadas y comprobar
    //    el conflicto de identidad, excluyendo el propio libro.
    if (cambiaTitulo || cambiaEditorial) {
      const derivadas = derivarLibro(titulo.valor, editorial.valor);
      tituloNormalizado = derivadas.tituloNormalizado;
      tituloOrden = derivadas.tituloOrden;
      editorialNormalizada = derivadas.editorialNormalizada;

      if (cambiaTitulo && tituloNormalizado === '') {
        // Mismo caso borde que `crearLibro()`: un título sin letras ni dígitos no es vacío para
        // `validarTexto()`, pero su identidad sí lo es, y el esquema exige
        // `length(titulo_normalizado) >= 1`. Se rechaza acá y no se deja saltar el CHECK.
        return {
          ok: false,
          motivo: 'campos_invalidos',
          errores: [{ campo: 'titulo', detalle: 'vacio' }],
        };
      }

      const conflicto = buscarConflicto(db, tituloNormalizado, id);
      if (conflicto !== undefined) {
        return { ok: false, motivo: 'titulo_duplicado', conflicto };
      }
    }

    if (!cambiaTitulo && !cambiaEditorial && !cambiaPrecio && !cambiaStock) {
      // Nada cambió: ni una columna del libro ni una entrada de historial (AC-10). Se devuelve el
      // libro tal como está, sin ejecutar una sola escritura.
      return {
        ok: true,
        libro: {
          id,
          titulo: fila.titulo,
          tituloNormalizado: fila.titulo_normalizado,
          tituloOrden: fila.titulo_orden,
          editorial: fila.editorial,
          editorialNormalizada: fila.editorial_normalizada,
          stock: fila.stock,
          precio: fila.precio,
          estado: fila.estado,
          creadoEn: fila.creado_en,
        },
      };
    }

    const ahora = new Date().toISOString();

    try {
      // 5. El libro, sólo en las columnas que cambiaron, y su historial —inseparable de cada
      //    escritura de precio o de stock (Principio III, AC-11).
      if (cambiaTitulo) {
        db.prepare(SQL_ACTUALIZAR_TITULO).run(titulo.valor, tituloNormalizado, tituloOrden, id);
      }

      if (cambiaEditorial) {
        db.prepare(SQL_ACTUALIZAR_EDITORIAL).run(editorial.valor, editorialNormalizada, id);
      }

      if (cambiaPrecio) {
        db.prepare(SQL_ACTUALIZAR_PRECIO).run(precio.valor, id);
        db.prepare(SQL_INSERTAR_HISTORIAL_PRECIO).run(
          id,
          ahora,
          fila.precio,
          precio.valor,
          ORIGEN_EDICION,
        );
      }

      if (cambiaStock) {
        db.prepare(SQL_ACTUALIZAR_STOCK).run(stock.valor, id);
        db.prepare(SQL_INSERTAR_HISTORIAL_STOCK).run(
          id,
          ahora,
          fila.stock,
          stock.valor,
          ORIGEN_EDICION,
        );
      }

      return {
        ok: true,
        libro: {
          id,
          titulo: titulo.valor,
          tituloNormalizado,
          tituloOrden,
          editorial: editorial.valor,
          editorialNormalizada,
          stock: stock.valor,
          precio: precio.valor,
          estado: fila.estado,
          creadoEn: fila.creado_en,
        },
      };
    } catch (error) {
      if (!esViolacionDeUnique(error)) {
        throw error;
      }

      // Carrera imposible en un proceso único, pero el UNIQUE es la barrera real: se reconsulta
      // excluyendo el propio libro y se devuelve el mismo resultado de negocio.
      const tardio = buscarConflicto(db, tituloNormalizado, id);
      if (tardio === undefined) {
        throw new Error(ERROR_UNIQUE_SIN_CONFLICTO);
      }

      return { ok: false, motivo: 'titulo_duplicado', conflicto: tardio };
    }
  });

  return edicion.immediate();
}
