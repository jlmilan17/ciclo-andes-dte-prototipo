import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database.js';
import { transmitirCola } from '../worker/contingency.js';
import { app, bearer, login, resetDb, simModo, startSim } from './helpers.js';

let stopSim: () => Promise<void>;
let admin: string;
let cajero: string;
let seed: Awaited<ReturnType<typeof resetDb>>;
type Linea = { id: string; codigo: string; cantidad: number; devuelto: number };
const stock = async (s: string) =>
  (await db.selectFrom('producto').select('stock').where('sku', '=', s).executeTakeFirstOrThrow())
    .stock;
const original = async (q: string) =>
  request(app)
    .get(`/api/nce/original?q=${encodeURIComponent(q)}`)
    .set(bearer(admin));
const emitir = (
  original_id: string,
  lineas: Array<{ linea_id: string; cantidad: number }>,
  t = admin,
) => request(app).post('/api/dte/nce').set(bearer(t)).send({ original_id, lineas });

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

async function d8() {
  const d = await db
    .selectFrom('dte')
    .select(['codigo_generacion', 'numero_control'])
    .where('id', '=', seed.dteIds.d8!)
    .executeTakeFirstOrThrow();
  const r = await original(d.codigo_generacion);
  return {
    ...d,
    body: r.body as {
      id: string;
      total: number;
      acumulado: number;
      disponible: number;
      lineas: Linea[];
    },
  };
}

describe('nota de crédito', () => {
  it('busca el original por codigoGeneracion o numeroControl y conoce lo ya devuelto', async () => {
    const o = await d8();
    expect(o.body.lineas.find((l) => l.codigo === 'CAS-URB-0114')!.devuelto).toBe(1);
    expect(o.body.disponible).toBe(o.body.total - o.body.acumulado);
    expect((await original(o.numero_control)).body.id).toBe(o.body.id);
  });

  it('NCE parcial: impuestos proporcionales, stock reintegrado, PROCESADA y referenciada', async () => {
    const o = await d8();
    const bici = o.body.lineas.find((l) => l.codigo === 'BIC-MTB-0290')!;
    const antes = await stock('BIC-MTB-0290');
    const r = await emitir(o.body.id, [{ linea_id: bici.id, cantidad: 1 }]);
    expect(r.status).toBe(201);
    // 1 × 415.00 sobre gravado 970.00 (iva 126.10, retención 9.70)
    expect(r.body.dte).toMatchObject({
      estado: 'PROCESADO',
      gravado: 41500,
      iva: 5395,
      retencion: 415,
      total: 41500 + 5395 - 415,
    });
    expect(r.body.dte.numeroControl).toMatch(/^DTE-05-/);
    expect(await stock('BIC-MTB-0290')).toBe(antes + 1);
    const det = await request(app).get(`/api/dte/${r.body.dte.id}`).set(bearer(admin));
    expect(det.body.referenced_dte_id).toBe(o.body.id);
    expect(det.body.ref_codigo_generacion).toBe(o.codigo_generacion);
    const json = (await request(app).get(`/api/dte/${r.body.dte.id}/json`).set(bearer(admin))).body;
    expect(json.documentoRelacionado[0].numeroDocumento).toBe(o.codigo_generacion);
    const mov = await db
      .selectFrom('movimiento_inventario')
      .selectAll()
      .where('referencia_dte_id', '=', r.body.dte.id)
      .execute();
    expect(mov[0]).toMatchObject({ tipo: 'DEVOLUCION', cantidad: 1 });
  });

  it('tope: no se devuelve más de lo vendido ni más que el total original acumulado', async () => {
    const o = await d8();
    const casco = o.body.lineas.find((l) => l.codigo === 'CAS-URB-0114')!;
    const r = await emitir(o.body.id, [{ linea_id: casco.id, cantidad: 2 }]);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('NCE_CANTIDAD_EXCEDIDA');
    // Devolver todo lo restante y luego intentar otra vez.
    const resto = o.body.lineas.map((l) => ({ linea_id: l.id, cantidad: l.cantidad - l.devuelto }));
    expect((await emitir(o.body.id, resto)).status).toBe(201);
    const otra = await emitir(o.body.id, [{ linea_id: casco.id, cantidad: 1 }]);
    expect(otra.status).toBe(422);
    const final = await d8();
    expect(final.body.acumulado).toBe(final.body.total);
  });

  it('solo sobre CCFE PROCESADO', async () => {
    const rech = await db
      .selectFrom('dte')
      .select('codigo_generacion')
      .where('id', '=', seed.dteIds.d6!)
      .executeTakeFirstOrThrow();
    expect((await original(rech.codigo_generacion)).body.code).toBe('NCE_ORIGINAL_NO_PROCESADO');
    const fcfe = await db
      .selectFrom('dte')
      .select('codigo_generacion')
      .where('id', '=', seed.dteIds.d1!)
      .executeTakeFirstOrThrow();
    expect((await original(fcfe.codigo_generacion)).body.code).toBe('NCE_SOLO_CCFE');
  });

  it('el Cajero recibe 403', async () => {
    const o = await d8();
    expect(
      (await emitir(o.body.id, [{ linea_id: o.body.lineas[0]!.id, cantidad: 1 }], cajero)).status,
    ).toBe(403);
    expect((await request(app).get('/api/nce/original?q=x').set(bearer(cajero))).status).toBe(403);
  });

  it('con el MH caído la NCE se encola y luego se sella en el lote (RNF-NCE-02)', async () => {
    const o = await d8();
    await simModo(admin, 'SIN_CONEXION');
    const r = await emitir(o.body.id, [{ linea_id: o.body.lineas[0]!.id, cantidad: 1 }]);
    expect(r.body.dte.estado).toBe('ENCOLADO');
    await simModo(admin, 'EN_LINEA');
    await transmitirCola('WORKER');
    const det = await request(app).get(`/api/dte/${r.body.dte.id}`).set(bearer(admin));
    expect(det.body.estado).toBe('PROCESADO');
  });
});
