import { MENSAJE_COLISION_DE_IDENTIDAD, TITULO_CATALOGO_SIN_MIGRAR } from './mensajes';

/**
 * Pantalla del catálogo que no se pudo migrar por colisiones de identidad (FR-11, AC-16).
 *
 * **Todavía no la ve nadie, y el docstring no va a decir que sí.** Hoy ninguna ruta la renderiza:
 * ante la colisión, el camino real es `app/page.tsx` → `buscarLibros()` → `obtenerDb()` →
 * `migrar()` lanza → lo atrapa el límite de error de la ruta, que muestra su constante genérica.
 * Lo que este bloque entrega es **el componente y su texto curado**; el cableado —que la ruta
 * distinga el catálogo sin migrar y renderice esto en vez del listado— llega con el Block 3 de
 * `spec-FEAT-001b.md`, que es el que tiene `app/page.tsx` entre sus archivos y donde la spec dice
 * que esta pantalla «condiciona qué se renderiza en cualquier ruta» (FR-01). Hasta entonces, lo
 * que sigue abajo describe **para qué** es esta pantalla, no lo que la usuaria ve hoy.
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
