import { normalizarTitulo } from './normalizar-titulo';
import { plegarTexto } from './plegar-texto';

/**
 * Las tres columnas **derivadas y almacenadas** de `libros`, en el camelCase del dominio.
 *
 * Van juntas en un tipo y no como tres valores sueltos porque su unidad es el punto: quien
 * escribe `titulo` o `editorial` necesita las tres, y un objeto no deja escribir dos y
 * olvidarse de la tercera. La traducción a los nombres snake_case de la tabla es asunto de
 * `lib/db/`, que ya la hace para leer.
 */
export interface ColumnasDerivadas {
  tituloNormalizado: string;
  tituloOrden: string;
  editorialNormalizada: string;
}

/**
 * Deriva la identidad y el orden de un libro a partir de su título y su editorial.
 *
 * Es el **único** productor de `titulo_normalizado`, `titulo_orden` y `editorial_normalizada`
 * en todo el proyecto. Hoy lo consumen dos caminos de escritura: el alta (`lib/db/libros.ts`) y el
 * recálculo de identidad de la migración de FR-11 (`lib/db/migraciones/003-identidad.ts`, desde el
 * Block 2 de FEAT-001b). Falta el tercero, que llega con el Block 5: la edición de título y
 * editorial (FR-06). La razón de que exista este módulo antes que ellos, en vez de tres llamadas
 * repetidas en cada camino de escritura, es que las repeticiones se desincronizan: un camino que
 * actualice `titulo` sin
 * recalcular `titulo_normalizado` rompe la unicidad del catálogo en silencio, y el `UNIQUE` no
 * lo detecta porque la fila que quedó vieja sigue siendo única.
 *
 * Vive en `lib/dominio/` y por lo tanto no lleva `server-only`: no toca la base, no hace E/S y
 * es pura. Eso es lo que permite que la migración la use dentro de su transacción y que los
 * tests la crucen contra sus dos funciones fuente sin abrir una conexión.
 *
 * No lanza. Sobre un título sin letras ni dígitos —`"¿?"`— `tituloNormalizado` sale vacío, que
 * es exactamente lo que esperan el rechazo de `crearLibro()` y el
 * `CHECK (length(titulo_normalizado) >= 1)` del esquema. Recibe texto ya validado por el
 * repositorio, así que no revalida nada: dos vocabularios de rechazo para el mismo campo es
 * cómo la usuaria deja de entender por qué le rechazan un título.
 */
export function derivarLibro(titulo: string, editorial: string): ColumnasDerivadas {
  return {
    tituloNormalizado: normalizarTitulo(titulo),
    tituloOrden: plegarTexto(titulo),
    editorialNormalizada: plegarTexto(editorial),
  };
}
