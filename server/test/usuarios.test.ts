import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, USUARIOS } from '../db/seed/base.js';
import { app, bearer, login, resetDb } from './helpers.js';

let admin: string;
let seed: Awaited<ReturnType<typeof resetDb>>;
beforeEach(async () => {
  seed = await resetDb();
  admin = await login('admin');
});
const intento = (correo: string, password: string) =>
  request(app).post('/api/auth/login').send({ correo, password });

describe('usuarios y roles', () => {
  it('F1: 3 intentos bloquean la cuenta; el Administrador la desbloquea y el login vuelve a funcionar', async () => {
    const correo = USUARIOS.cajeroPrueba.correo;
    for (let i = 0; i < 3; i++) await intento(correo, 'mala');
    expect((await intento(correo, DEMO_PASSWORD)).status).toBe(423);
    const lista = await request(app).get('/api/usuarios').set(bearer(admin));
    const u = lista.body.items.find((x: { correo: string }) => x.correo === correo);
    expect(u.bloqueado).toBe(true);
    await request(app).post(`/api/usuarios/${u.id}/desbloquear`).set(bearer(admin)).expect(200);
    expect((await intento(correo, DEMO_PASSWORD)).status).toBe(200);
  });

  it('alta con caja, correo duplicado 409, edición de rol invalida sesiones', async () => {
    const body = {
      nombre: 'Ana Prueba',
      correo: 'ana@cicloandes.test',
      rol: 'CAJERO',
      caja_id: seed.caja2,
      password: 'Segura2026!',
    };
    const r = await request(app).post('/api/usuarios').set(bearer(admin)).send(body);
    expect(r.status).toBe(201);
    expect((await request(app).post('/api/usuarios').set(bearer(admin)).send(body)).status).toBe(
      409,
    );
    const t = (await intento(body.correo, body.password)).body.token;
    await request(app)
      .put(`/api/usuarios/${r.body.id}`)
      .set(bearer(admin))
      .send({ nombre: 'Ana Prueba', rol: 'ADMIN', activo: true })
      .expect(200);
    expect((await request(app).get('/api/auth/me').set(bearer(t))).status).toBe(401);
  });

  it('un Cajero sin caja se rechaza; el Administrador no puede desactivarse a sí mismo', async () => {
    expect(
      (
        await request(app)
          .post('/api/usuarios')
          .set(bearer(admin))
          .send({
            nombre: 'Sin Caja',
            correo: 'x@cicloandes.test',
            rol: 'CAJERO',
            password: 'Segura2026!',
          })
      ).status,
    ).toBe(422);
    const r = await request(app)
      .put(`/api/usuarios/${seed.adminId}`)
      .set(bearer(admin))
      .send({ nombre: 'Daniela Reina', rol: 'ADMIN', activo: false });
    expect(r.status).toBe(422);
  });

  it('F8: el Cajero recibe 403 en usuarios, resumen y auditoría', async () => {
    const cajero = await login('cajero');
    for (const path of ['/api/usuarios', '/api/resumen', '/api/auditoria', '/api/productos']) {
      expect((await request(app).get(path).set(bearer(cajero))).status).toBe(403);
    }
  });

  it('resumen del día', async () => {
    const r = await request(app).get('/api/resumen').set(bearer(admin));
    expect(r.status).toBe(200);
    expect(r.body.bajoStock.items.map((p: { sku: string }) => p.sku)).toContain('POR-ALU-0032');
    expect(r.body.cajas).toHaveLength(2);
  });
});
