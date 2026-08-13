import Link from 'next/link';

import type { Libro } from '@/lib/db/tipos';

import { formatearPrecio } from '../mensajes';

/**
 * Los datos de un libro, juntos (FR-01, AC-01).
 *
 * El módulo no declara `'use client'`: no hay estado, ni evento, ni reintento, y la vista muestra
 * lo que ya está en la base. Lo único de cliente es el `<Link>` de "volver al catálogo", que lo
 * es porque `next/link` declara la directiva en su propio fuente; se paga **una vez por
 * pantalla** y lo exige `@next/next/no-html-link-for-pages` para las rutas estáticas. El listado
 * no puede pagarlo: ahí serían 2.000, uno por fila (M11).
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
 */

/**
 * Las operaciones que se realizan **desde esta vista** (AC-01): el precio (FR-03), el stock
 * (FR-04) y el título y la editorial (FR-05, con la regla de identidad de FR-06).
 *
 * Acá se declaran; los controles que las ejecutan llegan con los bloques siguientes de
 * `spec-FEAT-001b.md` —la confirmación de venta y el formulario de edición—, que son los que
 * traen la Server Action correspondiente. Un formulario sin acción, escrito para que la pantalla
 * "se vea completa", mandaría un GET a la propia ruta y sería peor que no tenerlo.
 */
const OPERACIONES: ReadonlyArray<{ campo: string; texto: string }> = [
  { campo: 'precio', texto: 'Corregir el precio' },
  { campo: 'stock', texto: 'Corregir la cantidad en stock' },
  { campo: 'titulo', texto: 'Corregir el título' },
  { campo: 'editorial', texto: 'Corregir la editorial' },
];

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
        <h2>Qué se puede hacer con este libro</h2>
        <ul>
          {OPERACIONES.map((operacion) => (
            <li key={operacion.campo} data-operacion={operacion.campo}>
              {operacion.texto}
            </li>
          ))}
        </ul>
      </section>

      <p>
        <Link href="/">Volver al catálogo</Link>
      </p>
    </article>
  );
}
