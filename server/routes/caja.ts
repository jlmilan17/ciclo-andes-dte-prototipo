import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { audit } from '../lib/audit.js';
import { cajaDelUsuario, turnoAbierto } from '../lib/caja.js';
import { AppError } from '../lib/errors.js';
import { numeric } from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';

export const cajaRouter = Router();

cajaRouter.get('/caja/estado', requireAuth, async (req, res) => {
  const caja = await cajaDelUsuario(req.user!);
  const turno = await turnoAbierto(caja.id);
  const ultimoCierre = await db
    .selectFrom('turno_caja')
    .select(['id', 'cierre_at', 'numero_corte'])
    .where('caja_id', '=', caja.id)
    .where('estado', '=', 'CERRADA')
    .orderBy('cierre_at', 'desc')
    .executeTakeFirst();
  res.json({ caja, turno, ultimoCierre: ultimoCierre ?? null });
});

/** PRT-POS-10: apertura de caja con fondo inicial. */
cajaRouter.post('/caja/abrir', requireAuth, async (req, res) => {
  const { fondo_inicial } = z
    .object({ fondo_inicial: z.number().int().min(0, 'El fondo no puede ser negativo.') })
    .parse(req.body);
  const caja = await cajaDelUsuario(req.user!);
  try {
    const t = await db
      .insertInto('turno_caja')
      .values({ caja_id: caja.id, cajero_id: req.user!.id, fondo_inicial: numeric(fondo_inicial) })
      .returning('id')
      .executeTakeFirstOrThrow();
    await audit({
      usuarioId: req.user!.id,
      accion: 'CAJA_ABIERTA',
      entidad: 'turno_caja',
      entidadId: t.id,
      detalle: { caja: caja.codigo, fondo_inicial },
    });
    res.status(201).json({ caja, turno: await turnoAbierto(caja.id) });
  } catch (e) {
    if ((e as { code?: string }).code === '23505')
      throw new AppError(409, 'TURNO_YA_ABIERTO', `La ${caja.codigo} ya tiene un turno abierto.`);
    throw e;
  }
});
