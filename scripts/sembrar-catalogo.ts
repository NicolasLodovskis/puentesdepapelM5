import type Database from 'better-sqlite3';

import { crearLibro } from '@/lib/db/libros';

/**
 * Generador de un catálogo de prueba para medir NFR-01 (AC-09).
 *
 * **Determinista, sin una gota de aleatoriedad**: los títulos, las editoriales, el stock y los
 * precios salen del índice del libro y de nada más. No hay `Math.random()` ni lecturas del
 * reloj, así que dos corridas siembran exactamente el mismo catálogo y una medición se puede
 * comparar con la anterior. Con títulos al azar, un p95 que empeora no se distinguiría de un
 * catálogo que salió distinto.
 *
 * Los libros se dan de alta por `crearLibro()`, el único camino de escritura: el catálogo que
 * se mide es el que produciría la aplicación, con sus columnas derivadas y su historial, y no
 * uno escrito a mano con SQL que podría tener otra forma.
 *
 * La base que reciba **tiene que ser temporal**: la siembra escribe 2.000 libros y jamás debe
 * caer sobre `data/puentes.db`. Quien llama abre el archivo y lo borra; el `.gitignore` cubre
 * `.tmp-tests/` y todo `*.db`.
 *
 * No hay entrada de línea de comandos: el proyecto no tiene un intérprete de TypeScript para
 * scripts sueltos, así que un `main` acá sería código que nadie puede ejecutar. El consumidor
 * es `test/rendimiento/listado.bench.test.ts`.
 */

/** Palabras de los títulos. Ninguna lleva `ñ`, así que el plegado da siempre ASCII. */
const NOMBRES = [
  'Ávila',
  'Barco',
  'Cuentos',
  'Desierto',
  'Espejo',
  'Fuego',
  'Grieta',
  'Horizonte',
  'Isla',
  'Jardín',
  'Kilómetro',
  'Luna',
  'Mapa',
  'Noche',
  'Océano',
  'Puente',
  'Quimera',
  'Río',
  'Sombra',
  'Trébol',
  'Umbral',
  'Viaje',
  'Yunque',
  'Zorro',
] as const;

const COMPLEMENTOS = [
  'de papel',
  'sin nombre',
  'de invierno',
  'en la niebla',
  'de la memoria',
  'que no fue',
  'del sur',
  'de arena',
] as const;

const EDITORIALES = [
  'Sudamericana',
  'Emecé',
  'Anagrama',
  'Sur',
  'Trotta',
  'Losada',
  'Alfaguara',
  'Siglo XXI',
] as const;

/** Módulos coprimos con el largo de cada lista, para que los ciclos no queden en fase. */
const PASO_COMPLEMENTO = 3;
const PASO_EDITORIAL = 5;

const STOCK_MODULO = 37;
const PRECIO_BASE = 1000;
const PRECIO_MODULO = 97;
const PRECIO_PASO = 13;

/**
 * El título del libro número `indice`.
 *
 * Termina en el índice + 1 para que las 2.000 identidades sean distintas: dos títulos que
 * normalizaran igual harían que el alta fallara por duplicado y la siembra quedara corta.
 */
export function tituloDeterminista(indice: number): string {
  const nombre = NOMBRES[indice % NOMBRES.length];
  const complemento = COMPLEMENTOS[(indice * PASO_COMPLEMENTO) % COMPLEMENTOS.length];

  return `${nombre} ${complemento} ${indice + 1}`;
}

export function editorialDeterminista(indice: number): string {
  return EDITORIALES[(indice * PASO_EDITORIAL) % EDITORIALES.length];
}

/**
 * Siembra `cantidad` libros en la base recibida.
 *
 * Las altas van dentro de **una** transacción externa: `crearLibro()` abre la suya por libro, y
 * better-sqlite3 convierte las anidadas en `SAVEPOINT`, así que la siembra confirma una sola
 * vez en vez de pagar 2.000 escrituras del journal. Es setup de una medición, no un caso de
 * uso: lo que se mide después son las lecturas.
 *
 * Un alta rechazada corta la siembra con un error. Un catálogo más corto que el pedido haría
 * que AC-09 midiera 1.900 filas y diera por bueno un presupuesto que no se probó.
 */
export function sembrarCatalogo(db: Database.Database, cantidad: number): void {
  const sembrar = db.transaction(() => {
    for (let indice = 0; indice < cantidad; indice += 1) {
      const resultado = crearLibro(
        {
          titulo: tituloDeterminista(indice),
          editorial: editorialDeterminista(indice),
          stock: String(indice % STOCK_MODULO),
          precio: String(PRECIO_BASE + (indice % PRECIO_MODULO) * PRECIO_PASO),
        },
        db,
      );

      if (!resultado.ok) {
        throw new Error(
          `La semilla ${indice} («${tituloDeterminista(indice)}») no se pudo dar de alta: ` +
            `${resultado.motivo}.`,
        );
      }
    }
  });

  sembrar();
}
