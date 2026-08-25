'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * `BotonEnvio` se aparta del principio "Client Component controlado enteramente por props, sin
 * hooks internos" que ADR-001 fija para `Feedback` (spec FEAT-002b, Block 1): lee
 * `useFormStatus()` acá adentro porque es la única forma de conocer el estado de un `<form>` cuya
 * acción es `Promise<void>` sin `useActionState` — el hook sólo funciona en un componente hijo del
 * `<form>`, nunca en el mismo componente que lo declara.
 *
 * El spread queda acotado a atributos nativos de `<button>` más `data-*` (mitigación 2 del threat
 * model FEAT-002b): nunca `Record<string, unknown>` ni un tipo abierto.
 */
type PropsBotonEnvio = ButtonHTMLAttributes<HTMLButtonElement> &
  Record<`data-${string}`, string> & { textoEnviando?: string };

export function BotonEnvio({ textoEnviando, children, disabled, ...props }: PropsBotonEnvio) {
  const { pending } = useFormStatus();

  return (
    <button {...props} type="submit" disabled={pending || disabled}>
      {pending ? (textoEnviando ?? children) : children}
    </button>
  );
}
