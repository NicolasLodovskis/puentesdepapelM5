# SAST — FEAT-001c: Portadas

| Campo | Valor |
|---|---|
| Ticket | FEAT-001c |
| Fecha | 2026-08-20 |
| Alcance | Archivos tocados por el ticket (branch vs. `main`) |

## Resumen

| Categoría | Resultado |
|---|---|
| Secretos hardcodeados (F-SAST-01) | ✅ Limpio |
| Inyección SQL/NoSQL (F-SAST-02) | ✅ Limpio — sin queries concatenadas nuevas; `lib/portadas/` no ejecuta SQL |
| Inyección de comandos (F-SAST-03) | ✅ Limpio — sin `exec`/`spawn`/`child_process` en el código nuevo |
| Funciones inseguras / deserialización (F-SAST-04) | ✅ Limpio — sin `eval()` |
| Path traversal (F-SAST-05) | ✅ Mitigado — `resolverRutaConfinada()` valida contra escape de raíz (mitigación M12); el nombre de archivo de portada siempre nace de `identificadorDeLibro()` → `${id}.jpg` (mitigación M20), nunca de un dato crudo de la request |
| XSS (F-SAST-06) | ✅ Limpio — sin `dangerouslySetInnerHTML`/`innerHTML`; el `<img src>` del listado usa sólo `rutaPortada` calculada en el servidor, nunca título/editorial |
| SSRF (F-SAST-07) | N/A — no hay llamadas de red salientes en este ticket |
| Crypto débil (F-SAST-08) | N/A — sin uso de hashing/crypto para contraseñas en este ticket |
| Debug mode en producción (F-SAST-09) | ✅ Limpio |
| Logging de datos sensibles (F-SAST-10) | ✅ Mitigado — los `console.error` de `app/acciones.ts` y `app/acciones-libro.ts` nunca incluyen el buffer de la imagen ni el texto nativo de `sharp`/`libvips` (mitigación M16), verificado por test |
| Upload sin restricción (F-SAST-11) | ✅ Mitigado — límite de 10 MB verificado ANTES de invocar `sharp` (mitigación M18), formato aceptado únicamente por éxito de decodificación (no por extensión ni `File.type`) |
| CSRF (F-SAST-12) | ✅ Sin cambios — `next.config.ts` sigue sin `experimental.serverActions.allowedOrigins`, preservando la validación de `Origin` por defecto de Next.js (mitigación 6 de FEAT-001a) |
| Dependencias con CVEs (F-SAST-13/16) | ✅ `npm audit --omit=dev` → 0 vulnerabilidades. `sharp` fijado en versión exacta 0.35.3 (mitigación M14) |
| Validación de entrada incompleta (F-SAST-14) | ✅ Mitigado — tamaño y formato validados en las tres superficies de entrada (alta, asignar, ruta de servido), todas delegando en `lib/portadas/` |
| Manejo de errores que filtra internals (F-SAST-15) | ✅ Mitigado — `procesarPortada()` nunca propaga el mensaje nativo de `sharp`/`libvips` (mitigación M16); el Route Handler nunca responde con un stack trace ni con la ruta absoluta del archivo |

## Hallazgo corregido durante CODE (no un finding de SAST, referencia)

Durante la doble revisión del Block 4, el `arch-auditor` encontró una condición de carrera:
`fs.statSync()` sobre el archivo del libro en `app/portadas/[id]/route.ts` no estaba envuelto en
`try/catch`, permitiendo un `ENOENT` sin capturar si el archivo se borraba/reemplazaba entre la
lectura y el cálculo de las cabeceras de caché. Corregido antes de este SAST (commit `7d25e0f`),
con test de regresión. No se computa como hallazgo de esta ronda porque ya está cerrado.

## Suppressions

Ninguna. No hubo hallazgos Medium que requirieran supresión documentada.

## Conclusión

0 vulnerabilidades Critical/High/Medium abiertas. `gates.sast` = `true`.
