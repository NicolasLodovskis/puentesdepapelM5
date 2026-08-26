# SAST — FEAT-002c (cierre de CODE)

Alcance: los 4 bloques del ticket (`app/componentes/ui/boton.tsx`, `formulario-alta.tsx`,
`formulario-edicion.tsx`, `formulario-portada.tsx`, y sus tests), diff contra `110303a` (merge de
FEAT-002b).

## Secretos
- ✅ F-SAST-01: sin claves, tokens ni credenciales hardcodeadas en el diff. `.env`/`.env.*` en
  `.gitignore`.

## Inyección
- ✅ F-SAST-02 (SQL/NoSQL): el diff no toca `lib/db/` ni `app/acciones.ts`/`app/acciones-libro.ts` —
  cero cambios en las rutas que arman queries.
- ✅ F-SAST-03 (command injection): sin `exec`/`spawn`/`child_process` en los archivos tocados.
- ✅ F-SAST-05 (path traversal): sin manejo de rutas de archivo en el diff — el `<CampoTexto
  type="file">` de `formulario-portada.tsx` es markup puro; `asignarFoto()`/`quitarFoto()`
  (server actions que sí tocan filesystem) no se modificaron.

## XSS y funciones inseguras
- ✅ F-SAST-06: sin `dangerouslySetInnerHTML` ni `innerHTML` en ninguno de los 4 archivos.
- ✅ F-SAST-04/17: sin `eval()` ni deserialización insegura.
- ✅ F-SAST-08: sin criptografía tocada por este ticket.

## Resto de categorías obligatorias
- ✅ F-SAST-07 (SSRF): sin llamadas de red nuevas.
- ✅ F-SAST-09 (debug en producción): sin flags de debug agregados.
- ✅ F-SAST-10 (logging de datos sensibles): sin `console.log`/logging nuevo en el diff.
- ✅ F-SAST-11 (upload sin restricción): `<CampoTexto type="file" accept="image/*">` es sólo el
  marcado del input — la validación real del archivo subido vive en `asignarFoto()`
  (`app/acciones-libro.ts`), fuera del alcance de este ticket y sin cambios.
- ✅ F-SAST-12 (CSRF): Server Actions de Next.js con protección nativa; ningún formulario nuevo se
  agregó, sólo se migró el marcado de los ya existentes.
- ✅ F-SAST-14 (validación de input incompleta): sin cambios en la validación — `required`,
  `maxLength`, `min`/`max`/`step` se preservan igual que antes de la migración.
- ✅ F-SAST-15 (manejo de errores que filtra info interna): `Feedback`/`error-de-campo` no se
  tocaron; mismos mensajes que ya existían.

## Dependencias
- ✅ F-SAST-13/16: `npm audit` → 0 vulnerabilidades (con y sin `--omit=dev`). Ningún `package.json`
  tocado por este ticket.

## Suppressions
Ninguna.

---
Total: 12 categorías limpias, 0 vulnerabilidades (0 críticas, 0 altas)
Result: PASSED
