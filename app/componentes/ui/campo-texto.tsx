import type { InputHTMLAttributes } from 'react';

/**
 * `id` y `label` son explícitos porque los necesita el propio componente (para armar el
 * `htmlFor`); el resto de los atributos nativos del `<input>` (`placeholder`, `maxLength`,
 * `name`, `defaultValue`, etc.) se reciben tal cual por spread. Se excluye `id` del tipo nativo
 * para no declarar la misma propiedad dos veces con dos orígenes distintos.
 */
type PropsCampoTexto = { id: string; label: string } &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

/**
 * Server Component: un `<label htmlFor>` seguido de su `<input>`, sin estado propio. El
 * `focus-visible` usa el token `--color-foco` de Block 1 (`@theme`), expuesto por Tailwind v4
 * como la utilidad `outline-foco`, para que el foco de teclado sea visible (FR-03/AC-03).
 */
export function CampoTexto({ id, label, ...resto }: PropsCampoTexto) {
  return (
    <div className="campo-texto">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-texto">
        {label}
      </label>
      <input
        id={id}
        {...resto}
        className="w-full rounded border border-borde bg-fondo px-3 py-2 text-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
      />
    </div>
  );
}
