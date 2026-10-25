import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import { Button, Kbd } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { cx } from '@/components/cx';
import { Modal } from '@/components/Modal';
import { useDebounced } from '@/hooks/useDebounced';
import { TIPO_LABEL, docId, type Cliente } from './types';

/** RNF-CLI-02: F4 abre; flechas y Enter seleccionan; Esc cierra. */
export function BuscarClienteModal({
  onClose,
  onSelect,
  onNew,
}: {
  onClose: () => void;
  onSelect: (c: Cliente) => void;
  onNew: () => void;
}) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const dq = useDebounced(q, 150);
  const listRef = useRef<HTMLUListElement>(null);
  const { data } = useQuery({
    queryKey: ['clientes', 'buscar', dq],
    queryFn: () =>
      api<{ items: Cliente[] }>(`/clientes?soloActivos=true&q=${encodeURIComponent(dq)}`),
  });
  const items = data?.items ?? [];

  useEffect(() => setIdx(0), [dq]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[idx]) {
      e.preventDefault();
      onSelect(items[idx]);
    }
  };

  return (
    <Modal
      open
      width="max-w-2xl"
      title="Buscar cliente"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto flex items-center gap-2 text-xs text-tinta-600">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> moverse · <Kbd>Enter</Kbd> seleccionar · <Kbd>Esc</Kbd> cerrar
          </span>
          <Button variant="secondary" onClick={onNew}>
            Registrar cliente
          </Button>
        </>
      }
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        placeholder="Nombre, NIT, NRC o DUI"
        aria-label="Buscar cliente"
        className="mb-3 h-11 w-full rounded-control border border-borde px-3 text-base"
      />
      <ul
        ref={listRef}
        role="listbox"
        className="max-h-96 overflow-auto rounded-card border border-borde"
      >
        {items.map((c, i) => (
          <li
            key={c.id}
            data-idx={i}
            role="option"
            aria-selected={i === idx}
            onMouseEnter={() => setIdx(i)}
            onClick={() => onSelect(c)}
            className={cx(
              'flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5',
              i === idx && 'bg-sello-100',
            )}
          >
            <span>
              <span className="block text-sm">{c.razon_social}</span>
              <span className="num text-xs text-tinta-600">{docId(c)}</span>
            </span>
            <Chip tone={c.tipo_contribuyente === 'GRANDE' ? 'oscuro' : 'neutro'}>
              {TIPO_LABEL[c.tipo_contribuyente]}
            </Chip>
          </li>
        ))}
        {data && items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-tinta-600">Sin coincidencias.</li>
        )}
      </ul>
    </Modal>
  );
}
