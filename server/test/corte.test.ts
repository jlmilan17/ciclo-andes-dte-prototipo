import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, bearer, login, resetDb, simModo, startSim } from './helpers.js';

let stopSim: () => Promise<void>;
let cajero: string;
let admin: string;
let seed: Awaited<ReturnType<typeof resetDb>>;
const sku = (s: string) => seed.productoIdBySku[s]!;
const vender = (body: object, t = cajero) =>
  request(app).post('/api/ventas').set(bearer(t)).send(body);

beforeAll(async () => {
  stopSim = await startSim();
});
afterAll(async () => stopSim());
beforeEach(async () => {
  seed = await resetDb();
  cajero = await login('cajero');
  admin = await login('admin');
  await simModo(cajero, 'EN_LINEA');
  await request(app).post('/api/caja/abrir').set(bearer(cajero)).send({ fondo_inicial: 10000 });
});

describe('Corte Z', () => {
  it('totales reales por método, DTE por tipo, invalidados excluidos y diferencia de efectivo', async () => {
    const e = await vender({
      cliente_id: null,
      lineas: [{ producto_id: sku('CAM-MTB-0029'), cantidad: 2 }],
      metodo_pago: 'EFECTIVO',
      efectivo_recibido: 2000,
    });
    const t = await vender({
      cliente_id: null,
      lineas: [{ producto_id: sku('LUZ-LED-0055'), cantidad: 1 }],
      metodo_pago: 'TARJETA',
    });
    const x = await vender({
      cliente_id: seed.clienteIdByNombre['Rutas del Pacífico, S.A. de C.V.'],
      lineas: [{ producto_id: sku('BIC-URB-0260'), cantidad: 1 }],
      metodo_pago: 'TRANSFERENCIA',
    });
    const anulada = await vender({
      cliente_id: null,
      lineas: [{ producto_id: sku('CAS-URB-0114'), cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
    });
    expect(
      (
        await request(app)
          .post(`/api/dte/${anulada.body.dte.id}/invalidar`)
          .set(bearer(admin))
          .send({ motivo_id: 2 })
      ).status,
    ).toBe(200);

    const p = await request(app)
      .get('/api/caja/corte-z/preview?efectivo_contado=11000')
      .set(bearer(cajero));
    expect(p.status).toBe(200);
    expect(p.body.porMetodo.EFECTIVO).toEqual({ ventas: 1, monto: e.body.dte.total });
    expect(p.body.porMetodo.TARJETA).toEqual({ ventas: 1, monto: t.body.dte.total });
    expect(p.body.porMetodo.TRANSFERENCIA).toEqual({ ventas: 1, monto: x.body.dte.total });
    expect(p.body.totalVentas).toBe(e.body.dte.total + t.body.dte.total + x.body.dte.total);
    expect(p.body.dtePorTipo['01'].cantidad).toBe(2);
    expect(p.body.dtePorTipo['03'].cantidad).toBe(1);
    expect(p.body.invalidados).toMatchObject({ cantidad: 1, monto: anulada.body.dte.total });
    expect(p.body.efectivoEsperado).toBe(10000 + e.body.dte.total);
    expect(p.body.diferencia).toBe(11000 - (10000 + e.body.dte.total));
  });

  it('confirmar bloquea la terminal en el API; nueva apertura la habilita (regla 7)', async () => {
    await vender({
      cliente_id: null,
      lineas: [{ producto_id: sku('CAM-MTB-0029'), cantidad: 1 }],
      metodo_pago: 'TARJETA',
    });
    expect(
      (
        await request(app)
          .post('/api/caja/corte-z/confirmar')
          .set(bearer(admin))
          .send({ efectivo_contado: 10000 })
      ).status,
    ).toBe(403);
    const c = await request(app)
      .post('/api/caja/corte-z/confirmar')
      .set(bearer(cajero))
      .send({ efectivo_contado: 10000 });
    expect(c.status).toBe(201);
    expect(c.body.numero).toBe(1);
    const v = await vender({
      cliente_id: null,
      lineas: [{ producto_id: sku('CAM-MTB-0029'), cantidad: 1 }],
      metodo_pago: 'TARJETA',
    });
    expect(v.status).toBe(409);
    expect(v.body.code).toBe('CAJA_CERRADA');
    expect((await request(app).get('/api/caja/corte-z/preview').set(bearer(cajero))).status).toBe(
      409,
    );
    const pdf = await request(app)
      .get(`/api/caja/corte-z/${c.body.turnoId}/pdf`)
      .set(bearer(cajero))
      .buffer(true);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const guardado = await request(app)
      .get(`/api/caja/corte-z/${c.body.turnoId}`)
      .set(bearer(cajero));
    expect(guardado.body.numero).toBe(1);

    await request(app)
      .post('/api/caja/abrir')
      .set(bearer(cajero))
      .send({ fondo_inicial: 5000 })
      .expect(201);
    expect(
      (
        await vender({
          cliente_id: null,
          lineas: [{ producto_id: sku('CAM-MTB-0029'), cantidad: 1 }],
          metodo_pago: 'TARJETA',
        })
      ).status,
    ).toBe(201);
  });

  it('el corte de la Caja 01 no afecta a la Caja 02 (RNF-CAJ-02)', async () => {
    await request(app)
      .post('/api/caja/corte-z/confirmar')
      .set(bearer(cajero))
      .send({ efectivo_contado: 10000 })
      .expect(201);
    const marta = await login('cajeroPrueba');
    const est = await request(app).get('/api/caja/estado').set(bearer(marta));
    expect(est.body.caja.codigo).toBe('CAJA 02');
    await request(app)
      .post('/api/caja/abrir')
      .set(bearer(marta))
      .send({ fondo_inicial: 0 })
      .expect(201);
    const v = await vender(
      {
        cliente_id: null,
        lineas: [{ producto_id: sku('CAM-MTB-0029'), cantidad: 1 }],
        metodo_pago: 'TARJETA',
      },
      marta,
    );
    expect(v.status).toBe(201);
  });
});
