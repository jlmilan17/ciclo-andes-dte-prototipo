import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  side?: boolean;
};

/** Modal o panel lateral: se cierra con X, Esc o clic en el fondo, sin tocar el estado del que lo abrió. */
export function Modal({ open, title, onClose, children, footer, width = 'max-w-lg', side }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-50 flex bg-tinta-900/40',
        side ? 'justify-end' : 'items-center justify-center p-6',
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'flex flex-col bg-superficie shadow-2xl',
          side ? 'h-full w-[480px]' : cx('max-h-[90vh] w-full rounded-card', width),
        )}
      >
        <header className="flex items-center justify-between border-b border-borde px-5 py-4">
          <h2 className="font-cond text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-control text-tinta-600 hover:bg-papel-50"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-borde px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
