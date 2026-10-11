import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { inputBox } from '../lib/ui';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Short help shown under the label */
  hint?: string;
  /** Validation message; shown in red and announced to screen readers */
  error?: string;
  /** Fixed text shown inside the box before the value, e.g. "+91" */
  prefix?: string;
}

/** A labelled text input with a hint and an error message wired up accessibly. */
export default function Field({ label, hint, error, prefix, className, ...input }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <label htmlFor={id} className="block font-semibold text-ink">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-[0.95rem] text-muted">
          {hint}
        </p>
      )}
      <div className="relative">
        {prefix && (
          <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${inputBox} ${prefix ? 'pl-14' : ''}`}
          {...input}
        />
      </div>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-[0.95rem] font-medium text-[#b3261e]">
      {children}
    </p>
  );
}

/** A message box for the result of a whole form: error (red) or success (sage). */
export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const look =
    kind === 'error'
      ? 'border-[#e3b9b6] bg-[#fdf3f2] text-[#8c1d18]'
      : kind === 'success'
        ? 'border-sage-300 bg-sage-50 text-sage-900'
        : 'border-lavender-200 bg-lavender-100 text-ink';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 ${look}`}>
      {children}
    </div>
  );
}
