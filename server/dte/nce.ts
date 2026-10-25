import { db } from '../db/database.js';
import type { AnyDb } from '../db/types.js';
import { NceError, assertNceCap, computeNceTotals, type Devolucion } from '../domain/nce.js';
import { AppError } from '../lib/errors.js';
import { applyMovement } from '../lib/inventory.js';
import { cents } from '../lib/sql.js';
import type { AuthUser } from '../middleware/auth.js';
import { MH_TIMEOUT_MS } from '../mh/client.js';
import { fecEmi } from './builders/common.js';
import { crearDteFirmado, loadReceptor, transmitirDte } from './pipeline.js';

const VIGENTE = ['RECHAZADO', 'INVALIDADO'];

/** Estado de devoluciones del documento original: cantidades ya devueltas y acumulado de NCE. */
export async function estadoDevoluciones(trx: AnyDb, originalId: string) {
  const lineas = await trx
    .selectFrom('dte_linea as l')
    .select([
      'l.id',
      'l.num_item',
      'l.producto_id',
      'l.codigo',
      'l.descripcion',
      'l.tipo_item',
      'l.cantidad',
      cents('l.precio_unitario').as('precio_unitario'),
      cents('l.gravado').as('gravado'),
      (eb) =>
        eb
          .selectFrom('dte_linea as nl')
          .innerJoin('dte as n', 'n.id', 'nl.dte_id')
          .select(eb.fn.coalesce(eb.fn.sum<number>('nl.cantidad'), eb.lit(0)).as('d'))
          .whereRef('nl.linea_original_id', '=', 'l.id')
          .where('n.estado', 'not in', VIGENTE)
          .as('devuelto'),
    ])
    .where('l.dte_id', '=', originalId)
    .orderBy('l.num_item')
    .execute();
  const acum = await trx
    .selectFrom('dte')
    .select((eb) => eb.fn.coalesce(eb.fn.sum<number>(cents('total')), eb.lit(0)).as('t'))
    .where('referenced_dte_id', '=', originalId)
    .where('tipo', '=', '05')
    .where('estado', 'not in', VIGENTE)
    .executeTakeFirstOrThrow();
  return {
    lineas: lineas.map((l) => ({ ...l, devuelto: Number(l.devuelto) })),
    acumulado: Number(acum.t),
  };
}

/** RF-NCE-01: busca un DTE previo por codigoGeneracion o numeroControl; solo CCFE PROCESADOS. */
export async function buscarOriginal(q: string) {
  const term = q.trim().toUpperCase();
  const d = await db
    .selectFrom('dte')
    .select([
      'id',
      'tipo',
      'estado',
      'numero_control',
      'codigo_generacion',
      'emitido_at',
      'receptor',
      'sello_recepcion',
      cents('gravado').as('gravado'),
      cents('iva').as('iva'),
      cents('retencion').as('retencion'),
      cents('total').as('total'),
    ])
    .where((eb) =>
      eb.or([
        eb('codigo_generacion', '=', term),
        eb('numero_control', '=', term),
        eb(
          'id',
          '=',
          /^[0-9A-F-]{36}$/.test(term)
            ? term.toLowerCase()
            : '00000000-0000-0000-0000-000000000000',
        ),
      ]),
    )
    .executeTakeFirst();
  if (!d)
    throw new AppError(
      404,
      'NO_ENCONTRADO',
      'No existe un DTE con ese código de generación o número de control.',
      'q',
    );
  if (d.tipo !== '03')
    throw new AppError(
      422,
      'NCE_SOLO_CCFE',
      'La nota de crédito solo se emite sobre un Comprobante de Crédito Fiscal (03) (ZG-20).',
      'q',
    );
  if (d.estado !== 'PROCESADO') {
    throw new AppError(
      422,
      'NCE_ORIGINAL_NO_PROCESADO',
      `Solo se puede referenciar un DTE PROCESADO (estado actual: ${d.estado}).`,
      'q',
    );
  }
  const dev = await estadoDevoluciones(db, d.id);
  return { ...d, ...dev, disponible: d.total - dev.acumulado };
}

/**
 * SRS-REQ-DTE-004: NCE con impuestos proporcionales, tope acumulado, reintegro de stock y
 * FK inmutable al original. Entra al mismo ciclo de contingencia (RNF-NCE-02).
 */
export async function emitirNce(originalId: string, devolucion: Devolucion[], user: AuthUser) {
  const t0 = performance.now();
  const creado = await db.transaction().execute(async (trx) => {
    const orig = await trx
      .selectFrom('dte')
      .select([
        'id',
        'tipo',
        'estado',
        'cliente_id',
        'codigo_generacion',
        'emitido_at',
        cents('gravado').as('gravado'),
        cents('iva').as('iva'),
        cents('retencion').as('retencion'),
        cents('total').as('total'),
      ])
      .where('id', '=', originalId)
      .forUpdate()
      .executeTakeFirst();
    if (!orig) throw new AppError(404, 'NO_ENCONTRADO', 'DTE original no encontrado.');
    if (orig.tipo !== '03')
      throw new AppError(
        422,
        'NCE_SOLO_CCFE',
        'La nota de crédito solo se emite sobre un CCFE (03).',
      );
    if (orig.estado !== 'PROCESADO')
      throw new AppError(
        422,
        'NCE_ORIGINAL_NO_PROCESADO',
        'Solo se puede referenciar un DTE PROCESADO.',
      );

    const dev = await estadoDevoluciones(trx, orig.id);
    let t;
    try {
      t = computeNceTotals(
        { gravado: orig.gravado, iva: orig.iva, retencion: orig.retencion, total: orig.total },
        dev.lineas.map((l) => ({
          lineaId: l.id as string,
          cantidad: l.cantidad as number,
          precioUnitario: l.precio_unitario,
        })),
        devolucion,
        Object.fromEntries(dev.lineas.map((l) => [l.id, l.devuelto])),
      );
      assertNceCap(orig.total, dev.acumulado, t.total);
    } catch (e) {
      if (e instanceof NceError) throw new AppError(422, e.code, e.message, e.field);
      throw e;
    }

    const porId = Object.fromEntries(dev.lineas.map((l) => [l.id, l]));
    const lineas = t.lineas.map((l) => {
      const o = porId[l.lineaId]!;
      return {
        productoId: o.producto_id as string | null,
        lineaOriginalId: o.id as string,
        codigo: o.codigo as string,
        descripcion: o.descripcion as string,
        tipoItem: o.tipo_item as 'bien' | 'servicio',
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        gravado: l.gravado,
      };
    });
    const receptor = await loadReceptor(trx, orig.cliente_id);
    const d = await crearDteFirmado(trx, {
      tipo: '05',
      receptor,
      lineas,
      totals: { gravado: t.gravado, iva: t.iva, retencion: t.retencion, total: t.total },
      actor: user,
      referencedDteId: orig.id,
      documentoRelacionado: {
        tipo: '03',
        codigoGeneracion: orig.codigo_generacion,
        fechaEmision: fecEmi(new Date(orig.emitido_at)),
      },
    });
    // RF-NCE-03: reintegro físico del stock.
    for (const l of lineas) {
      if (l.productoId)
        await applyMovement(trx, {
          productoId: l.productoId,
          tipo: 'DEVOLUCION',
          delta: l.cantidad,
          dteId: d.id,
          usuarioId: user.id,
        });
    }
    return { ...d, totals: t };
  });
  const tx = await transmitirDte(
    creado.id,
    user.nombre,
    Math.max(300, MH_TIMEOUT_MS - Math.round(performance.now() - t0)),
  );
  const pipelineMs = Math.round(performance.now() - t0);
  await db
    .updateTable('dte')
    .set({ pipeline_ms: pipelineMs })
    .where('id', '=', creado.id)
    .execute();
  return {
    dte: {
      id: creado.id,
      estado: tx.estado,
      numeroControl: creado.numeroControl,
      gravado: creado.totals.gravado,
      iva: creado.totals.iva,
      retencion: creado.totals.retencion,
      total: creado.totals.total,
    },
    pasos: [...creado.pasos, { paso: 'transmision' as const, ms: tx.ms, resultado: tx.resultado }],
    pipelineMs,
  };
}
