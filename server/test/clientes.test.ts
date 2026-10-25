import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { MSG_NRC_INVALIDO } from '../lib/padron.js';
import { app, bearer, login, resetDb } from './helpers.js';

let cajero: string;
let admin: string;

beforeAll(async () => {
  await resetDb({ minimal: false });
  cajero = await login('cajero');
  admin = await login('admin');
});

const nuevo = {
  tipo_contribuyente: 'NORMAL',
  razon_social: 'Bicicletas Usulután, S.A. de C.V.',
  nit: '1123-100190-101-5',
  nrc: '512340-7',
  giro: 'Venta de bicicletas',
};

describe('directorio de clientes', () => {
  it('busca por nombre parcial, NIT/NRC/DUI sin guiones', async () => {
    const byName = await request(app).get('/api/clientes?q=pacíf').set(bearer(cajero));
    expect(byName.body.items[0].razon_social).toBe('Rutas del Pacífico, S.A. de C.V.');
    const byNit = await request(app).get('/api/clientes?q=06140304171038').set(bearer(cajero));
    expect(byNit.body.items[0].nrc).toBe('189234-5');
    const byNrc = await request(app).get('/api/clientes?q=1892345').set(bearer(cajero));
    expect(byNrc.body.items[0].razon_social).toContain('Rutas del Pacífico');
    const byDui = await request(app).get('/api/clientes?q=04521987').set(bearer(cajero));
    expect(byDui.body.items[0].es_consumidor_final_generico).toBe(true);
  });

  it('pagina el directorio (~86 clientes)', async () => {
    const r = await request(app).get('/api/clientes').set(bearer(admin));
    expect(r.body.total).toBe(86);
    expect(r.body.items).toHaveLength(25);
  });

  it('padrón: NRC válido e inexistente', async () => {
    expect(
      (await request(app).get('/api/padron/nrc/189234-5').set(bearer(cajero))).body.registrado,
    ).toBe(true);
    expect(
      (await request(app).get('/api/padron/nrc/999999-9').set(bearer(cajero))).body.registrado,
    ).toBe(false);
  });

  it('NRC fuera del padrón bloquea el alta con el mensaje exacto', async () => {
    const r = await request(app)
      .post('/api/clientes')
      .set(bearer(cajero))
      .send({ ...nuevo, nrc: '999999-9' });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({
      code: 'NRC_NO_REGISTRADO',
      field: 'nrc',
      message: MSG_NRC_INVALIDO,
    });
  });

  it('el Cajero da de alta; solo el Administrador edita', async () => {
    const r = await request(app).post('/api/clientes').set(bearer(cajero)).send(nuevo);
    expect(r.status).toBe(201);
    expect(
      (await request(app).put(`/api/clientes/${r.body.id}`).set(bearer(cajero)).send(nuevo)).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put(`/api/clientes/${r.body.id}`)
          .set(bearer(admin))
          .send({ ...nuevo, telefono: '2222-0000' })
      ).status,
    ).toBe(200);
  });

  it('contribuyente sin NIT/NRC/giro se rechaza con 422', async () => {
    const r = await request(app)
      .post('/api/clientes')
      .set(bearer(cajero))
      .send({ tipo_contribuyente: 'GRANDE', razon_social: 'Sin datos' });
    expect(r.status).toBe(422);
  });
});
