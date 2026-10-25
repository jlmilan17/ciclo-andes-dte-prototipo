import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSimApp } from '../../mh-sim/src/app.js';
import { db } from '../db/database.js';
import { callMh } from '../mh/client.js';
import { mhStatus } from '../mh/status.js';
import { app, bearer, login, resetDb } from './helpers.js';

// El simulador corre como servicio HTTP real (MH_SIM_URL apunta al puerto 4199 en pruebas).
let sim: Server;
let cajero: string;

beforeAll(async () => {
  await resetDb();
  sim = createSimApp().listen(4199);
  cajero = await login('cajero');
});
afterAll(() => sim.close());

describe('panel de simulación', () => {
  it('requiere autenticación', async () => {
    expect((await request(app).get('/api/sim/estado')).status).toBe(401);
  });

  it('el interruptor cambia el modo y el monitor detecta la caída y el regreso', async () => {
    const off = await request(app)
      .post('/api/sim/estado')
      .set(bearer(cajero))
      .send({ modo: 'SIN_CONEXION' });
    expect(off.status).toBe(200);
    expect(off.body.sim.modo).toBe('SIN_CONEXION');
    expect(mhStatus.online).toBe(false);
    const on = await request(app)
      .post('/api/sim/estado')
      .set(bearer(cajero))
      .send({ modo: 'EN_LINEA' });
    expect(on.body.mh.online).toBe(true);
  });

  it('cada intercambio queda en la consola del MH', async () => {
    const r = await callMh('/recepcion', { tipoDte: '01', codigoGeneracion: 'X' });
    expect(r.kind).toBe('rechazo');
    const c = await request(app).get('/api/sim/consola').set(bearer(cajero));
    expect(c.body.items[0]).toMatchObject({ endpoint: '/recepcion', resultado: 'RECHAZO' });
    const det = await request(app)
      .get(`/api/sim/consola/${c.body.items[0].id}`)
      .set(bearer(cajero));
    expect(det.body.response.codigoMsg).toBe('RCH-002');
  });

  it('sin conexión, la llamada se clasifica como SIN_CONEXION', async () => {
    await request(app).post('/api/sim/estado').set(bearer(cajero)).send({ modo: 'SIN_CONEXION' });
    const r = await callMh('/recepcion', {});
    expect(r.kind).toBe('sin_conexion');
    await request(app).post('/api/sim/estado').set(bearer(cajero)).send({ modo: 'EN_LINEA' });
  });

  it('modo lento por encima de 3 s se clasifica como TIMEOUT', async () => {
    await request(app)
      .post('/api/sim/estado')
      .set(bearer(cajero))
      .send({ modo: 'LENTA', latencia_ms: 600 });
    const r = await callMh('/recepcion', {}, { timeoutMs: 300 });
    expect(r.kind).toBe('timeout');
    await request(app).post('/api/sim/estado').set(bearer(cajero)).send({ modo: 'EN_LINEA' });
  });

  it('expirar sesión invalida el token vigente', async () => {
    const t = await login('admin');
    await request(app).post('/api/sim/expirar-sesion').set(bearer(t)).expect(200);
    const r = await request(app).get('/api/auth/me').set(bearer(t));
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('SESION_EXPIRADA');
    const n = await db
      .selectFrom('audit_log')
      .select('accion')
      .where('accion', '=', 'SIM_EXPIRAR_SESION')
      .execute();
    expect(n).toHaveLength(1);
  });
});
