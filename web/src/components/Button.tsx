import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-sello-600 text-white hover:bg-sello-600/90 disabled:bg-pizarra-400',
  secondary: 'bg-superficie text-tinta-900 border border-borde hover:bg-papel-50',
  ghost: 'bg-transparent text-tinta-600 hover:bg-tinta-900/5',
  danger: 'bg-granate-600 text-white hover:bg-granate-600/90 disabled:bg-pizarra-400',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  kbd?: string;
};

export function Button({
  variant = 'primary',
  size = 'md',
  kbd,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70',
        size === 'lg' ? 'h-14 px-6 text-base' : 'h-9 px-4 text-sm',
        variants[variant],
        className,
      )}
    >
      {children}
      {kbd && <Kbd inverse={variant === 'primary' || variant === 'danger'}>{kbd}</Kbd>}
    </button>
  );
}

export function Kbd({ children, inverse }: { children: string; inverse?: boolean }) {
  return (
    <kbd
      className={cx(
        'num rounded border px-1.5 py-0.5 text-xs',
        inverse ? 'border-white/40 text-white/90' : 'border-borde text-tinta-600',
      )}
    >
      {children}
    </kbd>
  );
}
