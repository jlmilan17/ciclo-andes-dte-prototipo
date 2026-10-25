import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

export const usuariosRouter = Router();
usuariosRouter.use('/usuarios', requireAuth, requireAdmin);

const cols = [
  'u.id',
  'u.nombre',
  'u.correo',
  'u.rol',
  'u.caja_id',
  'u.activo',
  'u.bloqueado',
  'u.intentos_fallidos',
  'u.created_at',
  'c.codigo as caja',
] as const;

/** PRT-ADM-05: módulo Usuarios y roles. */
usuariosRouter.get('/usuarios', async (_req, res) => {
  const items = await db
    .selectFrom('usuario as u')
    .leftJoin('caja as c', 'c.id', 'u.caja_id')
    .select(cols)
    .orderBy('u.nombre')
    .execute();
  const cajas = await db
    .selectFrom('caja')
    .select(['id', 'codigo', 'nombre'])
    .orderBy('codigo')
    .execute();
  res.json({ items, cajas });
});

const base = z.object({
  nombre: z.string().trim().min(3, 'Ingrese el nombre completo.'),
  rol: z.enum(['CAJERO', 'ADMIN']),
  caja_id: z.string().uuid().nullish(),
});
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.');

usuariosRouter.post('/usuarios', async (req, res) => {
  const b = base
    .extend({ correo: z.string().trim().toLowerCase().email('Correo inválido.'), password })
    .parse(req.body);
  if (b.rol === 'CAJERO' && !b.caja_id)
    throw new AppError(422, 'CAJA_REQUERIDA', 'Asigne una caja al Cajero.', 'caja_id');
  try {
    const u = await db
      .insertInto('usuario')
      .values({
        nombre: b.nombre,
        correo: b.correo,
        rol: b.rol,
        caja_id: b.rol === 'CAJERO' ? b.caja_id : null,
        password_hash: await bcrypt.hash(b.password, 10),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await audit({
      usuarioId: req.user!.id,
      accion: 'USUARIO_CREADO',
      entidad: 'usuario',
      entidadId: u.id,
      detalle: { correo: b.correo, rol: b.rol },
    });
    res.status(201).json({ id: u.id });
  } catch (e) {
    if ((e as { code?: string }).code === '23505')
      throw new AppError(409, 'CORREO_DUPLICADO', 'Ya existe un usuario con ese correo.', 'correo');
    throw e;
  }
});

usuariosRouter.put('/usuarios/:id', async (req, res) => {
  const b = base
    .extend({ activo: z.boolean(), password: password.optional().or(z.literal('')) })
    .parse(req.body);
  const id = String(req.params.id);
  if (id === req.user!.id && (!b.activo || b.rol !== 'ADMIN')) {
    throw new AppError(
      422,
      'AUTO_DEGRADACION',
      'No puede desactivarse ni quitarse el rol de Administrador a sí mismo.',
    );
  }
  if (b.rol === 'CAJERO' && !b.caja_id)
    throw new AppError(422, 'CAJA_REQUERIDA', 'Asigne una caja al Cajero.', 'caja_id');
  const set: Record<string, unknown> = {
    nombre: b.nombre,
    rol: b.rol,
    caja_id: b.rol === 'CAJERO' ? b.caja_id : null,
    activo: b.activo,
  };
  if (b.password) set.password_hash = await bcrypt.hash(b.password, 10);
  // Cambios de rol o de estado invalidan las sesiones abiertas del usuario.
  const r = await db
    .updateTable('usuario')
    .set((eb) => ({ ...set, token_version: eb('token_version', '+', 1) }))
    .where('id', '=', id)
    .executeTakeFirst();
  if (!Number(r.numUpdatedRows)) throw notFound('Usuario');
  await audit({
    usuarioId: req.user!.id,
    accion: 'USUARIO_EDITADO',
    entidad: 'usuario',
    entidadId: id,
    detalle: { rol: b.rol, activo: b.activo, password: !!b.password },
  });
  res.json({ ok: true });
});

/** PRT-SEG-02: el Administrador desbloquea la cuenta tras 3 intentos fallidos. */
usuariosRouter.post('/usuarios/:id/desbloquear', async (req, res) => {
  const r = await db
    .updateTable('usuario')
    .set({ bloqueado: false, intentos_fallidos: 0, bloqueado_hasta: null })
    .where('id', '=', String(req.params.id))
    .executeTakeFirst();
  if (!Number(r.numUpdatedRows)) throw notFound('Usuario');
  await audit({
    usuarioId: req.user!.id,
    accion: 'CUENTA_DESBLOQUEADA',
    entidad: 'usuario',
    entidadId: String(req.params.id),
  });
  res.json({ ok: true });
});
