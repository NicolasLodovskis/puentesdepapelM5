import type { ReactElement } from 'react';

import { esColisionDeIdentidad } from '@/lib/db/errores';

import { MENSAJE_COLISION_DE_IDENTIDAD, TITULO_CATALOGO_SIN_MIGRAR } from './mensajes';

/**
 * Pantalla del catálogo que no se pudo migrar por colisiones de identidad (FR-11, AC-16).
 *
 * **Quién la renderiza.** El Block 2 entregó el componente y su texto curado, y durante ese
 * bloque no la mostraba nadie: ante la colisión el camino real era `app/page.tsx` →
 * `buscarLibros()` → `obtenerDb()` → `migrar()` lanza → lo atrapaba el límite de error de la
 * ruta, que muestra su constante genérica. El cableado lo cierra el Block 3, en las **dos** rutas
 * que leen la base: `app/page.tsx` y `app/libros/[id]/page.tsx` resuelven el fallo con
 * `resolverFalloDelCatalogo()` —acá abajo— y renderizan esto en vez del listado, que es lo que la
 * spec quiere decir con que esta pantalla «condiciona qué se renderiza en cualquier ruta».
 *
 * `app/page.tsx` **no figura** en la lista de archivos que la spec le da al Block 3: es un desvío
 * declarado y autorizado por la usuaria, y como tal se informa en la verificación. Sin él, AC-16
 * quedaba con su componente escrito y su texto sin mostrarse nunca.
 *
 * **Por qué es una pantalla propia y no `app/error.tsx`.** El límite de error de la ruta muestra
 * una constante genérica —"No se pudo mostrar el catálogo"— porque lo que llega ahí es un fallo
 * de infraestructura cuyo mensaje nombra tablas, columnas y códigos del motor (mitigación 8 de
 * FEAT-001a); y desde un Server Action ni siquiera se alcanza. Acá, en cambio, el motivo se
 * conoce con precisión y la usuaria puede hacer algo al respecto, así que el texto es curado y
 * dice qué pasó y qué falta para abrir el catálogo. La app **no abre** —es la decisión de la
 * usuaria— pero **sí informa**.
 *
 * No es un Client Component y no necesita serlo: no hay estado, ni evento, ni reintento. El
 * catálogo no vuelve a abrir hasta que los títulos repetidos se resuelvan en la base, así que un
 * botón de "reintentar" mentiría.
 *
 * No lleva ningún dato del catálogo por parámetro, y es deliberado: lo que no recibe no lo
 * puede filtrar (mitigaciones 7 y 8).
 */
export function EstadoDelCatalogo() {
  return (
    <main className="pantalla">
      <h1>{TITULO_CATALOGO_SIN_MIGRAR}</h1>
      <p>{MENSAJE_COLISION_DE_IDENTIDAD}</p>
    </main>
  );
}

/**
 * Resuelve qué pasa cuando la lectura del catálogo falla: **el único** lugar donde se decide.
 *
 * **Resuelve, no fabrica.** La función tiene dos mitades y una de ellas **relanza**, así que el
 * nombre no puede leerse como una fábrica pura: en el sitio de la llamada hay que ver que esto
 * puede propagar el error. Se llama desde el `catch` de toda pantalla que toque la base:
 *
 * ```tsx
 * try {
 *   libros = buscarLibros(termino);
 * } catch (error) {
 *   return resolverFalloDelCatalogo(error);
 * }
 * ```
 *
 * Vive acá y no copiado en cada ruta porque las dos mitades se escriben mal por separado: la
 * colisión de identidad es una condición conocida con su pantalla propia (AC-16), y **cualquier
 * otro fallo se relanza** —sigue siendo del límite de error de la ruta, y disfrazar un disco
 * ilegible de colisión de títulos sería un diagnóstico falso en la única pantalla que la usuaria
 * vería—. Con el `try/catch` copiado en cada ruta, la primera que se olvide de la segunda mitad,
 * o del `catch` entero, hace reaparecer el bug original —mensaje genérico en vez del texto
 * curado— sin que nada se ponga rojo. Lo vigila además una guardia: «toda pantalla que toca la
 * base importa el manejo compartido», en `test/app/detalle.test.ts`.
 *
 * Devuelve la pantalla o lanza; nunca devuelve algo que se pueda confundir con "no hay libros".
 */
export function resolverFalloDelCatalogo(error: unknown): ReactElement {
  if (!esColisionDeIdentidad(error)) {
    throw error;
  }

  return <EstadoDelCatalogo />;
}
