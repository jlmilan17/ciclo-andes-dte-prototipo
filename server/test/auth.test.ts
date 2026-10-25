import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database.js';
import { DEMO_PASSWORD, USUARIOS } from '../db/seed/base.js';
import { signToken } from '../lib/jwt.js';
import { app, bearer, login, resetDb } from './helpers.js';

beforeEach(async () => {
  await resetDb();
});

describe('login', () => {
  it('credenciales correctas devuelven token y usuario', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ correo: USUARIOS.admin.correo, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.rol).toBe('ADMIN');
    expect(res.body.token).toBeTypeOf('string');
  });

  it('credenciales incorrectas: mensaje de la regla y bloqueo al tercer intento', async () => {
    const send = () =>
      request(app)
        .post('/api/auth/login')
        .send({ correo: USUARIOS.cajeroPrueba.correo, password: 'mala' });
    const r1 = await send();
    expect(r1.status).toBe(401);
    expect(r1.body.message).toBe(
      'Credenciales incorrectas. La cuenta se bloquea tras 3 intentos fallidos.',
    );
    expect((await send()).status).toBe(401);
    const r3 = await send();
    expect(r3.status).toBe(423);
    expect(r3.body.code).toBe('CUENTA_BLOQUEADA');
    // ni la contraseña correcta entra
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ correo: USUARIOS.cajeroPrueba.correo, password: DEMO_PASSWORD });
    expect(ok.status).toBe(423);
    const acciones = await db.selectFrom('audit_log').select('accion').execute();
    expect(acciones.map((a) => a.accion)).toContain('CUENTA_BLOQUEADA');
  });

  it('un login correcto reinicia el contador', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ correo: USUARIOS.cajero.correo, password: 'x' });
    await request(app)
      .post('/api/auth/login')
      .send({ correo: USUARIOS.cajero.correo, password: 'x' });
    await login('cajero');
    const u = await db
      .selectFrom('usuario')
      .select('intentos_fallidos')
      .where('correo', '=', USUARIOS.cajero.correo)
      .executeTakeFirstOrThrow();
    expect(u.intentos_fallidos).toBe(0);
  });

  it('las contraseñas se guardan con hash', async () => {
    const u = await db.selectFrom('usuario').select('password_hash').executeTakeFirstOrThrow();
    expect(u.password_hash).toMatch(/^\$2[aby]\$/);
  });
});

describe('protección de rutas', () => {
  it('401 sin token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auditoria')).status).toBe(401);
  });

  it('401 con token expirado', async () => {
    const u = await db
      .selectFrom('usuario')
      .selectAll()
      .where('correo', '=', USUARIOS.admin.correo)
      .executeTakeFirstOrThrow();
    const { token } = await signToken({ sub: u.id, rol: 'ADMIN', tv: 0 }, -1);
    const res = await request(app).get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESION_EXPIRADA');
  });

  it('401 cuando se invalida la versión del token', async () => {
    const t = await login('admin');
    await db
      .updateTable('usuario')
      .set({ token_version: 1 })
      .where('correo', '=', USUARIOS.admin.correo)
      .execute();
    expect((await request(app).get('/api/auth/me').set(bearer(t))).status).toBe(401);
  });

  it('403 para Cajero en ruta de Administrador; 200 para Administrador', async () => {
    const cajero = await login('cajero');
    const r = await request(app).get('/api/auditoria').set(bearer(cajero));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ACCESO_DENEGADO');
    const admin = await login('admin');
    expect((await request(app).get('/api/auditoria').set(bearer(admin))).status).toBe(200);
  });

  it('selector de rol de demostración emite token del rol pedido', async () => {
    const res = await request(app).post('/api/auth/demo-role').send({ rol: 'CAJERO' });
    expect(res.status).toBe(200);
    expect(res.body.user.correo).toBe(USUARIOS.cajero.correo);
  });
});
