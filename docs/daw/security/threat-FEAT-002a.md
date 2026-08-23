# Threat Model FEAT-002a: Base (sistema de diseño y test DOM) y listado/búsqueda

| Field | Value |
|-------|-------|
| Ticket | FEAT-002a |
| Date | 2026-08-23 |
| Result | PASSED |

## Contexto del diseño

FEAT-002a no toca datos, Server Actions ni la capa `lib/db/`: es una capa de estilos (Tailwind CSS
v4) y tres componentes de presentación nuevos (`Boton`, `CampoTexto`, `Feedback` en
`app/componentes/ui/`), aplicados a `app/page.tsx`, `buscador.tsx`, `listado-libros.tsx` y
`estado-del-catalogo.tsx`. No hay flujo de datos nuevo: los mismos datos que hoy renderiza el
listado (título, editorial, stock, precio, portada) siguen viniendo de `buscarLibros()` sin cambios.

## Superficies de ataque identificadas

1. **Boton / CampoTexto** (Server Components, presentacionales) — reciben `children`/texto que en
   la tabla del listado proviene de datos cargados por la usuaria (título, editorial).
2. **Feedback** (Client Component, primer bundle de JS de cliente nuevo desde `FormularioAlta`) —
   muestra un `mensaje` de éxito/error controlado por props.
3. **Cadena de suministro**: 5 devDependencies nuevas (`tailwindcss`, `@tailwindcss/postcss`,
   `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`).
4. **Compilación de Tailwind** (`@theme` en `globals.css`, clases de variante en `Boton`).

## Fronteras de confianza

- **Navegador ↔ Server Component**: sin cambios — los componentes nuevos no introducen ninguna
  entrada nueva del usuario; siguen renderizando los mismos datos que ya pasaban por
  `buscarLibros()`.
- **Navegador ↔ Feedback (Client Component)**: nueva frontera de ejecución en el cliente, pero
  **sin conexión a ninguna Server Action en este ticket** — FEAT-002a construye el componente y lo
  testea, no lo conecta a nada real (eso es FEAT-002b/FEAT-002c).
- **Build-time (Tailwind/PostCSS) ↔ runtime**: Tailwind genera CSS en build; no ejecuta con datos
  de usuario en producción.

## Análisis STRIDE

| Componente | S | T | R | I | D | E |
|---|---|---|---|---|---|---|
| Boton / CampoTexto | N/A | Ver riesgo 1 | N/A | N/A | N/A | N/A |
| Feedback | N/A | Ver riesgo 1 | N/A | Ver riesgo 3 | N/A | N/A |
| Dependencias nuevas | N/A | N/A | N/A | N/A | N/A | Ver riesgo 2 (supply chain) |
| Compilación Tailwind | N/A | Ver riesgo 4 | N/A | N/A | N/A | N/A |

Categorías sin riesgo aplicable (Spoofing, Repudiation, Elevation of Privilege): este ticket no
introduce identidad, autenticación ni acciones que requieran trazabilidad — son las mismas que ya
cubre (o no aplica) el resto de la app de un solo usuario.

## Riesgos

| Riesgo | STRIDE | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| 1. XSS si algún componente nuevo renderizara texto de usuario (título, editorial, mensaje) vía `dangerouslySetInnerHTML`/`innerHTML` | Tampering | Baja | Alto | **Ya cubierto**: el guardia existente `test/app/acciones.test.ts` ("no inyecta HTML sin escapar en ningún archivo de `app/`") barre recursivamente todo `app/`, así que `app/componentes/ui/*.tsx` queda cubierto sin escribir nada nuevo. Block 3 no debe usar `dangerouslySetInnerHTML`, `innerHTML` ni URLs `javascript:` en ningún caso. |
| 2. Cadena de suministro: 5 devDependencies nuevas | Elevation of Privilege (dependencia comprometida) | Baja | Medio | Van fijadas a una versión exacta en `package.json` (mismo criterio que el resto de las dependencias del proyecto, ej. `"next": "16.3.0"`), y las 4 de testing (`jsdom`, `@testing-library/*`) quedan en `devDependencies`: nunca se empaquetan para producción, así que su superficie de ataque real es sólo el entorno de desarrollo/CI. `daw-security-sast` corre sobre el árbol final en CODE. |
| 3. Un mensaje de error de `Feedback` filtrara detalle de infraestructura (nombres de tabla, mensajes del motor) | Information Disclosure | Baja (este ticket no lo conecta a nada) | Alto si ocurriera | `Feedback` no genera el texto: sólo lo muestra. Se documenta como restricción para quien lo conecte (FEAT-002b/FEAT-002c): `mensaje` siempre es un string curado para la usuaria, nunca el error crudo — mismo criterio ya aplicado en el proyecto (`test/app/detalle.test.ts` verifica que `ERROR_DE_INFRAESTRUCTURA` nunca llegue a la pantalla). |
| 4. Construcción dinámica de clases Tailwind a partir de datos de usuario (ej. interpolar el título en un `className`) | Tampering (bypass del CSS estático / inflado del build) | Baja | Bajo | `Boton.variante` es una unión cerrada de valores fijos (`'primario' \| 'secundario'`), mapeada a strings de clase estáticos — nunca se interpola un dato de libro en un `className`. |

Ningún riesgo alcanza CRITICAL/HIGH: este ticket no toca datos, Server Actions ni autenticación, así
que no hace falta un riesgo aceptado formal (F-TM-04) — los cuatro quedan con mitigación.

## Datos sensibles

Ninguno nuevo. Los mismos datos que ya maneja el catálogo (título, editorial, stock, precio,
portada) — ninguno es PII ni credencial; no aplica cifrado adicional (F-TM-07 no aplica).

## Mitigaciones a incorporar en la spec

1. Prohibir `dangerouslySetInnerHTML`, `innerHTML` y URLs `javascript:` en `Boton`, `CampoTexto` y
   `Feedback` (ya cubierto por el guardia existente, sin acción de test nueva).
2. Fijar versión exacta de las 5 devDependencies nuevas en `package.json`.
3. Documentar en la spec que `Feedback.mensaje` es siempre texto curado, nunca un error crudo de
   infraestructura.
4. `Boton.variante` como unión cerrada de valores, nunca interpolación de datos de usuario en
   `className`.

## Resultado

**PASSED** — 4 riesgos identificados, los 4 con mitigación folded en la spec, 0 riesgos
CRITICAL/HIGH, 0 riesgos aceptados formalmente (no hicieron falta).
