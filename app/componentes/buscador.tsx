/**
 * Campo de búsqueda del catálogo (FR-04).
 *
 * Es un formulario `GET` sin JavaScript de cliente. Al enviarlo el navegador navega a `/?q=…`, la página
 * vuelve a renderizarse en el servidor y el término queda en la URL, así que la búsqueda se
 * puede compartir y volver atrás funciona. Un buscador con estado de cliente no daría nada de
 * eso y agregaría JavaScript a la pantalla que NFR-01 quiere liviana.
 */

/**
 * Nombre del parámetro de búsqueda en la query.
 *
 * Vive junto al campo que lo emite, y la página lo importa de acá: si estuviera escrito a mano
 * en los dos lados, un cambio en uno dejaría el buscador enviando un parámetro que la página
 * no lee, sin que nada falle.
 */
export const PARAMETRO_BUSQUEDA = 'q';

/** La misma cota que el esquema le pone al título y a la editorial. */
const LARGO_MAXIMO_TERMINO = 300;

interface PropsBuscador {
  /** El término que se está aplicando, para que el campo no se vacíe al recargar. */
  termino: string;
}

export function Buscador({ termino }: PropsBuscador) {
  return (
    <form action="/" method="get" className="buscador">
      <label htmlFor="termino">Buscar por título o editorial</label>
      <input
        id="termino"
        name={PARAMETRO_BUSQUEDA}
        type="search"
        defaultValue={termino}
        maxLength={LARGO_MAXIMO_TERMINO}
        placeholder="Rayuela, Emecé…"
      />
      <button type="submit">Buscar</button>
    </form>
  );
}
