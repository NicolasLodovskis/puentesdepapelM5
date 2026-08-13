import Link from 'next/link';

import { MENSAJE_LIBRO_INEXISTENTE } from './mensajes';

/**
 * Respuesta 404 de la aplicación.
 *
 * La renderiza Next.js cuando una ruta llama a `notFound()`. Hoy la llama la vista de detalle, y
 * la llama por **tres** motivos distintos —el id no es un entero positivo, el libro no existe, el
 * libro está archivado— que se responden con la misma pantalla a propósito: distinguirlos
 * convertiría el 404 en un canal para averiguar cuántos libros hay y cuáles fueron archivados
 * (riesgo R2, mitigación 8).
 *
 * Por eso el texto **no dice cuál de los tres fue** ni nombra ningún dato de la base. Lo que la
 * usuaria necesita saber es que ese libro no está a la vista y cómo volver; el texto vive en
 * `app/mensajes.ts`, junto a los de las otras pantallas.
 *
 * El módulo no declara `'use client'` y no tiene estado, ni evento, ni reintento posible. Sí
 * arrastra cliente por una vía indirecta y **a propósito**: `next/link` declara la directiva en
 * su propio fuente, así que el enlace de "volver al catálogo" es un componente cliente. Se paga
 * una vez por pantalla —lo exige además `@next/next/no-html-link-for-pages` para las rutas
 * estáticas— y por eso mismo el listado **no** puede pagarlo: ahí serían 2.000, uno por fila, que
 * es la regresión que M11 vigila.
 */

export default function NoEncontrado() {
  return (
    <main className="pantalla">
      <h1>{MENSAJE_LIBRO_INEXISTENTE}</h1>
      <p>
        Puede que se haya escrito mal la dirección. Buscalo por su título o su editorial desde el
        catálogo.
      </p>
      <p>
        <Link href="/">Volver al catálogo</Link>
      </p>
    </main>
  );
}
