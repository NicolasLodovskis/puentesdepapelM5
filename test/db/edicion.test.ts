import path from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { editarLibro } from '@/lib/db/edicion';
import { derivarLibro } from '@/lib/dominio/derivar-libro';
import { baseDePrueba } from '@/test/ayudas/base-de-prueba';
import {
  contenido,
  filaDelLibro,
  PRIMER_LIBRO,
  sembrarDosLibros,
} from '@/test/ayudas/catalogo-de-prueba';
import {
  guardiaDeConvencionesDeSql,
  guardiaDeSentenciasSobreUnLibro,
} from '@/test/ayudas/guardias-sql';

/**
 * Tests de la edición (FEAT-001b Block 5: FR-03 a FR-06, FR-09, AC-04 a AC-11, AC-14).
 *
 * La siembra sale de `test/ayudas/catalogo-de-prueba.ts`, igual que `test/db/ventas.test.ts`: dos
 * libros por el camino real de `crearLibro()`, con sus propias aserciones de identidad adentro. Los
 * tests afirman sobre `segundo`, que es el que no tiene id 1.
 */

const SQL_LIBRO_COMPLETO = `
  SELECT titulo, titulo_normalizado, titulo_orden, editorial, editorial_normalizada,
         stock, precio, estado
    FROM libros
   WHERE id = ?
`;

const SQL_HISTORIAL_PRECIO = 'SELECT * FROM historial_precio ORDER BY id';
const SQL_ARCHIVAR = "UPDATE libros SET estado = 'archivado' WHERE id = ?";

interface FilaCompleta {
  titulo: string;
  titulo_normalizado: string;
  titulo_orden: string;
  editorial: string;
  editorial_normalizada: string;
  stock: number;
  precio: number;
  estado: string;
}

function filaCompleta(db: Database.Database, id: number): FilaCompleta {
  return db.prepare(SQL_LIBRO_COMPLETO).get(id) as FilaCompleta;
}

function entradasDePrecio(db: Database.Database): Array<Record<string, unknown>> {
  return db.prepare(SQL_HISTORIAL_PRECIO).all() as Array<Record<string, unknown>>;
}

/**
 * Reemplaza `db.prepare` en **esta** instancia para observar, sin alterarlas, las sentencias que
 * la operación llega a preparar. Es lo que hace falsable AC-10: un `UPDATE` que escribe el mismo
 * valor que ya estaba renderiza y compara igual que si no se hubiera ejecutado ninguno, así que
 * comparar el estado antes/después no alcanza. Acá se prueba que la sentencia de escritura ni
 * siquiera se preparó.
 */
function espiarSentencias(db: Database.Database): string[] {
  const preparar = db.prepare.bind(db) as (sql: string) => unknown;
  const capturadas: string[] = [];

  db.prepare = ((sql: string) => {
    capturadas.push(sql);
    return preparar(sql);
  }) as unknown as Database.Database['prepare'];

  return capturadas;
}

/** Cuáles de las sentencias capturadas son una escritura sobre `libros` o sobre un historial. */
function escrituras(capturadas: string[]): string[] {
  return capturadas.filter((sql) => /UPDATE libros|INSERT INTO historial_/u.test(sql));
}

/**
 * Reemplaza `db.prepare` para que una sentencia puntual falle al ejecutarse, igual que
 * `test/db/ventas.test.ts`.
 */
function intervenirPrepare(
  db: Database.Database,
  intervencion: (sql: string) => object | undefined,
): void {
  const preparar = db.prepare.bind(db) as (sql: string) => unknown;
  db.prepare = ((sql: string) =>
    intervencion(sql) ?? preparar(sql)) as unknown as Database.Database['prepare'];
}

describe('editarLibro()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = baseDePrueba();
  });

  afterEach(() => {
    db.close();
  });

  it('cambia el precio de P a P′ y agrega la entrada de historial con origen edición manual (AC-04)', () => {
    const { primero, segundo: libro } = sembrarDosLibros(db);
    const precioNuevo = libro.precio + 1000;

    const resultado = editarLibro(
      libro.id,
      {
        titulo: libro.titulo,
        editorial: libro.editorial,
        stock: String(libro.stock),
        precio: String(precioNuevo),
      },
      db,
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(filaDelLibro(db, libro.id).precio).toBe(precioNuevo);
    // Y el otro libro no se movió.
    expect(filaDelLibro(db, primero.id).precio).toBe(primero.precio);

    const entradas = entradasDePrecio(db);
    expect(entradas[entradas.length - 1]).toMatchObject({
      libro_id: libro.id,
      precio_anterior: libro.precio,
      precio_nuevo: precioNuevo,
      origen: 'edición manual',
    });
  });

  it('rechaza un precio con decimal ≠ 0, separador de miles, no numérico o ausente, sin escribir (AC-05)', () => {
    const { segundo: libro } = sembrarDosLibros(db);
    const antes = contenido(db);
    const casos: Array<{ precio: unknown; motivo: string }> = [
      { precio: '1234,50', motivo: 'decimal' },
      { precio: '1.234', motivo: 'separador_miles' },
      { precio: 'abc', motivo: 'no_numerico' },
      { precio: null, motivo: 'ausente' },
    ];

    for (const caso of casos) {
      const resultado = editarLibro(
        libro.id,
        {
          titulo: libro.titulo,
          editorial: libro.editorial,
          stock: String(libro.stock),
          precio: caso.precio,
        },
        db,
      );

      expect(resultado, caso.motivo).toEqual({
        ok: false,
        motivo: 'campos_invalidos',
        errores: [{ campo: 'precio', detalle: caso.motivo }],
      });
    }

    expect(filaDelLibro(db, libro.id).precio).toBe(libro.precio);
    expect(contenido(db)).toEqual(antes);
  });

  it('cambia el stock de S a S′ y agrega la entrada de historial con origen edición manual (AC-06)', () => {
    const { primero, segundo: libro } = sembrarDosLibros(db);
    const stockNuevo = libro.stock + 5;

    const resultado = editarLibro(
      libro.id,
      {
        titulo: libro.titulo,
        editorial: libro.editorial,
        stock: String(stockNuevo),
        precio: String(libro.precio),
      },
      db,
    );

    expect(resultado.ok).toBe(true);
    expect(filaDelLibro(db, libro.id).stock).toBe(stockNuevo);
    expect(filaDelLibro(db, primero.id).stock).toBe(primero.stock);

    const historial = db.prepare('SELECT * FROM historial_stock ORDER BY id').all() as Array<
      Record<string, unknown>
    >;
    expect(historial[historial.length - 1]).toMatchObject({
      libro_id: libro.id,
      cantidad_anterior: libro.stock,
      cantidad_resultante: stockNuevo,
      origen: 'edición manual',
    });
  });

  it('cambia el título y la editorial: el libro queda recuperable por los nuevos valores (AC-07)', () => {
    const { segundo: libro } = sembrarDosLibros(db);
    const tituloNuevo = 'Rayuela';
    const editorialNueva = 'Sudamericana';

    const resultado = editarLibro(
      libro.id,
      {
        titulo: tituloNuevo,
        editorial: editorialNueva,
        stock: String(libro.stock),
        precio: String(libro.precio),
      },
      db,
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const derivadas = derivarLibro(tituloNuevo, editorialNueva);
    const fila = filaCompleta(db, libro.id);

    expect(fila.titulo).toBe(tituloNuevo);
    expect(fila.editorial).toBe(editorialNueva);
    expect(fila.titulo_normalizado).toBe(derivadas.tituloNormalizado);
    expect(fila.titulo_orden).toBe(derivadas.tituloOrden);
    expect(fila.editorial_normalizada).toBe(derivadas.editorialNormalizada);

    expect(resultado.libro.titulo).toBe(tituloNuevo);
    expect(resultado.libro.editorial).toBe(editorialNueva);
  });

  it('rechaza título o editorial vacíos, sin modificar el libro (AC-08)', () => {
    const { segundo: libro } = sembrarDosLibros(db);
    const antes = filaCompleta(db, libro.id);

    const sinTitulo = editarLibro(
      libro.id,
      {
        titulo: '   ',
        editorial: libro.editorial,
        stock: String(libro.stock),
        precio: String(libro.precio),
      },
      db,
    );
    expect(sinTitulo).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [{ campo: 'titulo', detalle: 'vacio' }],
    });

    const sinEditorial = editarLibro(
      libro.id,
      {
        titulo: libro.titulo,
        editorial: '',
        stock: String(libro.stock),
        precio: String(libro.precio),
      },
      db,
    );
    expect(sinEditorial).toEqual({
      ok: false,
      motivo: 'campos_invalidos',
      errores: [{ campo: 'editorial', detalle: 'vacio' }],
    });

    expect(filaCompleta(db, libro.id)).toEqual(antes);
  });

  it('un nuevo título que normaliza igual que otro libro bloquea la edición y nombra el conflicto (AC-09)', () => {
    const { primero, segundo: libro } = sembrarDosLibros(db);
    // `PRIMER_LIBRO.titulo` es 'El Aleph'; el artículo pospuesto normaliza igual.
    expect(PRIMER_LIBRO.titulo).toBe('El Aleph');
    const antes = filaCompleta(db, libro.id);

    const resultado = editarLibro(
      libro.id,
      {
        titulo: 'Aleph, El',
        editorial: libro.editorial,
        stock: String(libro.stock),
        precio: String(libro.precio),
      },
      db,
    );

    expect(resultado).toEqual({
      ok: false,
      motivo: 'titulo_duplicado',
      conflicto: { id: primero.id, titulo: primero.titulo, editorial: primero.editorial },
    });
    expect(filaCompleta(db, libro.id)).toEqual(antes);
  });

  it('un nuevo título que difiere de otro sólo en puntuación final bloquea la edición (AC-14)', () => {
    const { primero, segundo: libro } = sembrarDosLibros(db);
    const antes = filaCompleta(db, libro.id);

    const resultado = editarLibro(
      libro.id,
      // 'El Aleph.' normaliza igual que 'El Aleph': sólo difiere en el punto final.
      {
        titulo: 'El Aleph.',
        editorial: libro.editorial,
        stock: String(libro.stock),
        precio: String(libro.precio),
      },
      db,
    );

    expect(resultado).toEqual({
      ok: false,
      motivo: 'titulo_duplicado',
      conflicto: { id: primero.id, titulo: primero.titulo, editorial: primero.editorial },
    });
    expect(filaCompleta(db, libro.id)).toEqual(antes);
  });

  it('con los cuatro campos iguales a los vigentes no modifica el libro ni agrega historial (AC-10)', () => {
    const { segundo: libro } = sembrarDosLibros(db);
    const antes = contenido(db);
    const capturadas = espiarSentencias(db);

    const resultado = editarLibro(
      libro.id,
      {
        titulo: libro.titulo,
        editorial: libro.editorial,
        stock: String(libro.stock),
        precio: String(libro.precio),
      },
      db,
    );

    expect(resultado.ok).toBe(true);
    expect(contenido(db)).toEqual(antes);
    // La prueba de verdad: ninguna sentencia de escritura llegó siquiera a prepararse.
    expect(escrituras(capturadas)).toEqual([]);
  });

  it('si falla la escritura del historial de precio, no persiste el cambio del libro (AC-11)', () => {
    const { segundo: libro } = sembrarDosLibros(db);
    const antes = filaCompleta(db, libro.id);
    const precioNuevo = libro.precio + 500;

    intervenirPrepare(db, (sql) =>
      sql.includes('INSERT INTO historial_precio')
        ? {
            run: () => {
              throw new Error('disk I/O error');
            },
          }
        : undefined,
    );

    expect(() =>
      editarLibro(
        libro.id,
        {
          titulo: libro.titulo,
          editorial: libro.editorial,
          stock: String(libro.stock),
          precio: String(precioNuevo),
        },
        db,
      ),
    ).toThrow(/disk I\/O error/u);

    expect(filaCompleta(db, libro.id)).toEqual(antes);
  });

  it('sobre un libro inexistente devuelve motivo tipado y no escribe nada (sad path)', () => {
    const { segundo: libro } = sembrarDosLibros(db);
    const antes = contenido(db);

    const resultado = editarLibro(
      libro.id + 1000,
      { titulo: 'Cualquiera', editorial: 'Cualquiera', stock: '1', precio: '1000' },
      db,
    );

    expect(resultado).toEqual({ ok: false, motivo: 'libro_inexistente' });
    expect(contenido(db)).toEqual(antes);
  });

  it('sobre un libro archivado responde igual que sobre uno inexistente', () => {
    const { segundo: libro } = sembrarDosLibros(db);
    db.prepare(SQL_ARCHIVAR).run(libro.id);
    const antes = contenido(db);

    const resultado = editarLibro(
      libro.id,
      {
        titulo: 'Otro título',
        editorial: libro.editorial,
        stock: String(libro.stock),
        precio: String(libro.precio),
      },
      db,
    );

    expect(resultado).toEqual({ ok: false, motivo: 'libro_inexistente' });
    expect(contenido(db)).toEqual(antes);
  });

  it('la entrada de EntradaEdicion documenta que sólo recibe id, entrada y la conexión (cinturón)', () => {
    // Cinturón estructural: `editarLibro` no admite parámetros de más por los que se pudiera
    // colar un dato que no pasó por la validación.
    expect(editarLibro.length).toBe(2);
  });
});

/**
 * Guardias de convención de `lib/db/edicion.ts` (M9), registradas igual que `lib/db/ventas.ts`.
 */
const MODULO_DE_LA_EDICION = path.join('lib', 'db', 'edicion.ts');

guardiaDeConvencionesDeSql({ relativo: MODULO_DE_LA_EDICION });

guardiaDeSentenciasSobreUnLibro({
  relativo: MODULO_DE_LA_EDICION,
  esperadas: [
    'SQL_LIBRO_A_EDITAR',
    'SQL_ACTUALIZAR_TITULO',
    'SQL_ACTUALIZAR_EDITORIAL',
    'SQL_ACTUALIZAR_PRECIO',
    'SQL_ACTUALIZAR_STOCK',
  ],
});
