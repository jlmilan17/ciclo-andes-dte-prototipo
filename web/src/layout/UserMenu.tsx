import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { usePublicConfig } from '@/pages/auth/Login';
import { useShell } from './shellContext';

/** PRT-SEG-04: menú idéntico en ambos roles; Cerrar turno solo para el Cajero con turno abierto. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const { turnoAbierto } = useShell();
  const cfg = usePublicConfig();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user) return null;
  const go = (to: string) => {
    setOpen(false);
    nav(to);
  };
  const item = 'block w-full px-4 py-2 text-left text-sm text-tinta-900 hover:bg-papel-50';

  return (
    <div ref={ref} className="relative border-t border-white/10 p-3">
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-card border border-borde bg-superficie py-1 shadow-xl"
        >
          <button role="menuitem" className={item} onClick={() => go('/perfil')}>
            Mi perfil
          </button>
          {cfg.data?.demoMode && (
            <button
              role="menuitem"
              className={item}
              onClick={async () => {
                setOpen(false);
                // Navegar antes de cerrar sesión: si no, el guard del shell redirige al login.
                nav('/demo/roles');
                await logout();
              }}
            >
              Cambiar de rol <span className="text-xs text-pizarra-400">(solo demo)</span>
            </button>
          )}
          {user.rol === 'CAJERO' && turnoAbierto && (
            <button role="menuitem" className={item} onClick={() => go('/caja/corte-z')}>
              Cerrar turno
            </button>
          )}
          <button
            role="menuitem"
            className={`${item} text-granate-600`}
            onClick={async () => {
              setOpen(false);
              await logout();
              nav('/login');
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-white/5"
        data-testid="user-menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sello-600 text-xs font-medium text-white">
          {user.nombre
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')}
        </span>
        <span className="flex flex-col">
          <span className="text-sm text-white">{user.nombre}</span>
          <span className="text-xs">{user.rol === 'ADMIN' ? 'Administrador' : 'Cajero'}</span>
        </span>
      </button>
    </div>
  );
}
