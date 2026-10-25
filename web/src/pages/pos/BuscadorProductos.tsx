import { useQuery } from '@tanstack/react-query';
import { forwardRef, useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Kbd } from '@/components/Button';
import { cx } from '@/components/cx';
import { useDebounced } from '@/hooks/useDebounced';
import { money } from '@/lib/format';

export type ProductoPos = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  nombre: string;
  tipo: 'bien' | 'servicio';
  precio: number;
  stock: number;
};

/** PRT-POS-01: SKU, nombre o código de barras; un lector que "teclea" el SKU + Enter agrega la línea. */
export const BuscadorProductos = forwardRef<
  HTMLInputElement,
  { onAdd: (p: ProductoPos) => void; disabled?: boolean }
>(function BuscadorProductos({ onAdd, disabled }, ref) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const dq = useDebounced(q.trim(), 120);
  const { data } = useQuery({
    queryKey: ['pos-buscar', dq],
    queryFn: () =>
      api<{ items: ProductoPos[]; exact: ProductoPos | null }>(
        `/productos/buscar?q=${encodeURIComponent(dq)}`,
      ),
    enabled: dq.length > 0,
  });
  const items = dq ? (data?.items ?? []) : [];
  useEffect(() => setIdx(0), [dq]);

  const add = (p: ProductoPos) => {
    onAdd(p);
    setQ('');
  };

  const onKey = async (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const term = q.trim();
      if (!term) return;
      // Lector de código de barras: búsqueda exacta inmediata, sin esperar el debounce.
      const r =
        term === dq && data
          ? data
          : await api<{ items: ProductoPos[]; exact: ProductoPos | null }>(
              `/productos/buscar?q=${encodeURIComponent(term)}`,
            );
      const pick = r.exact ?? (term === dq ? items[idx] : r.items[0]);
      if (pick) add(pick);
    } else if (e.key === 'Escape') {
      setQ('');
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-card border border-borde bg-superficie px-3 focus-within:border-sello-600">
        <span className="text-pizarra-400">⌕</span>
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder="Buscar por SKU, nombre o código de barras"
          aria-label="Buscar producto"
          data-testid="pos-buscar"
          className="h-12 flex-1 bg-transparent text-base outline-none focus-visible:outline-none"
        />
        <Kbd>F2</Kbd>
      </div>
      {items.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-card border border-borde bg-superficie shadow-xl"
        >
          {items.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === idx}
              onMouseEnter={() => setIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                add(p);
              }}
              className={cx(
                'flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5',
                i === idx && 'bg-sello-100',
              )}
            >
              <span>
                <span className="block text-sm">{p.nombre}</span>
                <span className="num text-xs text-tinta-600">
                  {p.sku} · {p.tipo === 'servicio' ? 'servicio' : `stock ${p.stock}`}
                </span>
              </span>
              <span className="num text-sm">{money(p.precio)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
