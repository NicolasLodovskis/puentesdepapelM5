import { notFound } from 'next/navigation';

import { ventaDeLibro } from '@/app/acciones-libro';
import { DetalleLibro } from '@/app/componentes/detalle-libro';
import { resolverFalloDelCatalogo } from '@/app/estado-del-catalogo';
import {
  identificadorDeLibro,
  MENSAJE_VENTA_SIN_STOCK,
  TEXTO_CONFIRMAR_VENTA,
  TITULO_VENTA,
} from '@/app/mensajes';
import { leerLibroPorId } from '@/lib/db/consultas';
import type { Libro } from '@/lib/db/tipos';

/**
 * Vista de detalle de un libro (FR-01, AC-01) y confirmación de la venta (FR-02, AC-17).
 *
 * Es la primera superficie del proyecto que recibe un identificador del navegador (frontera de
 * confianza TB-5): `/libros/abc`, `/libros/-1`, `/libros/9e99` y `/libros/1;DROP…` llegan igual
 * que un id legítimo, porque Next entrega el segmento como `string` arbitrario. Se valida con
 * `identificadorDeLibro()`, la misma función que valida el campo del formulario de venta: la regla
 * es una sola para las dos superficies que reciben un id (M1, riesgo R1).
 *
 * Acá **no se escribe SQL ni se abre la base**: la pantalla llama al repositorio, que liga el
 * parámetro por `?` posicional.
 *
 * **La venta se confirma acá y sólo acá.** El control de la fila del listado no escribe nada: lleva
 * a esta pantalla, donde la venta queda pendiente de que la usuaria la confirme (AC-17). Es el
 * control contra el click accidental sobre una operación que no se puede deshacer (riesgo aceptado
 * A3), y el costo aceptado es un gesto más por venta.
 *
 * **Interpretación declarada de "con la venta pendiente de confirmación" (AC-17).** No se transporta
 * ningún estado desde la fila: llegar por "Vender" y llegar por "Ver" renderizan exactamente lo
 * mismo. La sección de venta está **siempre** disponible mientras haya ejemplares, así que la venta
 * siempre está pendiente de confirmación y el criterio se cumple sin un parámetro que lo diga. La
 * alternativa —un `?vender=1` que encienda un aviso— agrega a esta ruta una entrada más que llega
 * del navegador, un estado que se puede fabricar pegando una URL y que queda pegado en un enlace
 * compartido, a cambio de un resaltado. Si la usuaria pide que la pantalla marque de dónde vino,
 * eso es lo que hay que revisar.
 *
 * Sigue sin llevar `'use client'`: el formulario de confirmación no tiene estado ni evento propio
 * —lo envía el navegador y lo atiende el Server Action— y el único componente cliente de la
 * pantalla es el `<Link>` de "volver al catálogo" que trae `DetalleLibro`, que se paga una vez.
 */

interface PropsDetalle {
  /** En Next 16 `params` es una promesa, no un objeto plano. */
  params: Promise<{ id: string }>;
}

/**
 * Sin ejemplares no se ofrece confirmar la venta (AC-03).
 *
 * Es comodidad para la usuaria y **no la barrera**: quien impide la venta es `venderEjemplar()`,
 * que relee el stock dentro de su propia transacción. Un `POST` a mano no pasa por esta pantalla.
 */
const SIN_EJEMPLARES = 0;

export default async function PaginaDetalle({ params }: PropsDetalle) {
  const { id } = await params;
  const identificador = identificadorDeLibro(id);

  if (identificador === undefined) {
    // 404 **sin consultar**: un id que no es un id no llega al driver.
    notFound();
  }

  let libro: Libro | undefined;

  try {
    libro = leerLibroPorId(identificador);
  } catch (error) {
    // Mismo manejo que la pantalla principal, y por el mismo helper: la colisión de identidad
    // tiene pantalla propia (AC-16) y cualquier otro fallo sube al límite de error.
    return resolverFalloDelCatalogo(error);
  }

  if (libro === undefined) {
    // Inexistente y archivado responden lo mismo, y lo mismo que un id inválido: la vista de
    // detalle no distingue "no está" de "no se muestra".
    notFound();
  }

  return (
    <main className="pantalla">
      <DetalleLibro libro={libro} />

      {/*
        `aria-labelledby` y no `aria-label`: con los dos, un lector de pantalla anuncia el mismo
        texto dos veces —el de la región y el del encabezado que ya está adentro—.
      */}
      <section className="venta" aria-labelledby="venta">
        <h2 id="venta">{TITULO_VENTA}</h2>
        {libro.stock === SIN_EJEMPLARES ? (
          <p data-venta="sin-stock">{MENSAJE_VENTA_SIN_STOCK}</p>
        ) : (
          /*
            El identificador viaja en un campo del formulario y el Server Action lo vuelve a validar:
            lo que se renderiza acá es lo que el navegador devuelve, y el `POST` del Server Action se
            puede armar a mano sin pasar por esta pantalla. Ningún otro dato viaja —ni el precio, ni
            el stock—: los dos los lee la venta de la base, dentro de su transacción (M2, M4).
          */
          <form action={ventaDeLibro}>
            <input type="hidden" name="id" value={String(libro.id)} />
            <button type="submit" data-venta="confirmar">
              {TEXTO_CONFIRMAR_VENTA}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
