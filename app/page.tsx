import { buscarLibros } from '@/lib/db/consultas';

import { Buscador, PARAMETRO_BUSQUEDA } from './componentes/buscador';
import { FormularioAlta } from './componentes/formulario-alta';
import { ListadoLibros } from './componentes/listado-libros';

/**
 * Pantalla principal: alta manual, buscador y catálogo (FR-01, FR-04).
 *
 * Es un Server Component async. Leer `searchParams` fuerza además el renderizado dinámico, lo
 * que evita que la consulta corra durante `next build` y quede un catálogo horneado en el
 * HTML de la primera compilación.
 *
 * Acá **no se escribe SQL ni se normaliza ningún título**: la pantalla llama a `buscarLibros()`
 * y al Server Action, que llama a `crearLibro()`. La identidad y el orden del catálogo se
 * calculan en un solo lugar (`lib/dominio/`, FR-08), y quien abre la base es `lib/db/`.
 */

interface PropsPagina {
  /** En Next 16 `searchParams` es una promesa, no un objeto plano. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Colapsa el valor del parámetro de búsqueda a un término.
 *
 * Un parámetro repetido en la query (`?q=a&q=b`) llega como `string[]`, que `buscarLibros()`
 * rechaza en compilación. Ese error hay que resolverlo acá y **no silenciarlo con un
 * `as string`**: el array degradaría a `''` y la página devolvería el catálogo completo
 * ignorando la búsqueda, sin fallar y sin que nadie se enterara. Se conserva el primer valor,
 * que es el que la usuaria tipeó primero.
 */
function terminoDeBusqueda(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) {
    return valor.length === 0 ? null : valor[0];
  }

  return valor ?? null;
}

export default async function Pagina({ searchParams }: PropsPagina) {
  const consulta = await searchParams;
  const termino = terminoDeBusqueda(consulta[PARAMETRO_BUSQUEDA]);
  const libros = buscarLibros(termino);

  return (
    <main className="pantalla">
      <h1>Puentes de Papel</h1>

      <FormularioAlta />

      <section aria-label="Catálogo">
        <Buscador termino={termino ?? ''} />
        <ListadoLibros libros={libros} />
      </section>
    </main>
  );
}
