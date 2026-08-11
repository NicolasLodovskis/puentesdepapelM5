import type { Libro } from '@/lib/db/tipos';

/**
 * El catálogo, como tabla.
 *
 * Es un Server Component y **no lleva `'use client'`**: no hay un solo byte de JavaScript de
 * cliente por fila, que es la estrategia de NFR-01. Con 2.000 libros, cada fila que trajera
 * estado propio se pagaría 2.000 veces.
 *
 * Los títulos y las editoriales los carga la usuaria y los pinta React, que escapa por
 * defecto. **Nada de inyectar HTML sin escapar** (mitigación 9): un título es texto, y
 * tratarlo como marcado lo convierte en un vector de XSS. La prohibición se escribe sin
 * nombrar la propiedad de React porque el guardia de `test/app/acciones.test.ts` busca ese
 * nombre en el fuente crudo, comentarios incluidos: es más estricto que despejar los
 * comentarios y no tiene forma de fallar en silencio.
 */

/**
 * Formato de miles en castellano. Se construye una sola vez y no por fila: un
 * `Intl.NumberFormat` nuevo dentro del `map` sería 2.000 construcciones por renderizado.
 */
const MILES = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

interface PropsListado {
  libros: Libro[];
}

export function ListadoLibros({ libros }: PropsListado) {
  if (libros.length === 0) {
    // Con una tabla vacía la pantalla no distingue "no hay libros" de "falló algo".
    return <p className="vacio">No hay libros para mostrar.</p>;
  }

  return (
    <table className="catalogo">
      <caption>{libros.length === 1 ? '1 libro' : `${MILES.format(libros.length)} libros`}</caption>
      <thead>
        <tr>
          <th scope="col">Título</th>
          <th scope="col">Editorial</th>
          <th scope="col">Stock</th>
          <th scope="col">Precio</th>
        </tr>
      </thead>
      <tbody>
        {libros.map((libro) => (
          <tr key={libro.id}>
            {/*
              `data-campo` es el punto de anclaje de los tests del listado: contar `<tr>`
              mezclaría el encabezado con los datos, y buscar un título con `toContain` no
              diría nada del orden ni de cuántas filas hay.
            */}
            <td data-campo="titulo">{libro.titulo}</td>
            <td data-campo="editorial">{libro.editorial}</td>
            <td data-campo="stock">{libro.stock}</td>
            <td data-campo="precio">{`$ ${MILES.format(libro.precio)}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
