import Link from 'next/link';

import type { Libro } from '@/lib/db/tipos';

import { FormularioEdicion } from './formulario-edicion';
import { FormularioPortada } from './formulario-portada';
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
  /**
   * La ruta vigente de la portada del libro, ya resuelta por `resolverRutaMostrable()`
   * (FEAT-001c Block 1/3): la propia foto si existe, o el logo por defecto si no (FR-06). Este
   * componente no importa nada de `lib/portadas/` ni de `lib/db/` más de lo que ya importa —la
   * rama la decide la única función compartida, en la página.
   */
  rutaPortada: string;
  /** ¿Tiene el libro una foto vigente? Decide si `FormularioPortada` ofrece "Quitar foto". */
  tienePortada: boolean;
}

export function DetalleLibro({ libro, rutaPortada, tienePortada }: PropsDetalle) {
  return (
    <article className="detalle mx-auto w-full max-w-2xl border border-borde bg-fondo p-4 text-texto sm:p-6">
      <h1 className="text-xl font-semibold text-texto sm:text-2xl">{libro.titulo}</h1>

      {/*
        `flex-col` hasta el punto de quiebre y `sm:flex-row` después: a 360px de ancho (AC-02) la
        portada y los datos se apilan en vez de comprimirse uno al lado del otro sin espacio.
      */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- portada servida como bytes de
            disco (Block 4), no un asset que `next/image` pueda optimizar en build. */}
        <img
          className="miniatura-portada rounded shrink-0"
          src={rutaPortada}
          width={96}
          height={96}
          alt="Portada"
        />

        <dl className="datos-del-libro min-w-0 flex-1 text-texto">
          <dt className="text-texto">Título</dt>
          <dd data-campo="titulo" className="text-texto">
            {libro.titulo}
          </dd>
          <dt className="text-texto">Editorial</dt>
          <dd data-campo="editorial" className="text-texto">
            {libro.editorial}
          </dd>
          <dt className="text-texto">Stock</dt>
          <dd data-campo="stock" className="text-texto">
            {libro.stock}
          </dd>
          <dt className="text-texto">Precio</dt>
          <dd data-campo="precio" className="text-texto">
            {formatearPrecio(libro.precio)}
          </dd>
        </dl>
      </div>

      <section
        className="operaciones mt-6 flex flex-col gap-6 border-t border-borde pt-6"
        aria-label="Operaciones sobre el libro"
      >
        <FormularioPortada id={libro.id} tienePortada={tienePortada} />
        <FormularioEdicion libro={libro} />
      </section>

      <p className="mt-6">
        <Link
          href="/"
          className="text-texto underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
        >
          Volver al catálogo
        </Link>
      </p>
    </article>
  );
}
