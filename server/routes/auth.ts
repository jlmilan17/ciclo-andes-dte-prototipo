import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/database.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';

export const MAX_INTENTOS = 3;
const MSG_CREDENCIALES = 'Credenciales incorrectas. La cuenta se bloquea tras 3 intentos fallidos.';

export const authRouter = Router();

const loginSchema = z.object({
  correo: z.string().trim().toLowerCase().email('Correo inválido.'),
  password: z.string().min(1),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function session(u: any) {
  const { token, exp } = await signToken({ sub: u.id, rol: u.rol, tv: u.token_version });
  return {
    token,
    exp,
    user: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, cajaId: u.caja_id },
  };
}

authRouter.post('/auth/login', async (req, res) => {
  const { correo, password } = loginSchema.parse(req.body);
  const u = await db
    .selectFrom('usuario')
    .selectAll()
    .where('correo', '=', correo)
    .executeTakeFirst();
  if (!u || !u.activo) {
    await audit({ accion: 'LOGIN_FALLIDO', entidad: 'usuario', detalle: { correo } });
    throw new AppError(401, 'CREDENCIALES_INCORRECTAS', MSG_CREDENCIALES);
  }
  if (u.bloqueado) {
    await audit({
      usuarioId: u.id,
      accion: 'LOGIN_CUENTA_BLOQUEADA',
      entidad: 'usuario',
      entidadId: u.id,
    });
    throw new AppError(
      423,
      'CUENTA_BLOQUEADA',
      'La cuenta está bloqueada por intentos fallidos. Solicite el desbloqueo al Administrador.',
    );
  }
  if (!(await bcrypt.compare(password, u.password_hash))) {
    // PRT-SEG-02 (ZG-09): bloqueo tras 3 intentos fallidos consecutivos.
    const intentos = u.intentos_fallidos + 1;
    const bloqueado = intentos >= MAX_INTENTOS;
    await db
      .updateTable('usuario')
      .set({ intentos_fallidos: intentos, bloqueado })
      .where('id', '=', u.id)
      .execute();
    await audit({
      usuarioId: u.id,
      accion: bloqueado ? 'CUENTA_BLOQUEADA' : 'LOGIN_FALLIDO',
      entidad: 'usuario',
      entidadId: u.id,
      detalle: { intentos },
    });
    if (bloqueado) {
      throw new AppError(
        423,
        'CUENTA_BLOQUEADA',
        'Credenciales incorrectas. La cuenta quedó bloqueada tras 3 intentos fallidos.',
      );
    }
    throw new AppError(401, 'CREDENCIALES_INCORRECTAS', MSG_CREDENCIALES, undefined, {
      intentosRestantes: MAX_INTENTOS - intentos,
    });
  }
  await db.updateTable('usuario').set({ intentos_fallidos: 0 }).where('id', '=', u.id).execute();
  await audit({ usuarioId: u.id, accion: 'LOGIN', entidad: 'usuario', entidadId: u.id });
  res.json(await session(u));
});

/** PRT-SEG-03: selector de rol, herramienta de demostración disponible solo con DEMO_MODE. */
authRouter.post('/auth/demo-role', async (req, res) => {
  if (!config.DEMO_MODE) throw notFound('Ruta');
  const { rol } = z.object({ rol: z.enum(['CAJERO', 'ADMIN']) }).parse(req.body);
  const correo =
    rol === 'ADMIN' ? 'daniela.reina@cicloandes.test' : 'jose.hernandez@cicloandes.test';
  const u = await db
    .selectFrom('usuario')
    .selectAll()
    .where('correo', '=', correo)
    .executeTakeFirstOrThrow();
  if (u.bloqueado) {
    await db
      .updateTable('usuario')
      .set({ bloqueado: false, intentos_fallidos: 0 })
      .where('id', '=', u.id)
      .execute();
  }
  await audit({
    usuarioId: u.id,
    accion: 'LOGIN_DEMO_ROL',
    entidad: 'usuario',
    entidadId: u.id,
    detalle: { rol },
  });
  res.json(await session(u));
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user, demoMode: config.DEMO_MODE });
});

authRouter.post('/auth/logout', requireAuth, async (req, res) => {
  await audit({
    usuarioId: req.user!.id,
    accion: 'LOGOUT',
    entidad: 'usuario',
    entidadId: req.user!.id,
  });
  res.json({ ok: true });
});
