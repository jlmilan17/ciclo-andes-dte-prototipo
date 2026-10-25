import { db } from '../db/database.js';
import { bus } from '../lib/bus.js';
import { pingMh } from './client.js';

/** Estado de conectividad con el MH observado por el API (no el modo del simulador). */
export const mhStatus = {
  online: true,
  modo: null as string | null,
  checkedAt: new Date().toISOString(),
};

type Listener = (online: boolean, prev: boolean) => void;
const listeners: Listener[] = [];
export const onConnectivityChange = (fn: Listener) => listeners.push(fn);

export function setOnline(online: boolean, modo: string | null = mhStatus.modo) {
  const prev = mhStatus.online;
  mhStatus.online = online;
  mhStatus.modo = modo;
  mhStatus.checkedAt = new Date().toISOString();
  bus.publish({ type: 'mh', online, modo, checkedAt: mhStatus.checkedAt });
  if (prev !== online) for (const l of listeners) l(online, prev);
}

export async function checkConnectivity(): Promise<boolean> {
  const ok = await pingMh();
  setOnline(ok);
  return ok;
}

export async function colaPendiente(): Promise<number> {
  const r = await db
    .selectFrom('dte')
    .select(db.fn.countAll<number>().as('n'))
    .where('estado', '=', 'ENCOLADO')
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

export async function publishCola() {
  bus.publish({ type: 'cola', pendientes: await colaPendiente() });
}
