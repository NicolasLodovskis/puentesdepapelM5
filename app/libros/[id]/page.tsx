import { notFound } from 'next/navigation';

import { DetalleLibro } from '@/app/componentes/detalle-libro';
import { resolverFalloDelCatalogo } from '@/app/estado-del-catalogo';
import { leerLibroPorId } from '@/lib/db/consultas';
import type { Libro } from '@/lib/db/tipos';

/**
 * Vista de detalle de un libro (FR-01, AC-01).
 *
 * Es la primera superficie del proyecto que recibe un identificador del navegador (frontera de
 * confianza TB-5): `/libros/abc`, `/libros/-1`, `/libros/9e99` y `/libros/1;DROP…` llegan igual
 * que un id legítimo, porque Next entrega el segmento como `string` arbitrario.
 *
 * Acá **no se escribe SQL ni se abre la base**: la pantalla llama al repositorio, que liga el
 * parámetro por `?` posicional.
 */

interface PropsDetalle {
  /** En Next 16 `params` es una promesa, no un objeto plano. */
  params: Promise<{ id: string }>;
}

/**
 * Sólo dígitos. Sin signo, sin punto, sin notación exponencial y sin espacios: `Number()` acepta
 * `' 1'`, `'1e3'` y `'0x10'`, así que parsear primero y validar después dejaría entrar tres
 * formas de escribir un id que la usuaria nunca escribe. Sin cuantificadores anidados (R12).
 */
const SOLO_DIGITOS = /^\d+$/u;

/**
 * El id de la ruta, validado **antes de tocar la base** (M1, riesgo R1).
 *
 * `Number.isSafeInteger` es la segunda mitad y no es redundante con el patrón: una tira de
 * veinte dígitos pasa el patrón y `Number()` la redondea al entero representable más cercano, con
 * lo que la consulta buscaría un id que la usuaria no pidió. El `> 0` cierra el `0`, que
 * `AUTOINCREMENT` no asigna nunca.
 *
 * Devuelve `undefined` en vez de lanzar: quien decide qué se responde es la ruta.
 */
function idValido(valor: string): number | undefined {
  if (!SOLO_DIGITOS.test(valor)) {
    return undefined;
  }

  const id = Number(valor);

  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export default async function PaginaDetalle({ params }: PropsDetalle) {
  const { id } = await params;
  const identificador = idValido(id);

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
    </main>
  );
}
