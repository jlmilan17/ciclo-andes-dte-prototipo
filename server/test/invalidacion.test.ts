import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database.js';
import { app, bearer, login, resetDb, simModo, startSim } from './helpers.js';

let stopSim: () => Promise<void>;
let admin: string;
let cajero: string;
let seed: Awaited<ReturnType<typeof resetDb>>;
const stock = async (s: string) =>
  (await db.selectFrom('producto').select('stock').where('sku', '=', s).executeTakeFirstOrThrow())
    .stock;
const get = (id: string, t = admin) => request(app).get(`/api/dte/${id}`).set(bearer(t));
const invalidar = (id: string, body: object, t = admin) =>
  request(app).post(`/api/dte/${id}/invalidar`).set(bearer(t)).send(body);

beforeAll(async () => {
  stopSim = await startSim();
});
afterAll(async () => stopSim());
beforeEach(async () => {
  seed = await resetDb({ minimal: false });
  admin = await login('admin');
  cajero = await login('cajero');
  await simModo(admin, 'EN_LINEA');
});

describe('historial', () => {
  it('lista con filtros reales', async () => {
    const all = await request(app).get('/api/dte').set(bearer(cajero));
    expect(all.body.total).toBe(13);
    const inv = await request(app).get('/api/dte?estado=INVALIDADO').set(bearer(cajero));
    expect(inv.body.items).toHaveLength(1);
    const nce = await request(app).get('/api/dte?tipo=05').set(bearer(cajero));
    expect(nce.body.items[0].numero_control).toBe('DTE-05-M001P001-000000000000001');
    const q = await request(app).get('/api/dte?q=pedal sur').set(bearer(cajero));
    expect(q.body.items).toHaveLength(1);
  });

  it('el detalle trae bitácora, firma decodificable y NCE vinculadas', async () => {
    const d = await get(seed.dteIds.d8!);
    expect(d.body.notasCredito).toHaveLength(1);
    expect(d.body.eventos.map((e: { estado_destino: string }) => e.estado_destino)).toEqual([
      'BORRADOR',
      'FIRMADO',
      'TRANSMITIDO',
      'PROCESADO',
    ]);
    const f = await request(app).get(`/api/dte/${seed.dteIds.d8}/firma`).set(bearer(cajero));
    expect(f.body.header.alg).toBe('RS256');
    expect(f.body.payload.identificacion.numeroControl).toBe(d.body.numero_control);
  });
});

describe('invalidación', () => {
  it('DTE de hoy: invalida, sella el evento, revierte stock y queda INVALIDADO en el historial', async () => {
    const id = seed.dteIds.d12!;
    expect((await get(id)).body.invalidable.permitido).toBe(true);
    const [cas, luz] = [await stock('CAS-URB-0114'), await stock('LUZ-LED-0055')];
    const r = await invalidar(id, { motivo_id: 2 });
    expect(r.status).toBe(200);
    expect(r.body.sello).toMatch(/^[0-9A-Z]{40}$/);
    const d = await get(id);
    expect(d.body.estado).toBe('INVALIDADO');
    expect(d.body.invalidacion).toMatchObject({
      motivo: 'Rescindir la operación realizada',
      responsable: 'Daniela Reina',
    });
    expect(d.body.invalidacion.jws.split('.')).toHaveLength(3);
    expect(await stock('CAS-URB-0114')).toBe(cas + 1);
    expect(await stock('LUZ-LED-0055')).toBe(luz + 1);
    const h = await request(app).get('/api/dte?estado=INVALIDADO').set(bearer(cajero));
    expect(h.body.items.map((x: { id: string }) => x.id)).toContain(id);
    const a = await db
      .selectFrom('audit_log')
      .select('accion')
      .where('entidad_id', '=', id)
      .execute();
    expect(a.map((x) => x.accion)).toContain('DTE_INVALIDADO');
  });

  it('fuera de plazo: la UI recibe el motivo y el backend responde 409', async () => {
    const id = seed.dteIds.d11!;
    const d = await get(id);
    expect(d.body.invalidable.permitido).toBe(false);
    expect(d.body.invalidable.motivo).toMatch(/Fuera del plazo/);
    const r = await invalidar(id, { motivo_id: 1 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('FUERA_DE_PLAZO');
  });

  it('el Cajero recibe 403', async () => {
    expect((await invalidar(seed.dteIds.d12!, { motivo_id: 1 }, cajero)).status).toBe(403);
  });

  it('motivo "Otro" exige observaciones', async () => {
    const r = await invalidar(seed.dteIds.d12!, { motivo_id: 3 });
    expect(r.status).toBe(422);
    expect(r.body.field).toBe('observaciones');
  });

  it('sin conexión con el MH la invalidación se bloquea (ZG-10)', async () => {
    await simModo(admin, 'SIN_CONEXION');
    const r = await invalidar(seed.dteIds.d12!, { motivo_id: 1 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('MH_SIN_CONEXION');
    expect((await get(seed.dteIds.d12!)).body.estado).toBe('PROCESADO');
  });

  it('no se invalida dos veces', async () => {
    await invalidar(seed.dteIds.d13!, { motivo_id: 1 });
    expect((await invalidar(seed.dteIds.d13!, { motivo_id: 1 })).status).toBe(409);
  });
});

describe('DTE rechazado: corregir y reenviar', () => {
  it('emite un nuevo DTE que referencia al rechazado, sin mover inventario', async () => {
    const id = seed.dteIds.d6!;
    const luz = await stock('LUZ-LED-0055');
    const r = await request(app).post(`/api/dte/${id}/corregir`).set(bearer(cajero)).send({});
    expect(r.status).toBe(201);
    expect(r.body.dte.estado).toBe('PROCESADO');
    const nuevo = await get(r.body.dte.id);
    expect(nuevo.body.corrige_dte_id).toBe(id);
    expect(nuevo.body.codigo_generacion).not.toBe((await get(id)).body.codigo_generacion);
    expect((await get(id)).body.correccion.id).toBe(r.body.dte.id);
    expect(await stock('LUZ-LED-0055')).toBe(luz);
    expect(
      (await request(app).post(`/api/dte/${id}/corregir`).set(bearer(cajero)).send({})).status,
    ).toBe(409);
  });
});
