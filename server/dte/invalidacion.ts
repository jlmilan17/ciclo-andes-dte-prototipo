import { config } from '../config.js';
import { db } from '../db/database.js';
import { invalidationDeadline, isWithinInvalidationWindow } from '../domain/invalidation.js';
import { newCodigoGeneracion } from '../domain/numbering.js';
import { audit } from '../lib/audit.js';
import { bus } from '../lib/bus.js';
import { AppError } from '../lib/errors.js';
import { applyMovement } from '../lib/inventory.js';
import { cents } from '../lib/sql.js';
import type { AuthUser } from '../middleware/auth.js';
import { callMh } from '../mh/client.js';
import { checkConnectivity, setOnline } from '../mh/status.js';
import { buildInvalidacion } from './builders/invalidacion.js';
import { signJson } from './signer.js';
import { transition } from './stateMachine.js';

export type Invalidable = { permitido: boolean; motivo: string | null; vence: string | null };

/** Regla 9 (ZG-07): solo PROCESADO, dentro del plazo provisional y sin NCE vigentes. */
export async function evaluarInvalidable(id: string, now = new Date()): Promise<Invalidable> {
  const d = await db
    .selectFrom('dte')
    .select(['estado', 'emitido_at'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  const vence = invalidationDeadline(
    new Date(d.emitido_at),
    config.INVALIDATION_WINDOW_HOURS,
  ).toISOString();
  if (d.estado !== 'PROCESADO')
    return {
      permitido: false,
      motivo: `Solo se invalidan documentos PROCESADOS (estado actual: ${d.estado}).`,
      vence,
    };
  if (!isWithinInvalidationWindow(new Date(d.emitido_at), now, config.INVALIDATION_WINDOW_HOURS)) {
    return {
      permitido: false,
      motivo: `Fuera del plazo de invalidación (venció el ${new Date(vence).toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}). Plazo provisional de ${config.INVALIDATION_WINDOW_HOURS} h, pendiente de validar contra la normativa (ZG-07).`,
      vence,
    };
  }
  const nce = await db
    .selectFrom('dte')
    .select('id')
    .where('referenced_dte_id', '=', id)
    .where('tipo', '=', '05')
    .where('estado', 'not in', ['RECHAZADO', 'INVALIDADO'])
    .executeTakeFirst();
  if (nce)
    return {
      permitido: false,
      motivo: 'El documento tiene notas de crédito vigentes; invalide primero las NCE.',
      vence,
    };
  return { permitido: true, motivo: null, vence };
}

/**
 * SRS-REQ-DTE-005: construye, firma y transmite el evento de invalidación; al sellarse,
 * el DTE pasa a INVALIDADO y se revierte el inventario. Requiere conexión (ZG-10).
 */
export async function invalidarDte(
  id: string,
  motivoId: 1 | 2 | 3,
  observaciones: string | null,
  user: AuthUser,
) {
  const ev = await evaluarInvalidable(id);
  if (!ev.permitido)
    throw new AppError(
      409,
      ev.motivo?.startsWith('Fuera del plazo') ? 'FUERA_DE_PLAZO' : 'NO_INVALIDABLE',
      ev.motivo!,
    );
  const motivo = await db
    .selectFrom('motivo_invalidacion')
    .selectAll()
    .where('id', '=', motivoId)
    .executeTakeFirst();
  if (!motivo)
    throw new AppError(422, 'MOTIVO_INVALIDO', 'Seleccione un motivo del catálogo.', 'motivo_id');
  if (motivo.requiere_observaciones && !observaciones?.trim()) {
    throw new AppError(
      422,
      'OBSERVACIONES_REQUERIDAS',
      'El motivo "Otro" requiere observaciones.',
      'observaciones',
    );
  }
  if (!(await checkConnectivity())) {
    throw new AppError(
      409,
      'MH_SIN_CONEXION',
      'La invalidación requiere conexión con el MH. Intente cuando se restablezca (ZG-10).',
    );
  }

  const d = await db
    .selectFrom('dte')
    .select([
      'tipo',
      'codigo_generacion',
      'sello_recepcion',
      'numero_control',
      'emitido_at',
      cents('iva').as('iva'),
    ])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  const codigo = newCodigoGeneracion();
  const json = buildInvalidacion({
    codigoGeneracion: codigo,
    ahora: new Date(),
    dte: {
      tipo: d.tipo,
      codigoGeneracion: d.codigo_generacion,
      sello: d.sello_recepcion!,
      numeroControl: d.numero_control,
      emitidoAt: new Date(d.emitido_at),
      ivaCents: d.iva,
    },
    motivoId,
    observaciones: observaciones?.trim() || null,
    responsable: user.nombre,
  });
  const jws = await signJson(json);
  const r = await callMh('/anulardte', { documento: jws }, { dteId: id });
  if (r.kind === 'sin_conexion' || r.kind === 'timeout') {
    if (r.kind === 'sin_conexion') setOnline(false);
    throw new AppError(
      409,
      'MH_SIN_CONEXION',
      'El MH no respondió; la invalidación no se realizó (ZG-10).',
    );
  }
  if (r.kind === 'rechazo') {
    await audit({
      usuarioId: user.id,
      accion: 'INVALIDACION_RECHAZADA',
      entidad: 'dte',
      entidadId: id,
      detalle: r.data,
    });
    throw new AppError(
      422,
      'MH_RECHAZO',
      `El MH rechazó el evento: ${r.data.codigoMsg} · ${r.data.descripcionMsg}`,
      String(r.data.campo ?? ''),
    );
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('evento_invalidacion')
      .values({
        dte_id: id,
        codigo_generacion: codigo,
        motivo_id: motivoId,
        responsable_id: user.id,
        observaciones: observaciones?.trim() || null,
        json: JSON.stringify(json),
        jws,
        sello: String(r.data.selloRecibido),
        respuesta_mh: JSON.stringify(r.data),
      })
      .execute();
    await transition(trx, {
      dteId: id,
      to: 'INVALIDADO',
      actor: user.nombre,
      motivo: `${motivo.descripcion}${observaciones ? `: ${observaciones}` : ''}`,
      payload: r.data,
    });
    // RF-INV-02: revierte el movimiento de inventario del documento.
    const lineas = await trx
      .selectFrom('dte_linea')
      .select(['producto_id', 'cantidad'])
      .where('dte_id', '=', id)
      .execute();
    for (const l of lineas) {
      if (!l.producto_id) continue;
      await applyMovement(trx, {
        productoId: l.producto_id,
        tipo: 'REVERSION_INVALIDACION',
        delta: d.tipo === '05' ? -l.cantidad : l.cantidad,
        dteId: id,
        usuarioId: user.id,
      });
    }
    await audit(
      {
        usuarioId: user.id,
        accion: 'DTE_INVALIDADO',
        entidad: 'dte',
        entidadId: id,
        detalle: { motivoId, observaciones, sello: r.data.selloRecibido },
      },
      trx,
    );
  });
  bus.publish({ type: 'dte', id, estado: 'INVALIDADO', numeroControl: d.numero_control });
  return { sello: r.data.selloRecibido, codigoGeneracion: codigo };
}
