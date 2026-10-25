import { sql } from 'kysely';
import { db as defaultDb } from '../db/database.js';
import type { AnyDb } from '../db/types.js';
import { cents } from './sql.js';

export type CorteZ = {
  turnoId: string;
  caja: string;
  cajero: string;
  apertura: string;
  cierre: string | null;
  numero: number | null;
  fondoInicial: number;
  porMetodo: Record<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA', { ventas: number; monto: number }>;
  totalVentas: number;
  ventasCount: number;
  dtePorTipo: Record<'01' | '03' | '05', { cantidad: number; monto: number }>;
  invalidados: { cantidad: number; monto: number; documentos: string[] };
  pendientesContingencia: number;
  rechazados: number;
  devoluciones: number;
  efectivoEsperado: number;
  efectivoContado: number | null;
  diferencia: number | null;
};

/**
 * RF-CAJ-01/02: totales derivados de las ventas reales del turno. Las ventas cuyo DTE fue
 * INVALIDADO se excluyen de los totales y se cuentan aparte.
 */
export async function calcularCorte(
  turnoId: string,
  efectivoContado: number | null = null,
  db: AnyDb = defaultDb,
): Promise<CorteZ> {
  const t = await db
    .selectFrom('turno_caja as t')
    .innerJoin('caja as c', 'c.id', 't.caja_id')
    .innerJoin('usuario as u', 'u.id', 't.cajero_id')
    .select([
      't.id',
      't.apertura_at',
      't.cierre_at',
      't.numero_corte',
      cents('t.fondo_inicial').as('fondo'),
      'c.codigo as caja',
      'u.nombre as cajero',
    ])
    .where('t.id', '=', turnoId)
    .executeTakeFirstOrThrow();

  // Una venta cuenta si alguno de sus DTE (original o corrección) no está invalidado.
  const ventas = await db
    .selectFrom('venta as v')
    .select(['v.id', 'v.metodo_pago', cents('v.total').as('total')])
    .where('v.turno_id', '=', turnoId)
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('dte as d')
          .select('d.id')
          .whereRef('d.venta_id', '=', 'v.id')
          .where('d.estado', '<>', 'INVALIDADO'),
      ),
    )
    .execute();
  const porMetodo: CorteZ['porMetodo'] = {
    EFECTIVO: { ventas: 0, monto: 0 },
    TARJETA: { ventas: 0, monto: 0 },
    TRANSFERENCIA: { ventas: 0, monto: 0 },
  };
  for (const v of ventas) {
    const m = porMetodo[v.metodo_pago as keyof typeof porMetodo];
    m.ventas++;
    m.monto += v.total;
  }

  const hasta = t.cierre_at ?? new Date();
  const dtes = await db
    .selectFrom('dte')
    .select(['tipo', 'estado', 'numero_control', cents('total').as('total')])
    .where((eb) =>
      eb.or([
        eb('turno_id', '=', turnoId),
        // NCE emitidas durante el turno sobre documentos de esta caja (informativo).
        eb.and([
          eb('tipo', '=', '05'),
          eb('emitido_at', '>=', t.apertura_at),
          eb('emitido_at', '<=', hasta),
        ]),
      ]),
    )
    .execute();
  const dtePorTipo: CorteZ['dtePorTipo'] = {
    '01': { cantidad: 0, monto: 0 },
    '03': { cantidad: 0, monto: 0 },
    '05': { cantidad: 0, monto: 0 },
  };
  const invalidados = { cantidad: 0, monto: 0, documentos: [] as string[] };
  let pendientes = 0;
  let rechazados = 0;
  for (const d of dtes) {
    if (d.estado === 'INVALIDADO') {
      invalidados.cantidad++;
      invalidados.monto += d.total;
      invalidados.documentos.push(d.numero_control);
      continue;
    }
    if (d.estado === 'RECHAZADO') {
      rechazados++;
      continue;
    }
    if (d.estado === 'ENCOLADO') pendientes++;
    const k = d.tipo as '01' | '03' | '05';
    dtePorTipo[k].cantidad++;
    dtePorTipo[k].monto += d.total;
  }

  const totalVentas = ventas.reduce((a, v) => a + v.total, 0);
  const efectivoEsperado = t.fondo + porMetodo.EFECTIVO.monto;
  return {
    turnoId: t.id,
    caja: t.caja,
    cajero: t.cajero,
    apertura: new Date(t.apertura_at).toISOString(),
    cierre: t.cierre_at ? new Date(t.cierre_at).toISOString() : null,
    numero: t.numero_corte,
    fondoInicial: t.fondo,
    porMetodo,
    totalVentas,
    ventasCount: ventas.length,
    dtePorTipo,
    invalidados,
    pendientesContingencia: pendientes,
    rechazados,
    devoluciones: dtePorTipo['05'].monto,
    efectivoEsperado,
    efectivoContado,
    diferencia: efectivoContado === null ? null : efectivoContado - efectivoEsperado,
  };
}

/** Cierra el turno: numera el Corte Z, guarda la fotografía y bloquea la terminal (RF-CAJ-03). */
export async function confirmarCorte(
  trx: AnyDb,
  turnoId: string,
  efectivoContado: number,
  numero: number,
): Promise<CorteZ> {
  const cierre = new Date();
  await trx
    .updateTable('turno_caja')
    .set({ cierre_at: cierre })
    .where('id', '=', turnoId)
    .execute();
  const corte = await calcularCorte(turnoId, efectivoContado, trx);
  const final = { ...corte, numero, cierre: cierre.toISOString() };
  await trx
    .updateTable('turno_caja')
    .set({
      estado: 'CERRADA',
      numero_corte: numero,
      efectivo_contado: sql`${(efectivoContado / 100).toFixed(2)}::numeric`,
      corte: JSON.stringify(final),
    })
    .where('id', '=', turnoId)
    .execute();
  return final;
}
