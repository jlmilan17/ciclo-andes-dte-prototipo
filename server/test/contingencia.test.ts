import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { db } from '../db/database.js';
import { colaPendiente } from '../mh/status.js';
import { transmitirCola, transmitirLote } from '../worker/contingency.js';
import { app, bearer, login, resetDb, simModo, startSim } from './helpers.js';

let stopSim: () => Promise<void>;
let cajero: string;
let admin: string;
let seed: Awaited<ReturnType<typeof resetDb>>;

const venta = (i: number) => ({
  cliente_id: null,
  lineas: [
    {
      producto_id: seed.productoIdBySku[['CAM-MTB-0029', 'LUZ-LED-0055', 'CAS-URB-0114'][i % 3]!],
      cantidad: 1,
    },
  ],
  metodo_pago: 'TARJETA',
});
async function encolar(n: number) {
  await simModo(cajero, 'SIN_CONEXION');
  for (let i = 0; i < n; i++) {
    const r = await request(app).post('/api/ventas').set(bearer(cajero)).send(venta(i));
    expect(r.body.dte.estado).toBe('ENCOLADO');
  }
}

beforeAll(async () => {
  stopSim = await startSim();
});
afterAll(async () => {
  config.BATCH_MAX_DOCUMENTS = 100;
  await stopSim();
});
beforeEach(async () => {
  config.BATCH_MAX_DOCUMENTS = 100;
  seed = await resetDb();
  cajero = await login('cajero');
  admin = await login('admin');
  await simModo(cajero, 'EN_LINEA');
  await request(app).post('/api/caja/abrir').set(bearer(cajero)).send({ fondo_inicial: 0 });
});

describe('cola y lote de contingencia', () => {
  it('F3: tres ventas encoladas → contador 3 → al volver la conexión el lote las sella → contador 0', async () => {
    await encolar(3);
    const b = await request(app).get('/api/contingencia').set(bearer(cajero));
    expect(b.body.pendientes).toBe(3);
    expect(b.body.cola).toHaveLength(3);

    await simModo(cajero, 'EN_LINEA');
    const lotes = await transmitirCola('WORKER');
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toMatchObject({ documentos: 3, procesados: 3, rechazados: 0 });
    expect(await colaPendiente()).toBe(0);

    const dtes = await db
      .selectFrom('dte')
      .select(['estado', 'sello_recepcion', 'lote_id'])
      .execute();
    expect(
      dtes.every(
        (d) => d.estado === 'PROCESADO' && d.sello_recepcion && d.lote_id === lotes[0]!.loteId,
      ),
    ).toBe(true);

    const det = await request(app)
      .get(`/api/contingencia/lotes/${lotes[0]!.loteId}`)
      .set(bearer(cajero));
    expect(det.body.json.documentos).toHaveLength(3);
    expect(det.body.respuesta.procesados).toHaveLength(3);

    const ev = await db
      .selectFrom('dte_event')
      .select('estado_destino')
      .where('dte_id', '=', (await db.selectFrom('dte').select('id').executeTakeFirstOrThrow()).id)
      .orderBy('id')
      .execute();
    expect(ev.map((e) => e.estado_destino)).toEqual([
      'BORRADOR',
      'FIRMADO',
      'ENCOLADO',
      'TRANSMITIDO',
      'PROCESADO',
    ]);
  });

  it('la cola se parte según BATCH_MAX_DOCUMENTS (ZG-08)', async () => {
    await encolar(5);
    await simModo(cajero, 'EN_LINEA');
    config.BATCH_MAX_DOCUMENTS = 2;
    const lotes = await transmitirCola('WORKER');
    expect(lotes.map((l) => l.documentos)).toEqual([2, 2, 1]);
    expect(await colaPendiente()).toBe(0);
  });

  it('respuesta por documento: un rechazo parcial no afecta a los demás', async () => {
    await encolar(3);
    await simModo(cajero, 'EN_LINEA');
    await request(app)
      .post('/api/sim/rechazar-proximo')
      .set(bearer(cajero))
      .send({ codigo: 'RCH-007' });
    const [l] = await transmitirCola('WORKER');
    expect(l).toMatchObject({ procesados: 2, rechazados: 1 });
  });

  it('FOR UPDATE SKIP LOCKED: dos ciclos concurrentes nunca envían el mismo DTE', async () => {
    await encolar(4);
    await simModo(cajero, 'EN_LINEA');
    config.BATCH_MAX_DOCUMENTS = 2;
    const [a, b] = await Promise.all([transmitirLote('WORKER'), transmitirLote('WORKER')]);
    expect(a && b).toBeTruthy();
    const porLote = await db.selectFrom('dte').select(['lote_id']).execute();
    const conteo = porLote.reduce<Record<string, number>>(
      (acc, d) => ({ ...acc, [d.lote_id]: (acc[d.lote_id] ?? 0) + 1 }),
      {},
    );
    expect(Object.values(conteo).sort()).toEqual([2, 2]);
    const enviados = await db
      .selectFrom('mh_exchange')
      .select('request')
      .where('endpoint', '=', '/recepcionlote')
      .execute();
    const codigos = enviados.flatMap((x) =>
      (x.request as { documentos: Array<{ codigoGeneracion: string }> }).documentos.map(
        (d) => d.codigoGeneracion,
      ),
    );
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('si el MH vuelve a caer durante el envío, los DTE regresan a la cola', async () => {
    await encolar(2);
    const [l] = await transmitirCola('WORKER');
    expect(l!.fallido).toBe(true);
    expect(await colaPendiente()).toBe(2);
  });

  it('acciones de contingencia: Cajero 403, Administrador transmite', async () => {
    await encolar(2);
    expect(
      (await request(app).post('/api/contingencia/transmitir').set(bearer(cajero))).status,
    ).toBe(403);
    expect(
      (await request(app).post('/api/contingencia/probar-conexion').set(bearer(cajero))).status,
    ).toBe(403);
    await simModo(cajero, 'EN_LINEA');
    const r = await request(app).post('/api/contingencia/transmitir').set(bearer(admin));
    expect(r.body).toMatchObject({ online: true, pendientes: 0 });
  });
});

describe('ventas de demostración', () => {
  it('carga ventas reales del turno por el pipeline', async () => {
    const r = await request(app)
      .post('/api/sim/cargar-ventas')
      .set(bearer(cajero))
      .send({ cantidad: 4 });
    expect(r.status).toBe(200);
    expect(r.body.ventas).toHaveLength(4);
    expect(r.body.ventas.every((v: { estado: string }) => v.estado === 'PROCESADO')).toBe(true);
  });
});
