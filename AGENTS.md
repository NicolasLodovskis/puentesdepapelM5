# AGENTS.md — project context

> **DAW template.** Fill in the `[...]` with what is true of YOUR project and delete what does not
> apply. This file describes **the project**; **the process** is DAW's job (phases, gates, when to
> test, when to commit). Do not mix the two: process rules written here compete with the pipeline's.
>
> It is **tool-agnostic on purpose**: Claude Code reads it through the import in `CLAUDE.md`, Codex
> CLI, Copilot CLI, Cursor and OpenCode read it directly, and Gemini CLI gets it through
> `GEMINI.md`. The same file serves whichever tool you open the repo with — which is the point:
> porting the pipeline to another tool must not mean rewriting what your project is.

---

## Language

**Always respond in the language the user writes in.** Write every artifact you produce — PRDs,
specs, ADRs, reports, commit messages, status lines — in that same language, regardless of the
language these instructions are written in.

If this project has a fixed working language, state it here and use it instead:

> Working language: Spanish

---

## What this project is

Software de gestión de stock y precios para una librería (un solo usuario).
ABM de libros, manejo de stock, alta masiva y actualización de precios individual y masiva por Excel, y búsqueda por nombre/editorial o por foto.

**Reference PRD:** `docs/daw/prd/PRD.md`

---

## Stack

**This is the only place the stack lives.** DAW reads it from here and generates no derived file.
Fill it in even if the repo is empty: without a stack there is nothing to plan or implement against.

If the repo already has code and this section is empty, DAW will detect the stack from your config
files and **propose the text for you to paste here**. You always confirm it.

| Field | Value |
|-------|-------|
| Language | TypeScript 5.9.3 |
| Runtime |  Node.js 20+ |
| Framework | Next.js 15.5.22 (App Router) + React 19.2.8 |
| Database | SQLite embebida (archivo .db único, sin servidor) vía better-sqlite3 13.0.2 — sin ORM |
| Test runner | Vitest 4.1.10 (npm test → vitest run) |
| Linter / formatter | ESLint 9.39.5 (eslint-config-next + eslint-config-prettier) + Prettier 3.9.6 |
| Package manager | npm (package-lock.json, y AGENTS.md documenta npm install / npm run dev / npm test) |

---

## Architecture conventions

**DAW validates your code against this section** during the CODE phase, via `daw-validate-arch`.
Leave it empty and that validation has nothing to compare against, so it stops being worth running.

- Next.js con App Router como aplicación full-stack de un solo proceso: la misma app sirve la UI y el backend vía API Routes / Server Actions (no hay frontend y backend separados).
- TypeScript + React.
- Persistencia embebida: SQLite, un único archivo .db, sin servidor, vía better-sqlite3.
- Dos flujos de Excel separados y no intercambiables: actualización de precios (libro, precio) y alta masiva (libro, editorial, stock, precio).
- Búsqueda por foto con librería local (sin definir en ese archivo).
- Tests con Vitest.

---

## What NOT to do in this project

This section is worth its weight in gold: it is where the scars go, the things that already went
wrong once.

- No construir una tienda virtual ni opción de compra para clientes: está explícitamente fuera de alcance.
- No reemplazar SQLite por otra base ni por un motor con servidor: la persistencia es un único archivo local (PRD sección 8 — Restricciones).
- No agregar login, roles ni soporte multiusuario: el sistema es de un único usuario y un único acceso.
- No escribir implementación antes de su test en rojo (Constitución, Principio I).
- No completar, adivinar ni estimar datos ausentes o ambiguos: se reportan (Principio II).
- No escribir stock ni precio sin su entrada de historial en la misma transacción; no borrar
  ni editar entradas de historial; no borrar libros físicamente (Principio III).
- No commitear secretos, archivos `*.db` ni Excel reales del negocio (Principio IV).
- No agregar features que no estén en el PRD vigente: primero se enmienda el PRD (Principio V).


---

## Domain glossary

The terms specific to your product, so the agent uses them correctly instead of inventing synonyms.

- **excel de precios:** archivo excel que carga el usuario para actualizar el precio de los libros que encuentra en la base de datos
- **excel de alta masiva:** archivo excel que carga el usuario con un listado de libros para agregar (alta) a la base de datos

---

> ℹ️ **What does NOT belong in this file, because DAW provides it:** the order work happens in, when
> the spec gets written, when tests run, when to commit, what it takes to move between phases. All
> of that lives in `.daw/` and applies on its own.

<!-- BEGIN DAW (managed by DAW — do not edit by hand) -->
# DAW — Dilux Agentic Workflow

This repo uses **DAW**: an agent-driven development pipeline with the phases
`CLASSIFY → DEFINE → PLAN → CODE → VERIFY → RELEASE`.

Before answering, read `.daw/orchestrator.md` and run its Boot Sequence. It is a strict state
machine: it decides what you are allowed to do based on the phase recorded in `.daw-state.json`.

The project's own context — stack, architecture, domain — is elsewhere in this file. It lives here,
in `AGENTS.md`, and not in any one tool's file, on purpose: it is tool-agnostic and comes along
unchanged when the pipeline is ported to another agent.
<!-- END DAW -->
