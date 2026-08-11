import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `better-sqlite3` es un módulo nativo (.node). Sin esto el bundler intenta
  // empaquetar el binding y el build falla o no resuelve en runtime.
  serverExternalPackages: ['better-sqlite3'],
  // NO se configura `experimental.serverActions.allowedOrigins` a propósito
  // (mitigación 6, riesgo R5): se conserva la validación de `Origin` que
  // Next.js aplica por defecto a los Server Actions.
  //
  // `next dev` inyecta un bloque `nextjs-agent-rules` dentro de AGENTS.md en
  // cada arranque, y prefiere ese archivo sobre CLAUDE.md cuando existen los
  // dos. AGENTS.md es la fuente de verdad del stack, de las convenciones y de
  // los cinco Principios de este proyecto: ninguna herramienta lo reescribe
  // sola. No hay variable de entorno que lo desactive — esta clave es el único
  // control.
  agentRules: false,
};

export default nextConfig;
