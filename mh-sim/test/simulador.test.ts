import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signJson } from '../../server/dte/signer.js';
import { createSimApp } from '../src/app.js';
import { simDb } from '../src/db.js';
import { credenciales, dte, envio, seed, uuid } from './fixtures.js';

const app = createSimApp();
let auth: string;

async function token() {
  const r = await request(app).post('/mh-sim/auth').send(credenciales);
  return r.body.body.token as string;
}
const recepcion = async (body: object) =>
  request(app).post('/mh-sim/recepcion').set('authorization', auth).send(body);

beforeAll(async () => {
  await seed();
  auth = await token();
});
beforeEach(async () => {
  await request(app).post('/mh-sim/admin/estado').send({ modo: 'EN_LINEA' });
  await request(app).post('/mh-sim/admin/rechazar-proximo').send({ codigo: null });
});

describe('recepción de DTE', () => {
  it('sin token responde 401', async () => {
    expect((await request(app).post('/mh-sim/recepcion').send({})).status).toBe(401);
  });

  it('acepta un DTE válido y devuelve selloRecepcion en mayúsculas', async () => {
    const r = await recepcion(await envio(dte('03')));
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('PROCESADO');
    expect(r.body.selloRecibido).toMatch(/^[0-9A-Z]{40}$/);
  });

  it('firma inválida → RCH-001', async () => {
    const e = await envio(dte('03'));
    const [h, p, s] = e.documento.split('.');
    const tampered = JSON.parse(Buffer.from(p!, 'base64url').toString());
    tampered.resumen.totalPagar = 1;
    const r = await recepcion({
      ...e,
      documento: `${h}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${s}`,
    });
    expect(r.body).toMatchObject({ estado: 'RECHAZADO', codigoMsg: 'RCH-001' });
  });

  it('JSON que no cumple el esquema → RCH-002 con campo señalado', async () => {
    const d = dte('03');
    const bad = { ...d, cuerpoDocumento: [] };
    const r = await recepcion({
      tipoDte: '03',
      codigoGeneracion: d.identificacion.codigoGeneracion,
      documento: await signJson(bad),
    });
    expect(r.body).toMatchObject({ codigoMsg: 'RCH-002', campo: 'cuerpoDocumento' });
  });

  it('codigoGeneracion duplicado con otro contenido → RCH-003; reenvío idéntico es idempotente', async () => {
    const d = dte('03');
    const e = await envio(d);
    const r1 = await recepcion(e);
    const r2 = await recepcion(e);
    expect(r2.body.selloRecibido).toBe(r1.body.selloRecibido);
    const otro = { ...d, identificacion: { ...d.identificacion, horEmi: '00:00:01' } };
    const r3 = await recepcion({ ...e, documento: await signJson(otro) });
    expect(r3.body.codigoMsg).toBe('RCH-003');
  });

  it('NRC fuera del padrón → RCH-004', async () => {
    const r = await recepcion(await envio(dte('03', { nrc: '999999-9' })));
    expect(r.body).toMatchObject({ codigoMsg: 'RCH-004', campo: 'receptor.nrc' });
  });

  it('NCE sobre un DTE no sellado → RCH-005; sobre uno sellado → PROCESADO', async () => {
    const r = await recepcion(await envio(dte('05', { ref: uuid() })));
    expect(r.body.codigoMsg).toBe('RCH-005');
    const orig = dte('03');
    await recepcion(await envio(orig));
    const ok = await recepcion(
      await envio(dte('05', { ref: orig.identificacion.codigoGeneracion })),
    );
    expect(ok.body.estado).toBe('PROCESADO');
  });

  it('rechazo forzado desde el panel aplica a un solo documento', async () => {
    await request(app).post('/mh-sim/admin/rechazar-proximo').send({ codigo: 'RCH-007' });
    expect((await recepcion(await envio(dte('01')))).body.codigoMsg).toBe('RCH-007');
    expect((await recepcion(await envio(dte('01')))).body.estado).toBe('PROCESADO');
  });
});

describe('lote', () => {
  it('responde por documento con rechazos parciales', async () => {
    const docs = [
      await envio(dte('03')),
      await envio(dte('03', { nrc: '999999-9' })),
      await envio(dte('01')),
    ];
    const r = await request(app)
      .post('/mh-sim/recepcionlote')
      .set('authorization', auth)
      .send({ idEnvio: uuid(), documentos: docs });
    expect(r.body.procesados).toHaveLength(2);
    expect(r.body.rechazados).toHaveLength(1);
    expect(r.body.rechazados[0].codigoMsg).toBe('RCH-004');
  });
});

describe('invalidación', () => {
  const evento = (doc: ReturnType<typeof dte>, sello: string) => ({
    identificacion: {
      version: 2,
      ambiente: '00',
      codigoGeneracion: uuid(),
      fecAnula: '2026-10-24',
      horAnula: '10:00:00',
    },
    emisor: {
      nit: doc.emisor.nit,
      nombre: doc.emisor.nombre,
      codEstableMH: 'M001',
      codPuntoVentaMH: 'P001',
    },
    documento: {
      tipoDte: doc.identificacion.tipoDte,
      codigoGeneracion: doc.identificacion.codigoGeneracion,
      selloRecibido: sello,
      numeroControl: doc.identificacion.numeroControl,
      fecEmi: doc.identificacion.fecEmi,
      montoIva: 61.1,
    },
    motivo: {
      tipoAnulacion: 2,
      motivoAnulacion: null,
      nombreResponsable: 'Daniela Reina',
      nombreSolicita: 'Daniela Reina',
    },
  });

  it('invalida dentro del plazo y rechaza fuera de plazo (RCH-006)', async () => {
    const d = dte('03');
    const r = await recepcion(await envio(d));
    const ok = await request(app)
      .post('/mh-sim/anulardte')
      .set('authorization', auth)
      .send({ documento: await signJson(evento(d, r.body.selloRecibido)) });
    expect(ok.body.estado).toBe('PROCESADO');

    const viejo = dte('03');
    const r2 = await recepcion(await envio(viejo));
    await simDb
      .updateTable('documento')
      .set({ fh_emision: new Date(Date.now() - 48 * 3_600_000) })
      .where('codigo_generacion', '=', viejo.identificacion.codigoGeneracion)
      .execute();
    const fuera = await request(app)
      .post('/mh-sim/anulardte')
      .set('authorization', auth)
      .send({ documento: await signJson(evento(viejo, r2.body.selloRecibido)) });
    expect(fuera.body.codigoMsg).toBe('RCH-006');
  });
});

describe('modos de conexión', () => {
  let server: ReturnType<typeof app.listen>;
  let base: string;
  beforeAll(() => {
    server = app.listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it('SIN_CONEXION corta la conexión sin respuesta; el plano de control sigue disponible', async () => {
    await request(app).post('/mh-sim/admin/estado').send({ modo: 'SIN_CONEXION' });
    await expect(fetch(`${base}/mh-sim/health`)).rejects.toThrow();
    const ctl = await fetch(`${base}/mh-sim/admin/estado`);
    expect(((await ctl.json()) as { modo: string }).modo).toBe('SIN_CONEXION');
  });

  it('LENTA demora la respuesta según la latencia configurada', async () => {
    await request(app).post('/mh-sim/admin/estado').send({ modo: 'LENTA', latencia_ms: 400 });
    const t0 = Date.now();
    const r = await fetch(`${base}/mh-sim/health`);
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(380);
  });
});
