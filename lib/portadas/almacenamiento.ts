import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { rutaDeArchivo, rutaDirectorioPortadas } from './ruta';

/**
 * Tamaño máximo admitido para el archivo subido, aplicado sobre los bytes recibidos **antes**
 * de invocar `sharp` (mitigación M18, riesgo R19).
 */
const TAMANIO_MAXIMO_BYTES = 10 * 1024 * 1024;

/** Lado del recuadro cuadrado de la miniatura (FR-05). */
const LADO_MINIATURA = 96;

/**
 * El logo de la aplicación, ya optimizado al tamaño del recuadro (FR-06). Es un asset estático
 * de `public/`, compartido por las 2.000 filas del listado que no tengan portada — una sola URL
 * cacheable por el navegador, sin pasar por `app/portadas/[id]/route.ts` (Block 4).
 */
const RUTA_LOGO_POR_DEFECTO = '/logo-puentes-de-papel-96.jpg';

/**
 * El motivo por el que se rechazó la foto de portada.
 *
 * `CampoValidado<T>` no es un tipo compartido en el repositorio hoy (cada módulo de `lib/db/`
 * declara el suyo). Este módulo declara el suyo en vez de importar `ErrorCampo` de
 * `lib/db/errores.ts`: `lib/portadas/` no importa nada de `lib/db/` (por construcción, FR-04) y
 * la guardia de convención de `test/portadas/almacenamiento.test.ts` lo exige sin excepciones.
 * La forma es estructuralmente compatible con `ErrorCampo` una vez que el Block 2 amplía
 * `CampoLibro`/`DetalleCampo` con `'foto'`, así que entra sin adaptador en
 * `recolectarErrores()`.
 */
export interface ErrorPortada {
  campo: 'foto';
  detalle: 'formato_no_admitido' | 'demasiado_grande';
}

/** Un campo validado: o su valor ya interpretado, o el motivo del rechazo. */
export type CampoValidado<T> = { ok: true; valor: T } | { ok: false; error: ErrorPortada };

/** ¿Tiene el libro una portada guardada? Es puramente el filesystem: no hay columna que consultar. */
export function tienePortada(id: number): boolean {
  return fs.existsSync(rutaDeArchivo(id));
}

/**
 * Decodifica, valida y redimensiona los bytes subidos a una miniatura de 96 px de lado mayor.
 *
 * El tamaño se valida **antes** de invocar `sharp` (mitigación M18/M13, riesgo R14/R19): un
 * archivo por debajo del límite nunca llega a decodificarse con dimensiones fuera de la cota
 * por defecto de `sharp`/`libvips`, que este módulo nunca aumenta.
 *
 * El reencodeo a JPEG **no llama `withMetadata()`**: `sharp` descarta el EXIF (GPS incluido)
 * por defecto (mitigación M17, riesgo R18).
 *
 * Cualquier excepción de `sharp` al decodificar (formato no admitido, archivo corrupto) se
 * captura y se traduce a un rechazo de campo — nunca se propaga el mensaje de `sharp`/`libvips`
 * (mitigación M16).
 */
export async function procesarPortada(bytesOriginales: Buffer): Promise<CampoValidado<Buffer>> {
  if (bytesOriginales.byteLength > TAMANIO_MAXIMO_BYTES) {
    return { ok: false, error: { campo: 'foto', detalle: 'demasiado_grande' } };
  }

  try {
    const procesado = await sharp(bytesOriginales)
      .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: 'contain' })
      .jpeg()
      .toBuffer();

    return { ok: true, valor: procesado };
  } catch {
    return { ok: false, error: { campo: 'foto', detalle: 'formato_no_admitido' } };
  }
}

/**
 * Escribe la portada ya procesada, atómicamente: a un archivo temporal con sufijo único en el
 * mismo directorio, seguido de un `rename()` al nombre final (mitigación M15, riesgo R16). Un
 * fallo de infraestructura al escribir o renombrar (disco lleno, permisos) se propaga sin
 * capturar, igual que `crearLibro()` ante el mismo tipo de fallo.
 */
export function guardarPortadaProcesada(id: number, buffer: Buffer): void {
  const directorio = rutaDirectorioPortadas();
  fs.mkdirSync(directorio, { recursive: true });

  const destino = rutaDeArchivo(id);
  const sufijo = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const temporal = path.join(directorio, `${id}.${sufijo}.tmp`);

  fs.writeFileSync(temporal, buffer);
  fs.renameSync(temporal, destino);
}

/**
 * Valida, redimensiona y guarda una foto en un solo paso: el flujo de reemplazo desde el
 * detalle (Block 3), donde no hay nada más que crear-o-fallar como en el alta. Si
 * `procesarPortada()` rechaza la foto, no escribe nada — la portada anterior, si había, queda
 * intacta (AC-07).
 */
export async function guardarPortada(
  id: number,
  bytesOriginales: Buffer,
): Promise<CampoValidado<Buffer>> {
  const resultado = await procesarPortada(bytesOriginales);

  if (!resultado.ok) {
    return resultado;
  }

  guardarPortadaProcesada(id, resultado.valor);
  return resultado;
}

/**
 * Quita la portada de un libro. `{ force: true }` ignora `ENOENT` (no había portada) y deja
 * pasar sin capturar cualquier otro fallo de infraestructura (permisos, por ejemplo).
 */
export function quitarPortada(id: number): void {
  fs.rmSync(rutaDeArchivo(id), { force: true });
}

/**
 * Lee la portada de un libro. `undefined` si el archivo no existe **o** si la lectura falla
 * por cualquier otro motivo (permisos, corrupción): el contrato de esta función es "no hay foto
 * legible", no "algo salió mal", así que es la única del módulo que absorbe cualquier fallo de
 * lectura en vez de propagarlo.
 */
export function leerPortada(id: number): Buffer | undefined {
  try {
    return fs.readFileSync(rutaDeArchivo(id));
  } catch {
    return undefined;
  }
}

/**
 * La ruta que hay que mostrar como portada vigente de un libro: la propia foto si existe, o el
 * logo por defecto si no (FR-06). **La única función que decide esta rama** — la usan
 * `app/libros/[id]/page.tsx` (Block 3) y `app/page.tsx` (Block 4), para no reimplementar el
 * mismo `if` en dos pantallas y arriesgar que diverjan.
 */
export function resolverRutaMostrable(id: number): string {
  return tienePortada(id) ? `/portadas/${String(id)}` : RUTA_LOGO_POR_DEFECTO;
}
