# Spec FEAT-002a: Base (sistema de diseño y test DOM) y listado/búsqueda

| Field | Value |
|-------|-------|
| Ticket | FEAT-002a |
| PRD | docs/daw/prd/prd-FEAT-002a.md |
| Tier | FEATURE |
| Date | 2026-08-23 |
| Spec loops | 0 |

## Summary

Se instala Tailwind CSS v4 (config CSS-first, sin `tailwind.config.ts`) con los tokens de diseño en
`app/globals.css`, y un entorno de test de componentes (jsdom + Testing Library) aislado por archivo
del entorno `node` que ya usan los tests de Server Actions. Sobre esa base se construyen tres
componentes propios (`Boton`, `CampoTexto`, `Feedback` — ver ADR-001) y se aplican al listado y a la
búsqueda (`page.tsx`, `buscador.tsx`, `listado-libros.tsx`, `estado-del-catalogo.tsx`), sin tocar
lógica, Server Actions ni los `data-campo` de los que dependen 5 tests existentes.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 4 (Block 1 provee los tokens) |
| FR-02 | Block 4 |
| FR-03 | Block 4 (Block 1 provee el token de foco) |
| FR-04 | Block 3 |
| NFR-01 | Strategy: tokens de contraste AA definidos en Block 1 (`@theme`), aplicados en Block 4 |
| NFR-02 | Block 2 |
| NFR-03 | Strategy: ningún bloque toca `lib/db/`, ninguna Server Action ni los `data-campo`; Block 4 corre los 5 tests existentes que dependen de ellos sin modificarlos |
| AC-01 | Block 1, Block 4 |
| AC-02 | Block 4 |
| AC-03 | Block 4 |
| AC-04 | Block 3 |
| AC-05 | Block 2 (entorno), Block 3 (tests) |
| AC-06 | Block 4 (los 5 tests protegidos, corridos sin modificar su código, prueban la ausencia de cambio fuera de alcance) |

## Dependencies between blocks

Block 1 → Block 2 (independientes entre sí, pueden ir en cualquier orden, pero ambos antes que
Block 3) → Block 3 (los componentes usan las clases/tokens de Block 1 y se testean en el entorno de
Block 2) → Block 4 (aplica los componentes de Block 3 sobre las pantallas). Orden: 1 → 2 → 3 → 4.

## Block 1 — Fundación de estilos (Tailwind CSS v4)

**Files**
- `package.json` (modified) — agrega devDependencies `tailwindcss@4.3.3`,
  `@tailwindcss/postcss@4.3.3` (versiones exactas, sin rango — mitigación 2 del threat model).
- `package-lock.json` (modified) — regenerado por `npm install`.
- `postcss.config.mjs` (new) — registra el plugin `@tailwindcss/postcss`.
- `app/globals.css` (modified) — agrega `@import "tailwindcss";` y un bloque `@theme` con los
  tokens de color (texto, fondo, borde, foco), tipografía y espaciado. **No agrega ninguna regla
  para el selector `.pantalla`** (compartido con `app/error.tsx`, `app/not-found.tsx` y
  `app/libros/[id]/page.tsx`, fuera de alcance de este ticket — hallazgo del impact scan).

**Logic**

`@theme` define, como mínimo: `--color-texto`, `--color-fondo`, `--color-borde`,
`--color-foco` (para el anillo de foco visible que exige FR-03/AC-03), y la familia tipográfica. Los
valores concretos se eligen para cumplir NFR-01 (contraste AA 4.5:1 texto normal, 3:1 texto
grande/gráfico) — se verifica con una herramienta de contraste al definirlos, no en tiempo de
ejecución.

**Input validation**

No aplica: es configuración de build, sin entrada de usuario.

**Error handling**

No aplica: si Tailwind no compila, `npm run build`/`next dev` fallan igual que fallaría cualquier
error de sintaxis CSS hoy — no se agrega manejo nuevo.

**Required tests**

- [ ] Test de convención (`test/convenciones/`) que confirma que `app/globals.css` contiene
      `@import "tailwindcss"` y un bloque `@theme` con las variables `--color-texto`,
      `--color-fondo`, `--color-borde` y `--color-foco` definidas — valida AC-01 en su parte de
      fundación.
- [ ] El mismo test confirma que `app/globals.css` **no** contiene una regla `.pantalla {` —
      guardia de la mitigación del impact scan (evita que el estilo se filtre a las pantallas fuera
      de alcance).

**Completion criterion**

`npm run build` compila sin error con Tailwind activo; `npm run lint` y `npx tsc --noEmit` limpios;
el test de convención de tokens está en verde.

## Block 2 — Entorno de test de componentes (DOM aislado)

**Files**
- `package.json` (modified) — agrega devDependencies `jsdom@30.0.1`,
  `@testing-library/react@16.3.2`, `@testing-library/jest-dom@7.0.1` (versiones exactas).
- `package-lock.json` (modified).
- `test/componentes/entorno.smoke.test.tsx` (new).
- `test/convenciones/entorno-de-componentes.test.ts` (new).

**Logic**

Cada archivo de test bajo `test/componentes/` empieza con el pragma `// @vitest-environment jsdom`
en su primera línea y con `import '@testing-library/jest-dom/vitest';` para los matchers. No se
modifica `vitest.config.ts`: los tests existentes (`test/app/`, `test/db/`, etc.) siguen en el
entorno `node` por defecto, sin DOM.

**Input validation**

No aplica.

**Error handling**

No aplica: es infraestructura de test, sin rutas de error de producto.

**Required tests**

- [ ] `entorno.smoke.test.tsx`: renderiza un elemento trivial con `@testing-library/react` y
      confirma con un matcher de `jest-dom` (`toBeInTheDocument()`) que el entorno jsdom y los
      matchers funcionan — primer test real del entorno nuevo.
- [ ] `entorno-de-componentes.test.ts` (convención): recorre `test/app/`, `test/db/`,
      `test/dominio/`, `test/portadas/`, `test/convenciones/`, `test/rutas-confinadas.test.ts` y
      `test/rendimiento/` y confirma que ninguno de esos archivos contiene el pragma
      `@vitest-environment jsdom` — aislamiento de NFR-02 verificado, no sólo asumido.

**Completion criterion**

El smoke test pasa en jsdom; el test de convención de aislamiento pasa; `npm test` completo (suite
existente + los dos nuevos) sigue en verde.

## Block 3 — Componentes de UI compartidos

**Files**
- `app/componentes/ui/boton.tsx` (new)
- `app/componentes/ui/campo-texto.tsx` (new)
- `app/componentes/ui/feedback.tsx` (new)
- `test/componentes/boton.test.tsx` (new)
- `test/componentes/campo-texto.test.tsx` (new)
- `test/componentes/feedback.test.tsx` (new)

**Logic**

- **`Boton`** (Server Component, sin `'use client'`, ADR-001): props `{ as?: 'button' | 'a';
  href?: string; type?: 'button' | 'submit'; variante?: 'primario' | 'secundario'; children:
  ReactNode }`. Cuando `as === 'a'` exige `href` (unión discriminada en el tipo) y renderiza
  `<a href className>`; en cualquier otro caso renderiza `<button type className>`. **Nunca** agrega
  un manejador de evento — sigue siendo un componente sin estado ni JS propio, sin importar qué
  elemento renderiza. `variante` mapea a un objeto de clases Tailwind estáticas (mitigación 4 del
  threat model: nunca se interpola un dato de libro en el `className`).
- **`CampoTexto`** (Server Component): props `{ id: string; label: string } & PropsInputNativas`.
  Renderiza `<label htmlFor={id}>{label}</label>` seguido de `<input id={id} {...resto} />` con
  clases Tailwind que incluyen el estado de foco visible (`focus-visible:` con el token
  `--color-foco` de Block 1).
- **`Feedback`** (Client Component, `'use client'`): props `{ estado: 'inactivo' | 'cargando' |
  'exito' | 'error'; mensaje?: string }`, controlado enteramente por props — no llama
  `useFormStatus()` ni `useActionState()` internamente (ADR-001), para que FEAT-002b/FEAT-002c
  decidan cómo lo alimentan. Cuando `estado !== 'inactivo'` renderiza un contenedor con
  `role="status"` y `aria-live="polite"`; `mensaje` se renderiza siempre como texto plano (nunca
  `dangerouslySetInnerHTML` — mitigación 1 del threat model).

**Input validation**

No aplica: son componentes de presentación puros; la validación de negocio sigue exclusivamente en
`lib/dominio/` y las Server Actions, sin cambios.

**Error handling**

No hay rutas de error en runtime en este bloque: `Boton` con `as === 'a'` sin `href` lo impide la
unión discriminada de TypeScript en tiempo de compilación — no hay caso de error que ejecutar ni
testear en runtime, y queda cubierto por `npx tsc --noEmit` (ya en el criterio de cierre del
bloque). `Feedback.mensaje` es contractualmente texto curado por quien lo use, no una validación que
este componente ejecute — restricción documentada para FEAT-002b/002c (mitigación 3 del threat
model), sin runtime error propio de este bloque.

**Required tests**

- [ ] `boton.test.tsx`: `<Boton as="a" href="/x">Ver</Boton>` renderiza un `<a href="/x">` sin
      atributos `onClick`; `<Boton>Guardar</Boton>` (sin `as`) renderiza un `<button type="button">`.
- [ ] `campo-texto.test.tsx`: el `<label>` tiene `htmlFor` igual al `id` del `<input>`; el input
      recibe `placeholder`/`maxLength` pasados por props.
- [ ] `feedback.test.tsx`: para cada valor de `estado` confirma el contenido/rol renderizado
      (`role="status"` presente sólo cuando `estado !== 'inactivo'`); confirma que `mensaje`
      aparece como texto (query por texto, no por HTML insertado) y que el archivo fuente no
      contiene `dangerouslySetInnerHTML` (además del guardia global de `test/app/acciones.test.ts`,
      que ya cubre `app/` completo).

**Completion criterion**

Los 3 componentes y sus 3 tests están en verde en el entorno jsdom de Block 2; ninguno importa nada
de `lib/db/`, `app/acciones.ts` ni `app/acciones-libro.ts`.

## Block 4 — Aplicar el sistema al listado y la búsqueda

**Files**
- `app/page.tsx` (modified) — utilidades Tailwind aplicadas directamente en el JSX; no reestiliza
  `<FormularioAlta />` (queda para FEAT-002c — convive sin estilo dentro de la página reestilizada,
  aceptado como transición del split).
- `app/componentes/buscador.tsx` (modified) — usa `CampoTexto` para el input de búsqueda; conserva
  el `<form action="/" method="get">` sin JS de cliente.
- `app/componentes/listado-libros.tsx` (modified) — las celdas "Ver" y "Vender" pasan a usar
  `<Boton as="a" href={...}>` en vez del `<a>` escrito a mano, con el mismo `href` y el mismo texto;
  conserva los 7 atributos `data-campo` sin cambios; la tabla se envuelve en un contenedor con
  `overflow-x-auto` para el caso de anchos menores a 360px sin romper el layout de la página (no se
  quita ninguna columna).
- `app/estado-del-catalogo.tsx` (modified) — reestilizado con los mismos tokens. **Decisión
  explícita** (hallazgo del arch-auditor): este componente también se renderiza como fallback de
  migración en `/libros/[id]/page.tsx` (FEAT-002b), así que su nuevo estilo se ve ahí también antes
  de que FEAT-002b exista. Se acepta porque es una pantalla de fallo rara (falla de migración de la
  base), no la vista de detalle en sí, y no toca `data-campo` ni Server Actions.

**Logic**

Sólo `className` y, donde hace falta para el responsive, un `<div>` wrapper (`overflow-x-auto`).
Ningún cambio de props, de lógica, ni de las Server Actions ya existentes.

**Input validation**

Sin cambios: `Buscador` sigue enviando el mismo parámetro `q` de la misma forma.

**Error handling**

Sin cambios: `resolverFalloDelCatalogo()` sigue devolviendo lo mismo; sólo cambia cómo se ve.

**Required tests**

- [ ] Correr (sin modificar) y confirmar en verde: `test/app/detalle.test.ts`,
      `test/app/portadas-route.test.ts`, `test/app/acciones.test.ts`,
      `test/rendimiento/listado.bench.test.ts`, `test/db/identidad.test.ts` — los 5 tests
      existentes que renderizan estos componentes vía `renderToStaticMarkup` y aserían sobre su
      HTML (`data-campo`, clases, mensajes). Sin modificar su código fuente, sirven como test de
      AC-06/NFR-03: si alguno cambiara de resultado, un cambio fuera de alcance (Server Action,
      excel, búsqueda por foto) se habría colado en este bloque.
- [ ] Nuevo test de componente (jsdom, Block 2) para `Buscador`: confirma que el campo mantiene su
      `defaultValue` y que el `<form>` sigue siendo `method="get"`.
- [ ] Test estructural (puede usar `renderToStaticMarkup`, sin necesitar jsdom) que confirma que las
      celdas "Ver"/"Vender" de `ListadoLibros` siguen siendo `<a href>` — no `<button>` — y que
      llevan la clase de variante compartida que expone `Boton` — valida AC-01 (uso real del
      sistema de diseño en el listado) además del contrato de `Boton` del ADR-001.
- [ ] Verificación manual (fuera de Vitest, documentada en el reporte de cierre de CODE): a 390px de
      ancho no aparece scroll horizontal en el listado ni en la búsqueda, y el foco es visible al
      navegar con Tab. jsdom no calcula layout real ni `:focus-visible` computado, así que AC-02 y
      AC-03 se verifican visualmente, no con un assert automatizado — igual que ya lo advirtió el
      juicio manual de F-PRD-02 en el PRD.

**Completion criterion**

`npm test` completo en verde (suite existente + los tests nuevos de este bloque), `npm run lint` y
`npx tsc --noEmit` limpios, y la verificación manual de responsive/foco visible documentada en el
reporte de cierre de CODE.

## Final verification

- Los 6 AC del PRD FEAT-002a (`docs/daw/prd/prd-FEAT-002a.md`) cumplidos: AC-01 a AC-04 verificables
  automáticamente o por inspección estructural; AC-02 y AC-03 con verificación manual documentada.
- ADR-001 (`docs/adr/adr-001-tailwind-y-componentes-propios.md`) referenciado y sus consecuencias
  (Boton polimórfico, Feedback controlado por props) respetadas por Block 3 y Block 4.
- Threat model FEAT-002a (`docs/daw/security/threat-FEAT-002a.md`) con sus 4 mitigaciones aplicadas:
  guardia XSS existente cubre `app/componentes/ui/` sin cambios, versiones de las 5 devDependencies
  nuevas fijadas exactas, `Feedback.mensaje` documentado como texto curado, `Boton.variante` como
  unión cerrada.
- Ningún archivo de `lib/db/`, ninguna Server Action, el flujo de excel ni la búsqueda por foto
  tocados por ningún bloque (NFR-03, AC-06).
- `npm test`, `npm run lint`, `npx tsc --noEmit` y `npm run build` en verde al cierre del último
  bloque.
