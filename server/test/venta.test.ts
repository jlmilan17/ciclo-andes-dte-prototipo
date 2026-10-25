import { compactVerify, importSPKI } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database.js';
import { dteSchema } from '../dte/schemas/dte.schema.js';
import { MSG_NRC_INVALIDO } from '../lib/padron.js';
import { app, bearer, login, resetDb, simModo, startSim } from './helpers.js';

let stopSim: () => Promise<void>;
let cajero: string;
let seed: Awaited<ReturnType<typeof resetDb>>;
const sku = (s: string) => seed.productoIdBySku[s]!;
const stock = async (s: string) =>
  (await db.selectFrom('producto').select('stock').where('sku', '=', s).executeTakeFirstOrThrow())
    .stock;
const count = async (t: string) =>
  Number((await db.selectFrom(t).select(db.fn.countAll().as('n')).executeTakeFirstOrThrow()).n);

const canonica = () => ({
  cliente_id: seed.clienteIdByNombre['Rutas del Pacífico, S.A. de C.V.'],
  lineas: [
    { producto_id: sku('BIC-URB-0260'), cantidad: 2 },
    { producto_id: sku('CAS-URB-0114'), cantidad: 2 },
    { producto_id: sku('LUZ-LED-0055'), cantidad: 2 },
  ],
  metodo_pago: 'TRANSFERENCIA',
});
const vender = (body: object, t = cajero) =>
  request(app).post('/api/ventas').set(bearer(t)).send(body);

beforeAll(async () => {
  stopSim = await startSim();
});
afterAll(async () => stopSim());

beforeEach(async () => {
  seed = await resetDb();
  cajero = await login('cajero');
  await simModo(cajero, 'EN_LINEA');
});

describe('apertura de caja', () => {
  it('sin turno abierto el backend rechaza la venta (regla 7)', async () => {
    const r = await vender(canonica());
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CAJA_CERRADA');
  });
  it('abre el turno una sola vez', async () => {
    expect(
      (
        await request(app)
          .post('/api/caja/abrir')
          .set(bearer(cajero))
          .send({ fondo_inicial: 10000 })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post('/api/caja/abrir')
          .set(bearer(cajero))
          .send({ fondo_inicial: 10000 })
      ).status,
    ).toBe(409);
    const e = await request(app).get('/api/caja/estado').set(bearer(cajero));
    expect(e.body).toMatchObject({ caja: { codigo: 'CAJA 01' }, turno: { fondo_inicial: 10000 } });
  });
});

describe('emisión con MH en línea', () => {
  beforeEach(async () => {
    await request(app).post('/api/caja/abrir').set(bearer(cajero)).send({ fondo_inicial: 10000 });
  });

  it('venta canónica: CCFE $647.36, PROCESADO con sello, stock descontado y JSON firmado válido', async () => {
    const r = await vender(canonica());
    expect(r.status).toBe(201);
    expect(r.body.dte).toMatchObject({
      estado: 'PROCESADO',
      gravado: 57800,
      iva: 7514,
      retencion: 578,
      total: 64736,
    });
    expect(r.body.dte.numeroControl).toMatch(/^DTE-03-M001P001-\d{15}$/);
    expect(r.body.pasos.map((p: { paso: string }) => p.paso)).toEqual([
      'json',
      'firma',
      'transmision',
    ]);
    expect(r.body.pipelineMs).toBeLessThan(3000);

    expect(await stock('BIC-URB-0260')).toBe(16);
    expect(await stock('CAS-URB-0114')).toBe(24);

    const d = await request(app).get(`/api/dte/${r.body.dte.id}`).set(bearer(cajero));
    expect(d.body.sello_recepcion).toMatch(/^[0-9A-Z]{40}$/);
    expect(d.body.eventos.map((e: { estado_destino: string }) => e.estado_destino)).toEqual([
      'BORRADOR',
      'FIRMADO',
      'TRANSMITIDO',
      'PROCESADO',
    ]);

    const json = (await request(app).get(`/api/dte/${r.body.dte.id}/json`).set(bearer(cajero)))
      .body;
    expect(dteSchema.safeParse(json).success).toBe(true);
    expect(json.resumen).toMatchObject({ totalGravada: 578, ivaRete1: 5.78, totalPagar: 647.36 });
    expect(json.resumen.tributos[0].valor).toBe(75.14);

    const row = await db
      .selectFrom('dte')
      .select('jws')
      .where('id', '=', r.body.dte.id)
      .executeTakeFirstOrThrow();
    const pub = await db
      .selectFrom('config')
      .select('valor')
      .where('clave', '=', 'CERT_PUBLIC_KEY')
      .executeTakeFirstOrThrow();
    const { payload } = await compactVerify(row.jws, await importSPKI(pub.valor, 'RS256'));
    expect(JSON.parse(new TextDecoder().decode(payload)).identificacion.codigoGeneracion).toBe(
      r.body.dte.codigoGeneracion,
    );

    const movs = await db
      .selectFrom('movimiento_inventario')
      .selectAll()
      .where('referencia_dte_id', '=', r.body.dte.id)
      .execute();
    expect(movs).toHaveLength(3);
    expect(movs.every((m) => m.tipo === 'VENTA' && m.cantidad === -2)).toBe(true);
  });

  it('consumidor final → FCFE (01) sin retención; efectivo con vuelto', async () => {
    const r = await vender({
      ...canonica(),
      cliente_id: null,
      metodo_pago: 'EFECTIVO',
      efectivo_recibido: 70000,
    });
    expect(r.body.dte).toMatchObject({ estado: 'PROCESADO', retencion: 0, total: 57800 + 7514 });
    expect(r.body.vuelto).toBe(70000 - 65314);
    expect(r.body.dte.numeroControl).toMatch(/^DTE-01-/);
  });

  it('contribuyente normal → CCFE sin retención; puede elegir FCFE en el cobro', async () => {
    const normal = { ...canonica(), cliente_id: seed.clienteIdByNombre['Taller Bici Norte'] };
    expect((await vender(normal)).body.dte).toMatchObject({ retencion: 0, total: 65314 });
    const comoFcfe = await vender({ ...normal, tipo: '01' });
    expect(comoFcfe.body.dte.numeroControl).toMatch(/^DTE-01-/);
  });

  it('efectivo insuficiente → 422', async () => {
    const r = await vender({ ...canonica(), metodo_pago: 'EFECTIVO', efectivo_recibido: 100 });
    expect(r.status).toBe(422);
  });

  it('NRC fuera del padrón bloquea el CCFE sin dejar rastro (regla 5)', async () => {
    const c = await db
      .insertInto('cliente')
      .values({
        razon_social: 'Empresa Fantasma',
        nit: '0614-010101-101-1',
        nrc: '999999-9',
        giro: 'X',
        tipo_contribuyente: 'NORMAL',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const antes = await count('dte');
    const r = await vender({ ...canonica(), cliente_id: c.id });
    expect(r.status).toBe(422);
    expect(r.body.message).toBe(MSG_NRC_INVALIDO);
    expect(await count('dte')).toBe(antes);
    expect(await stock('BIC-URB-0260')).toBe(18);
  });

  it('cantidad mayor al stock: 409 y rollback completo (regla 4)', async () => {
    const r = await vender({
      ...canonica(),
      lineas: [{ producto_id: sku('BIC-RUT-0700'), cantidad: 5 }],
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('STOCK_INSUFICIENTE');
    expect(await count('venta')).toBe(0);
    expect(await count('dte')).toBe(0);
    expect(await stock('BIC-RUT-0700')).toBe(4);
  });

  it('dos ventas concurrentes por la última unidad: solo una se confirma', async () => {
    const body = {
      ...canonica(),
      cliente_id: null,
      lineas: [{ producto_id: sku('BIC-RUT-0700'), cantidad: 3 }],
    };
    const rs = await Promise.all([vender(body), vender(body)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stock('BIC-RUT-0700')).toBe(1);
  });

  it('un servicio no descuenta stock (PRT-POS-08)', async () => {
    const r = await vender({
      ...canonica(),
      cliente_id: null,
      lineas: [{ producto_id: sku('SER-MAN-0001'), cantidad: 1 }],
    });
    expect(r.status).toBe(201);
    expect(
      await db
        .selectFrom('movimiento_inventario')
        .selectAll()
        .where('referencia_dte_id', '=', r.body.dte.id)
        .execute(),
    ).toHaveLength(0);
  });

  it('rechazo del MH deja el DTE RECHAZADO con la respuesta', async () => {
    await request(app)
      .post('/api/sim/rechazar-proximo')
      .set(bearer(cajero))
      .send({ codigo: 'RCH-007' });
    const r = await vender(canonica());
    expect(r.body.dte.estado).toBe('RECHAZADO');
    const d = await request(app).get(`/api/dte/${r.body.dte.id}`).set(bearer(cajero));
    expect(d.body.respuesta_mh.codigoMsg).toBe('RCH-007');
  });

  it('PDF, ticket, JSON y correo simulado', async () => {
    const r = await vender(canonica());
    const pdf = await request(app)
      .get(`/api/dte/${r.body.dte.id}/pdf`)
      .set(bearer(cajero))
      .buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    const t = await request(app)
      .get(`/api/dte/${r.body.dte.id}/ticket.pdf?token=${cajero}`)
      .buffer(true);
    expect(t.status).toBe(200);
    const mail = await request(app)
      .post(`/api/dte/${r.body.dte.id}/enviar-correo`)
      .set(bearer(cajero))
      .send({ destinatario: 'compras@rutaspacifico.test' });
    expect(mail.status).toBe(201);
    const bandeja = await request(app).get('/api/correos').set(bearer(cajero));
    expect(bandeja.body.items[0].adjuntos).toHaveLength(2);
  });
});

describe('contingencia en la emisión (regla 6)', () => {
  beforeEach(async () => {
    await request(app).post('/api/caja/abrir').set(bearer(cajero)).send({ fondo_inicial: 10000 });
  });

  it('MH caído: la venta se cierra, el DTE queda FIRMADO → ENCOLADO y el stock se descuenta', async () => {
    await simModo(cajero, 'SIN_CONEXION');
    const t0 = Date.now();
    const r = await vender(canonica());
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.status).toBe(201);
    expect(r.body.dte.estado).toBe('ENCOLADO');
    expect(await stock('BIC-URB-0260')).toBe(16);
    const ev = await db
      .selectFrom('dte_event')
      .select('estado_destino')
      .where('dte_id', '=', r.body.dte.id)
      .orderBy('id')
      .execute();
    expect(ev.map((e) => e.estado_destino)).toEqual(['BORRADOR', 'FIRMADO', 'ENCOLADO']);
    const estado = await request(app).get('/api/sim/estado').set(bearer(cajero));
    expect(estado.body.pendientes).toBe(1);
  });

  it('MH lento (> 3 s): timeout y el DTE pasa a ENCOLADO (ZG-15)', async () => {
    await simModo(cajero, 'LENTA', 4500);
    const r = await vender(canonica());
    expect(r.body.dte.estado).toBe('ENCOLADO');
    expect(r.body.pipelineMs).toBeLessThan(3600);
    await simModo(cajero, 'EN_LINEA');
  });
});
