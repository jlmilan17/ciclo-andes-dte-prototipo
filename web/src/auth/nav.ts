import type { Rol } from './AuthContext';

export type NavItem = { to: string; label: string; roles: Rol[] };

/** Rail lateral (10.1): el Cajero ve 4 ítems, el Administrador 7. */
export const NAV: NavItem[] = [
  { to: '/resumen', label: 'Resumen', roles: ['ADMIN'] },
  { to: '/pos', label: 'Punto de venta', roles: ['CAJERO', 'ADMIN'] },
  { to: '/catalogo', label: 'Catálogo', roles: ['ADMIN'] },
  { to: '/clientes', label: 'Clientes', roles: ['CAJERO', 'ADMIN'] },
  { to: '/dte', label: 'Historial de DTE', roles: ['CAJERO', 'ADMIN'] },
  { to: '/contingencia', label: 'Contingencia', roles: ['CAJERO', 'ADMIN'] },
  { to: '/usuarios', label: 'Usuarios y roles', roles: ['ADMIN'] },
];

// Orden del rail del Cajero según 10.1
const CAJERO_ORDER = ['/pos', '/dte', '/clientes', '/contingencia'];

export function navFor(rol: Rol): NavItem[] {
  const items = NAV.filter((n) => n.roles.includes(rol));
  return rol === 'CAJERO' ? CAJERO_ORDER.map((p) => items.find((i) => i.to === p)!) : items;
}

export const MODULOS_POR_ROL: Record<Rol, string[]> = {
  CAJERO: navFor('CAJERO').map((n) => n.label),
  ADMIN: navFor('ADMIN').map((n) => n.label),
};
