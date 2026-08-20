import type { Libro } from '@/lib/db/tipos';

import { formatearCantidad, formatearPrecio, rutaDelDetalle, TEXTO_VENDER } from '../mensajes';

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

/*
 * El formato del precio y el de las cantidades salen de `app/mensajes.ts` y no de un
 * `Intl.NumberFormat` propio: el detalle muestra el mismo precio del mismo libro, y dos copias
 * del formato divergen sin que nada se ponga rojo. La instancia sigue siendo única para toda la
 * interfaz, que es lo que evita 2.000 construcciones por renderizado.
 */

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
      <caption>
        {libros.length === 1 ? '1 libro' : `${formatearCantidad(libros.length)} libros`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Título</th>
          <th scope="col">Editorial</th>
          <th scope="col">Stock</th>
          <th scope="col">Precio</th>
          <th scope="col">Detalle</th>
          <th scope="col">Venta</th>
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
            <td data-campo="precio">{formatearPrecio(libro.precio)}</td>
            {/*
              El enlace va en **su propia celda** y no envolviendo el título: envolverlo obligaría
              a aflojar el extractor `celdas()` de los tests hasta admitir markup, y con él
              pasaría un valor renderizado sin escapar donde hoy devuelve `''`. FR-01 pide que el
              detalle sea alcanzable desde la fila, no que el título sea el enlace — y AC-17
              necesita igual un control de venta distinguible del de ver.

              Es un `<a>` pelado y no un control con estado ni un `<Link>`: dos mil filas con
              estado propio —o con el prefetch de `next/link`, que es un componente cliente— son
              dos mil componentes cliente, y el bench mide el armado del HTML en Node, así que no
              vería la regresión (M11). En las pantallas donde el enlace es **uno** —el "volver al
              catálogo" del detalle y del 404— sí se usa `<Link>`, que es además lo que exige la
              regla `@next/next/no-html-link-for-pages` para las rutas estáticas.
            */}
            <td data-campo="detalle">
              <a href={rutaDelDetalle(libro.id)}>Ver</a>
            </td>
            {/*
              El control de venta de la fila **no vende**: lleva al detalle, donde la venta queda
              pendiente de confirmación (AC-17). Un click de más acá no descuenta stock ni registra
              una venta que después no se puede deshacer (riesgo aceptado A3).

              Es un `<a>` y no un `<button>` que invoque el Server Action —eso sería la venta a un
              click, exactamente lo que AC-17 prohíbe— y tampoco un `<form method="get">`, que
              navega igual pero pierde lo que un enlace da gratis: click del medio, abrir en pestaña
              nueva, copiar la dirección, y que un lector de pantalla anuncie un enlace en vez de un
              botón que no envía nada.

              **Comparte destino con el enlace de al lado, y está bien que lo comparta**: los dos
              llevan al detalle porque ahí es donde se confirma la venta. Lo que AC-17 pide es que
              el control sea distinguible del de ver, y lo son por su celda y por su texto —"Ver" y
              "Vender"—, no por su URL. Sigue sin haber un byte de JavaScript de cliente por fila
              (M11): son dos anclas, no dos componentes.
            */}
            <td data-campo="venta">
              <a href={rutaDelDetalle(libro.id)}>{TEXTO_VENDER}</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
