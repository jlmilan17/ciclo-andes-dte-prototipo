import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

export const auditoriaRouter = Router();

auditoriaRouter.get('/auditoria', requireAuth, requireAdmin, async (req, res) => {
  const { page, accion } = z
    .object({ page: z.coerce.number().int().min(1).default(1), accion: z.string().optional() })
    .parse(req.query);
  let q = db
    .selectFrom('audit_log as a')
    .leftJoin('usuario as u', 'u.id', 'a.usuario_id')
    .select([
      'a.id',
      'a.accion',
      'a.entidad',
      'a.entidad_id',
      'a.detalle',
      'a.created_at',
      'u.nombre as usuario',
    ]);
  if (accion) q = q.where('a.accion', '=', accion);
  const items = await q
    .orderBy('a.id', 'desc')
    .limit(50)
    .offset((page - 1) * 50)
    .execute();
  res.json({ items, page });
});
