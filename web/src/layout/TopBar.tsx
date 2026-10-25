import { useEffect, useState, type ReactNode } from 'react';
import { time } from '@/lib/format';

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return <span className="num text-sm text-tinta-600">{time(now)}</span>;
}

/** Barra superior (64 px): estado de caja, conexión MH, reloj y herramientas de simulación. */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-borde bg-superficie px-6">
      <div className="flex items-center gap-3">{left}</div>
      <div className="flex items-center gap-4">
        {right}
        <Clock />
      </div>
    </header>
  );
}
