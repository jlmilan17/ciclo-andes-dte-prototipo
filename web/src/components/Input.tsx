import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: ReactNode;
  mono?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, mono, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor={inputId}>
      {label && <span className="font-medium text-tinta-600">{label}</span>}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        {...rest}
        className={cx(
          'h-9 rounded-control border bg-superficie px-3 text-tinta-900 placeholder:text-pizarra-400',
          error ? 'border-granate-600' : 'border-borde',
          mono && 'num',
          className,
        )}
      />
      {error ? (
        <span role="alert" className="text-xs text-granate-600">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs text-pizarra-400">{hint}</span>
      )}
    </label>
  );
});

export function Select({
  label,
  error,
  children,
  className,
  ...rest
}: InputHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-tinta-600">{label}</span>}
      <select
        aria-label={label}
        {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        className={cx(
          'h-9 rounded-control border bg-superficie px-2',
          error ? 'border-granate-600' : 'border-borde',
          className,
        )}
      >
        {children}
      </select>
      {error && <span className="text-xs text-granate-600">{error}</span>}
    </label>
  );
}
