import { NavLink } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { navFor } from '@/auth/nav';
import { cx } from '@/components/cx';
import { UserMenu } from './UserMenu';

export function Rail({ locked }: { locked?: boolean }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <aside className="flex w-[240px] shrink-0 flex-col bg-tinta-900 text-pizarra-400">
      <div className="flex h-16 items-center px-5">
        <span className="font-cond text-lg font-semibold text-white">Ciclo Andes</span>
        <span className="ml-2 text-xs">DTE</span>
      </div>
      <nav
        aria-label="Navegación principal"
        className="flex flex-1 flex-col gap-1 px-3"
        data-testid="rail"
      >
        {navFor(user.rol).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            aria-disabled={locked || undefined}
            onClick={(e) => locked && e.preventDefault()}
            className={({ isActive }) =>
              cx(
                'flex h-10 items-center rounded-control px-3 text-sm',
                isActive ? 'bg-sello-600 text-white' : 'hover:bg-white/5 hover:text-white',
                locked && 'pointer-events-none opacity-40',
              )
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <UserMenu />
    </aside>
  );
}
