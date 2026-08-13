import 'server-only';

import type Database from 'better-sqlite3';

import { derivarLibro } from '@/lib/dominio/derivar-libro';

import type { ErrorDeColisionDeIdentidad } from '../errores';

/**
 * Migración 003 — recálculo de la identidad de los libros ya cargados (FEAT-001b FR-11).
 *
 * FR-10 cambió `normalizarTitulo()`: la puntuación del final dejó de ser parte de la identidad.
 * La identidad es una columna **derivada y almacenada**, así que ese cambio no alcanza por sí
 * solo a las filas que ya están en la base: sin este recálculo el catálogo queda con identidades
 * calculadas por una función que ya no existe, el `UNIQUE` protege una clave que nadie calcula y
 * el mismo libro puede volver a entrar (riesgo R8).
 *
 * Es una migración **de lógica** y no de SQL porque la identidad la produce
 * `derivarLibro()` —única productora de las tres columnas calculadas— y reescribirla en SQL
 * sería una segunda implementación de la normalización, que es exactamente la desincronización
 * que este bloque viene a cerrar.
 *
 * Corre **dentro de la transacción del runner** (`lib/db/migrar.ts`): no abre la suya ni hace
 * COMMIT. Si lanza, el runner revierte también el DDL de la 002 y `user_version` queda donde
 * estaba (AC-16).
 */

/**
 * Mensaje del error de colisión.
 *
 * Genérico y sin un solo dato del catálogo: ni títulos, ni ids, ni cuántos son (AC-16,
 * mitigaciones 7 y 8). El texto para la usuaria vive en `app/mensajes.ts`; éste es el que va al
 * log del servidor.
 */
const COLISION_DE_IDENTIDAD =
  'El recálculo de identidad encontró libros que pasarían a compartir la identidad del título.';

/**
 * Prefijo del centinela de la primera pasada.
 *
 * Tiene que ser imposible como identidad real, y lo es por construcción: `normalizarTitulo()`
 * reemplaza por espacio todo lo que no sea letra, dígito o espacio, y después colapsa, así que
 * una identidad calculada **no puede contener** ni `#` ni `:`. Con el id pegado atrás, además,
 * es único por fila, que es lo que exige el `UNIQUE` mientras la tabla está a medio reescribir.
 *
 * Se exporta para que ese "por construcción" tenga quien lo verifique: la premisa es una
 * propiedad de `normalizarTitulo()`, que vive en otro módulo y puede cambiar sin que acá se note.
 * La fija el test «el prefijo del centinela no es una identidad producible» de
 * `test/db/identidad.test.ts`.
 */
export const PREFIJO_CENTINELA = '#recalculo-de-identidad:';

/**
 * Se leen las dos columnas de las que depende `derivarLibro()`.
 *
 * `editorial` viaja aunque el recálculo **sólo** escriba `titulo_normalizado`: la firma de
 * `derivarLibro(titulo, editorial)` la exige, y usar la función completa es preferible a
 * derivar la identidad por un camino propio. Las otras dos columnas que devuelve
 * —`titulo_orden` y `editorial_normalizada`— se descartan a propósito: las produce
 * `plegarTexto()`, que FR-10 no tocó, así que reescribirlas sería un UPDATE sin cambio en cada
 * fila del catálogo.
 *
 * Sin filtro de estado: la identidad es `UNIQUE` sobre **toda** la tabla, así que un libro
 * archivado que quedara sin recalcular seguiría ocupando una identidad vieja.
 */
const SQL_LEER_TITULOS = `
  SELECT id, titulo, editorial
    FROM libros
`;

const SQL_ESCRIBIR_IDENTIDAD = `
  UPDATE libros
     SET titulo_normalizado = ?
   WHERE id = ?
`;

interface FilaTitulo {
  id: number;
  titulo: string;
  editorial: string;
}

function errorDeColision(): ErrorDeColisionDeIdentidad {
  return Object.assign(new Error(COLISION_DE_IDENTIDAD), { colisionDeIdentidad: true as const });
}

export function aplicar003Identidad(db: Database.Database): void {
  const filas = db.prepare(SQL_LEER_TITULOS).all() as FilaTitulo[];

  // 1. La identidad nueva de cada libro, y la detección de duplicados **antes de escribir una
  //    sola fila**: si se descubriera la colisión a mitad del UPDATE, el rollback la arreglaría
  //    igual, pero el motivo que llegaría a la usuaria sería el del motor y no el del negocio.
  const identidades = new Map<number, string>();
  const ocupadas = new Set<string>();

  for (const fila of filas) {
    const { tituloNormalizado } = derivarLibro(fila.titulo, fila.editorial);

    if (ocupadas.has(tituloNormalizado)) {
      throw errorDeColision();
    }

    ocupadas.add(tituloNormalizado);
    identidades.set(fila.id, tituloNormalizado);
  }

  const escribir = db.prepare(SQL_ESCRIBIR_IDENTIDAD);

  // 2. Primera pasada: un centinela por fila. Precalcular descarta la colisión del estado
  //    **final**, no la del **intermedio**: si dos libros intercambian identidad, el primer
  //    UPDATE escribe la identidad que el otro todavía ocupa y choca contra el `UNIQUE`. La
  //    restricción es de columna y no un índice nombrado, así que no se puede soltar y recrear
  //    sin reconstruir la tabla; dos pasadas cuestan un UPDATE más por fila y no reconstruyen
  //    nada.
  for (const id of identidades.keys()) {
    escribir.run(`${PREFIJO_CENTINELA}${id}`, id);
  }

  // 3. Segunda pasada: la identidad definitiva. Ninguna fila ocupa todavía una identidad real,
  //    así que no hay orden de escritura que pueda chocar.
  for (const [id, tituloNormalizado] of identidades) {
    escribir.run(tituloNormalizado, id);
  }
}
