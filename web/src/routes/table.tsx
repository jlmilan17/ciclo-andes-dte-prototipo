import type { ReactNode } from 'react';
import type { Rol } from '@/auth/AuthContext';
import { Catalogo } from '@/pages/catalogo/Catalogo';
import { ClienteFicha } from '@/pages/clientes/ClienteFicha';
import { Clientes } from '@/pages/clientes/Clientes';
import { Placeholder } from '@/pages/Placeholder';
import { AperturaCaja } from '@/pages/caja/AperturaCaja';
import { CajaCerrada } from '@/pages/caja/CajaCerrada';
import { CorteZ } from '@/pages/caja/CorteZ';
import { Contingencia } from '@/pages/contingencia/Contingencia';
import { Correos } from '@/pages/correos/Correos';
import { DteDetalle } from '@/pages/dte/DteDetalle';
import { Historial } from '@/pages/dte/Historial';
import { NotaCredito } from '@/pages/dte/NotaCredito';
import { Pos } from '@/pages/pos/Pos';
import { VentaResultado } from '@/pages/pos/VentaResultado';
import { AcercaSimulacion } from '@/pages/sim/AcercaSimulacion';
import { ConsolaMh } from '@/pages/sim/ConsolaMh';

const ADMIN: Rol[] = ['ADMIN'];
const ALL: Rol[] = ['CAJERO', 'ADMIN'];

export type AppRoute = { path: string; roles: Rol[]; element: ReactNode };

/** Rutas protegidas del shell con los roles que las pueden ver (RF-SEG-02). */
export const ROUTES: AppRoute[] = [
  { path: '/resumen', roles: ADMIN, element: <Placeholder title="Resumen" /> },
  { path: '/pos', roles: ALL, element: <Pos /> },
  { path: '/pos/venta/:id', roles: ALL, element: <VentaResultado /> },
  { path: '/caja/apertura', roles: ALL, element: <AperturaCaja /> },
  { path: '/caja/corte-z', roles: ALL, element: <CorteZ /> },
  { path: '/caja/cerrada', roles: ALL, element: <CajaCerrada /> },
  { path: '/correos', roles: ALL, element: <Correos /> },
  { path: '/catalogo', roles: ADMIN, element: <Catalogo /> },
  { path: '/clientes', roles: ALL, element: <Clientes /> },
  { path: '/clientes/:id', roles: ALL, element: <ClienteFicha /> },
  { path: '/dte', roles: ALL, element: <Historial /> },
  { path: '/dte/:id', roles: ALL, element: <DteDetalle /> },
  { path: '/dte/:id/nce', roles: ADMIN, element: <NotaCredito /> },
  { path: '/nce', roles: ADMIN, element: <NotaCredito /> },
  { path: '/contingencia', roles: ALL, element: <Contingencia /> },
  { path: '/usuarios', roles: ADMIN, element: <Placeholder title="Usuarios y roles" /> },
  { path: '/consola-mh', roles: ALL, element: <ConsolaMh /> },
  { path: '/acerca-simulacion', roles: ALL, element: <AcercaSimulacion /> },
];
