import type { ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'neutro' | 'exito' | 'aviso' | 'error' | 'oscuro';

const tones: Record<Tone, string> = {
  neutro: 'bg-papel-50 text-tinta-600 border-borde',
  oscuro: 'bg-tinta-900 text-white border-tinta-900',
  exito: 'bg-sello-100 text-sello-600 border-sello-600/40',
  aviso: 'bg-ambar-100 text-ambar-600 border-ambar-600/40',
  error: 'bg-granate-100 text-granate-600 border-granate-600/40',
};

export function Chip({
  tone = 'neutro',
  children,
  testId,
}: {
  tone?: Tone;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cx(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const STOCK: Record<string, { tone: Tone; label: string }> = {
  ACTIVO: { tone: 'exito', label: 'Activo' },
  BAJO_STOCK: { tone: 'aviso', label: 'Bajo stock' },
  SIN_STOCK: { tone: 'error', label: 'Sin stock' },
  INACTIVO: { tone: 'neutro', label: 'Inactivo' },
};

export function StockChip({ estado }: { estado: string }) {
  const s = STOCK[estado] ?? STOCK.ACTIVO!;
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
