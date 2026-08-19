import Link from 'next/link';

import type { Libro } from '@/lib/db/tipos';

import { FormularioEdicion } from './formulario-edicion';
import { formatearPrecio } from '../mensajes';

/**
 * Los datos de un libro, juntos (FR-01, AC-01).
 *
 * El módulo no declara `'use client'` **propio**: no hay estado, ni evento, ni reintento a este
 * nivel, y la vista muestra lo que ya está en la base. Lo de cliente que arrastra son el `<Link>`
 * de "volver al catálogo" —porque `next/link` declara la directiva en su propio fuente— y, desde
 * el Block 5, `FormularioEdicion`, que sí necesita estado propio (`useActionState`) para mostrar
 * los rechazos de la edición sin perder lo que la usuaria escribió. Ninguno de los dos es el
 * costo que M11 prohíbe: ese costo es "un componente cliente por fila del listado", y esta
 * pantalla renderiza **un** libro, no dos mil.
 *
 * El título y la editorial los carga la usuaria y los pinta React, que escapa por defecto.
 * **Nada de inyectar HTML sin escapar** (mitigación 9): un título es texto, y tratarlo como
 * marcado lo convierte en un vector de XSS. La prohibición se escribe sin nombrar la propiedad
 * de React porque las guardias de `test/app/` la buscan en el fuente crudo, comentarios
 * incluidos.
 *
 * Los cuatro datos van marcados con `data-campo`, el mismo punto de anclaje que usan las celdas
 * del listado: buscar el título con `toContain` en el HTML entero no distinguiría el dato del
 * encabezado ni del texto de las operaciones.
 *
 * **Las operaciones de AC-01 —precio (FR-03), stock (FR-04), título y editorial (FR-05, con la
 * regla de identidad de FR-06)— ya no son una lista estática.** Hasta el Block 4 esta sección
 * era un `<ul>` de cuatro `<li data-operacion="…">` sin ningún control detrás: satisfacía el test
 * de que las cuatro marcas existieran, pero no que la operación se pudiera ejecutar, que es lo
 * que AC-01 pide de verdad. El Block 5 la reemplaza por `FormularioEdicion`, conservando el mismo
 * anclaje `data-operacion` en el envoltorio de cada campo real.
 */

interface PropsDetalle {
  libro: Libro;
}

export function DetalleLibro({ libro }: PropsDetalle) {
  return (
    <article className="detalle">
      <h1>{libro.titulo}</h1>

      <dl className="datos-del-libro">
        <dt>Título</dt>
        <dd data-campo="titulo">{libro.titulo}</dd>
        <dt>Editorial</dt>
        <dd data-campo="editorial">{libro.editorial}</dd>
        <dt>Stock</dt>
        <dd data-campo="stock">{libro.stock}</dd>
        <dt>Precio</dt>
        <dd data-campo="precio">{formatearPrecio(libro.precio)}</dd>
      </dl>

      <section className="operaciones" aria-label="Operaciones sobre el libro">
        <FormularioEdicion libro={libro} />
      </section>

      <p>
        <Link href="/">Volver al catálogo</Link>
      </p>
    </article>
  );
}
