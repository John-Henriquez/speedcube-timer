import { useId } from 'react';

/** Campo de formulario con etiqueta, ayuda y error asociados (accesible). */
export default function Field({ label, error, hint, ...input }) {
  const id = useId();
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="acct-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...input} />
      {hint && !error && <span id={`${id}-hint`} className="acct-hint">{hint}</span>}
      {error && <span id={`${id}-err`} className="acct-error" role="alert">{error}</span>}
    </div>
  );
}