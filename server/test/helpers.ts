import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db/database.js';
import { DEMO_PASSWORD, USUARIOS } from '../db/seed/base.js';
import { seedAll } from '../db/seed/index.js';

export const app = createApp();

export async function resetDb(opts: { minimal?: boolean; dtes?: boolean } = { minimal: true }) {
  return seedAll(db, opts);
}

export async function login(who: keyof typeof USUARIOS = 'cajero'): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ correo: USUARIOS[who].correo, password: DEMO_PASSWORD });
  if (res.status !== 200)
    throw new Error(`login ${who} falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Levanta el simulador del MH real en el puerto de pruebas (MH_SIM_URL → 4199). */
export async function startSim() {
  const { createSimApp } = await import('../../mh-sim/src/app.js');
  const server = createSimApp().listen(4199);
  return () => new Promise<void>((r) => server.close(() => r()));
}

export async function simModo(
  token: string,
  modo: 'EN_LINEA' | 'SIN_CONEXION' | 'LENTA',
  latencia_ms?: number,
) {
  const r = await request(app)
    .post('/api/sim/estado')
    .set(bearer(token))
    .send({ modo, latencia_ms });
  if (r.status !== 200) throw new Error(`sim/estado ${r.status}`);
}
