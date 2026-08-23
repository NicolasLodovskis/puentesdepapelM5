import type { ReactNode } from 'react';

/**
 * Clases Tailwind estáticas por variante (mitigación 4 del threat model FEAT-002a): un objeto
 * indexado por una unión cerrada de valores fijos, nunca una clase construida interpolando un
 * dato que cargó la usuaria (título, editorial, etc.). Usan los tokens de `@theme` de Block 1
 * (`--color-texto`, `--color-fondo`, `--color-borde`), que Tailwind v4 expone como utilidades
 * `bg-texto`/`text-fondo`/etc. por el prefijo `--color-*`.
 */
const CLASES_VARIANTE = {
  primario: 'bg-texto text-fondo hover:opacity-90',
  secundario: 'bg-fondo text-texto border border-borde hover:bg-borde/30',
} as const;

type VarianteBoton = keyof typeof CLASES_VARIANTE;

const CLASES_BASE =
  'inline-block rounded px-4 py-2 text-center font-medium no-underline ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco';

interface PropsComunes {
  children: ReactNode;
  variante?: VarianteBoton;
}

/**
 * `as: 'a'` exige `href` en el tipo (ADR-001): el mismo `<a href>` que hoy escriben a mano las
 * celdas "Ver"/"Vender" de `ListadoLibros` (Block 4 las reemplaza por este componente sin
 * cambiar su semántica de enlace — AC-17 del PRD maestro exige que la venta no se dispare a un
 * click).
 */
interface PropsBotonComoEnlace extends PropsComunes {
  as: 'a';
  href: string;
}

/**
 * `as` ausente o `'button'`: nunca admite `href`. `href?: never` es necesario además de la unión
 * discriminada: sin él, cuando `as` está completamente ausente TypeScript no tiene discriminante
 * contra el cual chequear el exceso de propiedades y deja pasar `href` sin error (limitación
 * conocida del excess-property-check en uniones). Con `href?: never`, cualquier objeto con `href`
 * definido queda excluido de este miembro sin importar si `as` está presente o ausente, así que
 * `<Boton as="a">` sin `href`, `<Boton as="button" href>` y `<Boton href>` (sin `as`) quedan los
 * tres resueltos por los tipos en tiempo de compilación — no hay validación de esto en runtime
 * (así lo fija la spec).
 */
interface PropsBotonComoBoton extends PropsComunes {
  as?: 'button';
  href?: never;
  type?: 'button' | 'submit';
}

type PropsBoton = PropsBotonComoEnlace | PropsBotonComoBoton;

/**
 * Server Component: sin `'use client'`, sin estado y sin un solo manejador de evento, sea cual
 * sea el elemento que termine renderizando (ADR-001). Con las ~2.000 filas del listado
 * (NFR-01 de FEAT-001a) eso es lo que evita 2.000 componentes de cliente.
 */
export function Boton(props: PropsBoton) {
  const clases = `${CLASES_BASE} ${CLASES_VARIANTE[props.variante ?? 'primario']}`;

  if (props.as === 'a') {
    return (
      <a href={props.href} className={clases}>
        {props.children}
      </a>
    );
  }

  return (
    <button type={props.type ?? 'button'} className={clases}>
      {props.children}
    </button>
  );
}
