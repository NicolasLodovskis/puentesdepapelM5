# ADR-001: Tailwind CSS + componentes de UI propios (sin kit completo)

| Field | Value |
|-------|-------|
| Date | 2026-08-23 |
| Ticket | FEAT-002a |
| Status | Accepted |

## Context

FEAT-002a necesita dejar instalada una base de estilos/componentes que FEAT-002b y FEAT-002c van a
reutilizar (prd-FEAT-002a.md, FR-01/FR-04). El listado de libros (`listado-libros.tsx`) es un
Server Component deliberadamente sin JavaScript de cliente por fila, por rendimiento con ~2.000
libros (NFR-01 de FEAT-001a) — cualquier elección de UI tiene que convivir con esa restricción.

## Options considered

### Option 1: Kit de componentes completo (shadcn/ui sobre Tailwind, o similar)
- **Pros:** componentes ya resueltos (accesibilidad, variantes), menos código propio para escribir.
- **Cons:** trae dependencias adicionales (Radix y otras) y varios de sus componentes son Client
  Components por diseño; para una app de un solo usuario es más superficie de la que hace falta, y
  choca con la restricción de cero JS de cliente por fila si se usa sin cuidado.

### Option 2: CSS plano, sin utilidades ni tokens
- **Pros:** cero dependencias nuevas.
- **Cons:** no da tokens de diseño reutilizables entre pantallas; cada sub-ticket (FEAT-002b,
  FEAT-002c) reinventaría su propia paleta/espaciado, exactamente el problema que el PRD padre
  quiere resolver.

### Option 3 (elegida): Tailwind CSS v4 (config CSS-first) + componentes propios mínimos
- **Pros:** los tokens de diseño quedan en un solo lugar (`@theme` en `globals.css`); Tailwind es
  CSS en build-time, no agrega JS de cliente; los tres componentes propios (`Boton`, `CampoTexto`,
  `Feedback`) se diseñan a medida de las restricciones ya existentes en el código.
- **Cons:** hay que escribir y mantener esos tres componentes en vez de importarlos ya hechos.

## Decision

Tailwind CSS v4 + un conjunto propio y mínimo de componentes en `app/componentes/ui/`. Dos
consecuencias de diseño quedan fijadas por esta decisión:

- `Boton` es **polimórfico** (`as="button" | "a"`) y nunca lleva manejadores de evento: cuando
  `as="a"` renderiza el mismo `<a href>` que hoy usan las celdas "Ver"/"Vender" de
  `ListadoLibros`, sólo que con las clases compartidas — así no rompe la ausencia de JS de cliente
  por fila ni la semántica de enlace que exige AC-17 del PRD maestro (la venta no se dispara a un
  click).
- `Feedback` es un Client Component **controlado por props** (`estado`, `mensaje`), sin leer
  `useFormStatus()` internamente, para no imponerle una estructura de formulario particular a
  FEAT-002b/FEAT-002c, que deciden cómo conectarlo a su propio `useActionState`.

## Consequences

- Nuevas devDependencies: `tailwindcss`, `@tailwindcss/postcss`.
- Nuevo archivo `postcss.config.mjs`; `app/globals.css` gana un `@import "tailwindcss"` y un bloque
  `@theme`, sin agregar ninguna regla para el selector `.pantalla` (compartido con pantallas fuera
  de alcance: `error.tsx`, `not-found.tsx`, `libros/[id]/page.tsx`).
- Nuevos archivos `app/componentes/ui/boton.tsx`, `campo-texto.tsx`, `feedback.tsx`.
- FEAT-002b y FEAT-002c quedan atados a esta API de `Boton`/`Feedback`: un cambio de contrato ahí
  es una decisión que también los afecta.
