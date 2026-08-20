import fs from 'node:fs';
import path from 'node:path';

import { identificadorDeLibro } from '@/app/mensajes';
import { leerPortada } from '@/lib/portadas/almacenamiento';
import { rutaDeArchivo } from '@/lib/portadas/ruta';

/**
 * Ruta de servido de portadas (FR-05, FR-06, FR-07, NFR-01).
 *
 * **Nunca responde con un código de error.** Un id inválido, un libro sin portada o una
 * portada que no se puede leer se tratan exactamente igual: se sirve el logo por defecto con
 * `200` (FR-07 — "no debe fallar"). No hay `404` ni `500` en este archivo, y no los va a haber:
 * un `redirect` haría un round-trip extra y volvería inestable la URL de la portada para el
 * caché del navegador.
 *
 * Es la primera superficie del proyecto que responde con los bytes de un archivo del disco en
 * vez de con HTML o JSON armado por la aplicación (D14 del threat model). El riesgo de mayor
 * impacto potencial del sub-ticket (**R22**, path traversal) se cierra por invariante: el
 * nombre de archivo que este handler intenta leer nace siempre de `identificadorDeLibro(id)`
 * — nunca de ningún otro dato de la request (mitigación M20). Por eso `leerPortada()` y
 * `rutaDeArchivo()` reciben acá **un solo argumento posible**, el `number` que devuelve esa
 * función, y nunca el `id` crudo de la URL ni ningún otro campo.
 */

/**
 * El formato de salida es siempre JPEG por construcción (`procesarPortada()`, Block 1): la
 * constante es fija y nunca se infiere del archivo servido (mitigación M21, riesgo R23).
 */
const CONTENT_TYPE = 'image/jpeg';

/**
 * El logo por defecto (FR-06), ya optimizado al tamaño del recuadro. Asset estático de
 * `public/`, commiteado en el Block 1: su existencia es un invariante de build y no una
 * condición de error en tiempo de ejecución (ver spec, Error handling del Block 4).
 */
const RUTA_LOGO = path.join(process.cwd(), 'public', 'logo-puentes-de-papel-96.jpg');

interface ContextoDeRuta {
  /** En Next 16 `params` es una promesa, no un objeto plano (mismo patrón que `/libros/[id]`). */
  params: Promise<{ id: string }>;
}

/**
 * El `ETag` deriva del tamaño y de la fecha de modificación: alcanza para invalidar el caché
 * del navegador cuando `guardarPortadaProcesada()` reemplaza el archivo (Block 3), sin
 * decodificar ni leer el contenido una segunda vez.
 */
function etagDe(estado: fs.Stats): string {
  return `"${estado.size.toString(16)}-${estado.mtimeMs.toString(16)}"`;
}

function respuestaDeImagen(bytes: Buffer, estado: fs.Stats): Response {
  // `new Uint8Array(bytes)` y no `bytes` directo: el `Buffer` de Node tipa su `.buffer` como
  // `ArrayBufferLike` (admite `SharedArrayBuffer`), que no es un `BodyInit` válido para
  // `Response` (mismo ajuste que ya usan los tests al construir un `File`).
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPE,
      'X-Content-Type-Options': 'nosniff',
      'Last-Modified': estado.mtime.toUTCString(),
      ETag: etagDe(estado),
    },
  });
}

/** El logo por defecto, con sus propios bytes y su propio `fs.statSync()` (FR-06, FR-07). */
function respuestaDelLogo(): Response {
  const bytes = fs.readFileSync(RUTA_LOGO);
  const estado = fs.statSync(RUTA_LOGO);

  return respuestaDeImagen(bytes, estado);
}

export async function GET(request: Request, { params }: ContextoDeRuta): Promise<Response> {
  const { id } = await params;
  const identificador = identificadorDeLibro(id);

  if (identificador !== undefined) {
    const bytes = leerPortada(identificador);

    // `leerPortada()` devuelve `undefined` tanto si el archivo no existe como si falló al
    // leerlo (permisos, corrupción): los dos casos son indistinguibles acá, a propósito
    // (AC-04) — el logo es la respuesta correcta para los dos.
    if (bytes !== undefined) {
      // El archivo pudo borrarse (`quitarPortada()`) o reemplazarse (`asignarFoto()`, que hace
      // `fs.renameSync()`) en la ventana entre el `leerPortada()` de arriba, que ya tuvo éxito,
      // y este `statSync()`: sin capturar, ese `ENOENT` se propagaría como una excepción no
      // manejada del Route Handler. Se trata igual que "no hay portada legible" (mismo criterio
      // que `leerPortada()` devolviendo `undefined` más arriba) — nunca un 500 (FR-07).
      try {
        const estado = fs.statSync(rutaDeArchivo(identificador));

        return respuestaDeImagen(bytes, estado);
      } catch {
        // cae a servir el logo, abajo
      }
    }
  }

  return respuestaDelLogo();
}
