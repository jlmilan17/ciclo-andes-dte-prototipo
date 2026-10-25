import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { nextSequence } from '../dte/numeracion.js';
import { audit } from '../lib/audit.js';
import { cajaDelUsuario, turnoAbierto } from '../lib/caja.js';
import { calcularCorte, confirmarCorte, type CorteZ } from '../lib/corte.js';
import { AppError, notFound } from '../lib/errors.js';
import { numeric } from '../lib/sql.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { cortePdf } from '../pdf/cortePdf.js';

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

/** Vista previa del Corte Z del turno abierto (Cajero; el Administrador puede consultarla). */
cajaRouter.get('/caja/corte-z/preview', requireAuth, async (req, res) => {
  const { efectivo_contado } = z
    .object({ efectivo_contado: z.coerce.number().int().min(0).optional() })
    .parse(req.query);
  const caja = await cajaDelUsuario(req.user!);
  const t = await turnoAbierto(caja.id);
  if (!t) throw new AppError(409, 'CAJA_CERRADA', `La ${caja.codigo} no tiene un turno abierto.`);
  res.json(await calcularCorte(t.id, efectivo_contado ?? null));
});

/** RF-CAJ-03: confirma el corte y bloquea la terminal hasta una nueva apertura. Solo el Cajero. */
cajaRouter.post('/caja/corte-z/confirmar', requireAuth, requireRole('CAJERO'), async (req, res) => {
  const { efectivo_contado } = z
    .object({ efectivo_contado: z.number().int().min(0, 'Ingrese el efectivo contado.') })
    .parse(req.body);
  const caja = await cajaDelUsuario(req.user!);
  const corte = await db.transaction().execute(async (trx) => {
    const t = await turnoAbierto(caja.id, trx, true);
    if (!t) throw new AppError(409, 'CAJA_CERRADA', `La ${caja.codigo} no tiene un turno abierto.`);
    return confirmarCorte(trx, t.id, efectivo_contado, await nextSequence(trx, 'CORTE_Z'));
  });
  await audit({
    usuarioId: req.user!.id,
    accion: 'CORTE_Z',
    entidad: 'turno_caja',
    entidadId: corte.turnoId,
    detalle: { numero: corte.numero, total: corte.totalVentas, diferencia: corte.diferencia },
  });
  res.status(201).json(corte);
});

async function corteGuardado(turnoId: string): Promise<CorteZ> {
  const t = await db
    .selectFrom('turno_caja')
    .select(['corte', 'estado'])
    .where('id', '=', turnoId)
    .executeTakeFirst();
  if (!t || t.estado !== 'CERRADA') throw notFound('Corte Z');
  return (t.corte as CorteZ | null) ?? calcularCorte(turnoId);
}

cajaRouter.get('/caja/cortes', requireAuth, async (req, res) => {
  const caja = await cajaDelUsuario(req.user!);
  const items = await db
    .selectFrom('turno_caja as t')
    .innerJoin('usuario as u', 'u.id', 't.cajero_id')
    .select(['t.id', 't.numero_corte', 't.apertura_at', 't.cierre_at', 'u.nombre as cajero'])
    .where('t.caja_id', '=', caja.id)
    .where('t.estado', '=', 'CERRADA')
    .orderBy('t.cierre_at', 'desc')
    .limit(20)
    .execute();
  res.json({ items });
});

cajaRouter.get('/caja/corte-z/:turnoId', requireAuth, async (req, res) => {
  res.json(await corteGuardado(String(req.params.turnoId)));
});

cajaRouter.get('/caja/corte-z/:turnoId/pdf', requireAuth, async (req, res) => {
  const c = await corteGuardado(String(req.params.turnoId));
  res.setHeader('content-type', 'application/pdf');
  res.setHeader(
    'content-disposition',
    `inline; filename="corte-z-${String(c.numero).padStart(4, '0')}.pdf"`,
  );
  res.send(await cortePdf(c));
});
