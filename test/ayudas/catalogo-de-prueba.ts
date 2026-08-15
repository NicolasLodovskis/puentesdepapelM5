import type Database from 'better-sqlite3';
import { expect } from 'vitest';

import { crearLibro, type EntradaLibro } from '@/lib/db/libros';
import type { Libro } from '@/lib/db/tipos';

/**
 * La siembra compartida de los tests que operan sobre **un libro concreto** de una base de prueba,
 * y las consultas con las que se mide qué quedó escrito.
 *
 * **Por qué sembrar dos libros es el camino por defecto y no un endurecimiento opcional.** Con un
 * solo libro en la base, `libro.id` vale siempre 1, así que toda propiedad de la forma «la operación
 * toca el libro que le piden» es infalsificable: clavar un `1` en cualquiera de las escrituras, en el
 * destino de la redirección o en el campo oculto del formulario renderiza y escribe exactamente lo
 * mismo que el código correcto. Ese molde produjo nueve puntos ciegos en cuatro rondas de revisión de
 * este bloque —el peor de ellos, una entrada de `historial_stock` escrita con el `libro_id`
 * equivocado, que el Principio III prohíbe editar o borrar—. La forma de cerrarlo no es acordarse de
 * sembrar dos libros en cada test nuevo: es que la siembra por defecto sean dos y que **la propia
 * siembra** lleve adentro las aserciones que la hacen valer.
 *
 * De ahí que `sembrarDosLibros()` afirme por su cuenta que los dos ids son distintos, que el segundo
 * no es 1, y que los cuatro campos que distinguen a un libro del otro —título, editorial, stock y
 * precio— sean de verdad distintos. Los dos últimos no son celo: con precios o stocks iguales, una
 * aserción sobre «el precio de la venta» o sobre «el stock que quedó» se satisface por coincidencia y
 * deja pasar la constante clavada (el caso vivido: `stock` sembrado 3 y `4 − 1 = 3` del libro de al
 * lado).
 *
 * Vive en `test/ayudas/` —que no entra en el `include` de suites ni en el de cobertura— junto a
 * `base-de-prueba.ts`, y no dentro del primer test que lo estrenó: `test/db/ventas.test.ts` y
 * `test/app/acciones-libro.test.ts` ya tenían cada uno su copia del sembrador, de la constante del
 * segundo libro y de las cuatro consultas de conteo, y `lib/db/edicion.ts` del Block 5 necesita
 * exactamente la misma siembra. Tres copias de una siembra son tres lugares donde la aserción de
 * identidad se puede olvidar, y la que se olvide es la que deja de exigir.
 */

/**
 * El id que hace infalsificable a un test que siembra un solo libro.
 *
 * `AUTOINCREMENT` lo asigna a la primera fila de una base recién migrada, así que es el valor que un
 * `1` clavado en el código produce «por casualidad correcto».
 */
const PRIMER_ID = 1;

/**
 * El primer libro de la siembra. Los cuatro valores viajan como texto, igual que el formulario del
 * alta: la siembra recorre el camino de escritura de verdad y no un `INSERT` propio, así que la
 * operación bajo prueba opera sobre un catálogo con sus dos entradas de historial de alta.
 */
export const PRIMER_LIBRO: EntradaLibro = {
  titulo: 'El Aleph',
  editorial: 'Sur',
  stock: '3',
  precio: '9500',
};

/**
 * El segundo libro, distinto del primero en los cuatro campos.
 *
 * El título tiene que normalizar distinto que el del primero: el alta rechaza la identidad repetida y
 * la siembra lanza. Es falla ruidosa y está bien que lo sea, pero conviene no provocarla.
 *
 * Stock 7 y no 4 a propósito: con 4, la resta de la venta (`4 − 1`) da justo el stock sembrado del
 * primero y una aserción sobre «el stock que quedó» pasa a satisfacerse por coincidencia. Con 7 y 3
 * ninguna de las dos restas coincide con ningún stock sembrado.
 */
export const SEGUNDO_LIBRO: EntradaLibro = {
  titulo: 'Ficciones',
  editorial: 'Emecé',
  stock: '7',
  precio: '12500',
};

/**
 * Las cuatro consultas de conteo son literales fijos, uno por tabla, en vez de uno solo con el
 * nombre de la tabla interpolado: ni en los tests se arma SQL por concatenación.
 */
export const CONTEOS = {
  libros: 'SELECT COUNT(*) AS n FROM libros',
  historialPrecio: 'SELECT COUNT(*) AS n FROM historial_precio',
  historialStock: 'SELECT COUNT(*) AS n FROM historial_stock',
  ventas: 'SELECT COUNT(*) AS n FROM ventas',
} as const;

const SQL_LIBRO = 'SELECT stock, precio, estado FROM libros WHERE id = ?';
const SQL_VENTAS = 'SELECT * FROM ventas ORDER BY id';
const SQL_HISTORIAL_STOCK = 'SELECT * FROM historial_stock ORDER BY id';

export type Conteos = Record<keyof typeof CONTEOS, number>;

/** Cuántas filas hay en cada tabla: la medida de «no se escribió nada». */
export function contenido(db: Database.Database): Conteos {
  return {
    libros: (db.prepare(CONTEOS.libros).get() as { n: number }).n,
    historialPrecio: (db.prepare(CONTEOS.historialPrecio).get() as { n: number }).n,
    historialStock: (db.prepare(CONTEOS.historialStock).get() as { n: number }).n,
    ventas: (db.prepare(CONTEOS.ventas).get() as { n: number }).n,
  };
}

export interface FilaDelLibro {
  stock: number;
  precio: number;
  estado: string;
}

/** La fila vigente del libro, leída por su clave primaria. */
export function filaDelLibro(db: Database.Database, id: number): FilaDelLibro {
  return db.prepare(SQL_LIBRO).get(id) as FilaDelLibro;
}

/** El stock vigente del libro. */
export function stockDe(db: Database.Database, id: number): number {
  return filaDelLibro(db, id).stock;
}

export function ventas(db: Database.Database): Array<Record<string, unknown>> {
  return db.prepare(SQL_VENTAS).all() as Array<Record<string, unknown>>;
}

export function entradasDeStock(db: Database.Database): Array<Record<string, unknown>> {
  return db.prepare(SQL_HISTORIAL_STOCK).all() as Array<Record<string, unknown>>;
}

/** Siembra un libro por el camino real del alta. La entrada viaja como texto, igual que el form. */
export function sembrarLibro(db: Database.Database, cambios: Partial<EntradaLibro> = {}): Libro {
  const resultado = crearLibro({ ...PRIMER_LIBRO, ...cambios }, db);

  if (!resultado.ok) {
    throw new Error(`La semilla no se pudo dar de alta: ${JSON.stringify(resultado)}`);
  }

  return resultado.libro;
}

export interface DosLibros {
  primero: Libro;
  segundo: Libro;
}

/** Los cambios que cada test le hace a la siembra por defecto, por libro. */
export interface CambiosDeLaSiembra {
  primero?: Partial<EntradaLibro>;
  segundo?: Partial<EntradaLibro>;
}

/**
 * Siembra **dos** libros distintos y devuelve los dos, con las aserciones de identidad adentro.
 *
 * Las aserciones van acá y no en cada test a propósito: son las que hacen falsable cualquier
 * afirmación sobre *cuál* libro se tocó, y un test nuevo no tiene por qué acordarse de escribirlas.
 * Si una siembra volviera a dejar el segundo id en 1 —o si un test le pasara valores que coinciden
 * con los del primero— esto se pone rojo acá, en la siembra, en vez de dejar el test en su estado
 * infalsificable sin que nada avise.
 *
 * Los tests afirman sobre `segundo`: es el que tiene id ≠ 1, y por lo tanto el único sobre el que una
 * constante clavada se distingue del código correcto.
 */
export function sembrarDosLibros(
  db: Database.Database,
  cambios: CambiosDeLaSiembra = {},
): DosLibros {
  const primero = sembrarLibro(db, { ...PRIMER_LIBRO, ...cambios.primero });
  const segundo = sembrarLibro(db, { ...SEGUNDO_LIBRO, ...cambios.segundo });

  // El id: la mitad que hace falsable «la operación toca el libro que le piden».
  expect(segundo.id, 'la siembra dejó los dos libros con el mismo id').not.toBe(primero.id);
  expect(
    segundo.id,
    `el segundo libro quedó con el id ${String(PRIMER_ID)}: un ${String(PRIMER_ID)} clavado en el código no se distinguiría`,
  ).not.toBe(PRIMER_ID);

  // Y los cuatro valores que distinguen un libro del otro: con cualquiera de ellos repetido, la
  // aserción que lo mire se satisface por coincidencia.
  expect(segundo.titulo, 'los dos libros comparten el título').not.toBe(primero.titulo);
  expect(segundo.editorial, 'los dos libros comparten la editorial').not.toBe(primero.editorial);
  expect(segundo.stock, 'los dos libros comparten el stock').not.toBe(primero.stock);
  expect(segundo.precio, 'los dos libros comparten el precio').not.toBe(primero.precio);

  return { primero, segundo };
}
