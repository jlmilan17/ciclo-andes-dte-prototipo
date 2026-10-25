import { config } from '../config.js';
import { db } from '../db/database.js';
import type { AnyDb } from '../db/types.js';
import { newCodigoGeneracion } from '../domain/numbering.js';
import { computeTotals, tipoForReceptor, type TipoDte, type Totals } from '../domain/tax.js';
import { bus } from '../lib/bus.js';
import { requireTurnoAbierto } from '../lib/caja.js';
import { AppError } from '../lib/errors.js';
import { applyMovement } from '../lib/inventory.js';
import { assertNrcRegistrado } from '../lib/padron.js';
import { cents, numeric } from '../lib/sql.js';
import type { AuthUser } from '../middleware/auth.js';
import { MH_TIMEOUT_MS, callMh, type MhResult } from '../mh/client.js';
import { mhStatus, publishCola, setOnline } from '../mh/status.js';
import { buildDteJson, type LineaData, type ReceptorData } from './builders/common.js';
import { nextNumeroControl } from './numeracion.js';
import { signJson } from './signer.js';
import { recordCreation, transition, type EstadoDte } from './stateMachine.js';

export type Paso = { paso: 'json' | 'firma' | 'transmision'; ms: number; resultado?: string };

export type VentaInput = {
  cliente_id: string | null;
  tipo?: '01' | '03';
  lineas: Array<{ producto_id: string; cantidad: number }>;
  metodo_pago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  efectivo_recibido?: number | null;
};

export const RECEPTOR_COLS = [
  'id',
  'tipo_contribuyente',
  'razon_social',
  'nit',
  'nrc',
  'dui',
  'giro',
  'departamento',
  'municipio',
  'direccion',
  'telefono',
  'correo',
  'activo',
] as const;

export async function loadReceptor(
  trx: AnyDb,
  clienteId: string | null,
): Promise<ReceptorData & { id: string; activo: boolean }> {
  let q = trx.selectFrom('cliente').select(RECEPTOR_COLS);
  q = clienteId
    ? q.where('id', '=', clienteId)
    : q.where('es_consumidor_final_generico', '=', true);
  const c = await q.executeTakeFirst();
  if (!c) throw new AppError(404, 'NO_ENCONTRADO', 'Cliente no encontrado.', 'cliente_id');
  return c;
}

export function retentionOpts() {
  return { retentionAppliesTo: config.RETENTION_APPLIES_TO, emisorGranContribuyente: false };
}

/** Crea el DTE en BORRADOR con sus líneas, construye el JSON y lo firma (BORRADOR → FIRMADO). */
export async function crearDteFirmado(
  trx: AnyDb,
  p: {
    tipo: TipoDte;
    receptor: ReceptorData & { id: string };
    lineas: Array<LineaData & { productoId: string | null; lineaOriginalId?: string | null }>;
    totals: Totals;
    actor: AuthUser;
    ventaId?: string | null;
    turnoId?: string | null;
    referencedDteId?: string | null;
    corrigeDteId?: string | null;
    pagos?: Array<{ metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'; monto: number }>;
    documentoRelacionado?: { tipo: '01' | '03'; codigoGeneracion: string; fechaEmision: string };
    emitidoAt?: Date;
  },
): Promise<{ id: string; numeroControl: string; codigoGeneracion: string; pasos: Paso[] }> {
  const emitidoAt = p.emitidoAt ?? new Date();
  const numeroControl = await nextNumeroControl(trx, p.tipo);
  const codigoGeneracion = newCodigoGeneracion();
  const { id: _id, ...receptorSnapshot } = p.receptor;
  const d = await trx
    .insertInto('dte')
    .values({
      tipo: p.tipo,
      numero_control: numeroControl,
      codigo_generacion: codigoGeneracion,
      estado: 'BORRADOR',
      venta_id: p.ventaId ?? null,
      turno_id: p.turnoId ?? null,
      cliente_id: p.receptor.id,
      receptor: JSON.stringify(receptorSnapshot),
      referenced_dte_id: p.referencedDteId ?? null,
      corrige_dte_id: p.corrigeDteId ?? null,
      gravado: numeric(p.totals.gravado),
      iva: numeric(p.totals.iva),
      retencion: numeric(p.totals.retencion),
      total: numeric(p.totals.total),
      emitido_at: emitidoAt,
      emitido_por: p.actor.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('dte_linea')
    .values(
      p.lineas.map((l, i) => ({
        dte_id: d.id,
        num_item: i + 1,
        producto_id: l.productoId,
        linea_original_id: l.lineaOriginalId ?? null,
        codigo: l.codigo,
        descripcion: l.descripcion,
        tipo_item: l.tipoItem,
        cantidad: l.cantidad,
        precio_unitario: numeric(l.precioUnitario),
        gravado: numeric(l.gravado),
      })),
    )
    .execute();
  await recordCreation(trx, d.id, p.actor.nombre);

  let t = performance.now();
  const json = buildDteJson({
    tipo: p.tipo,
    numeroControl,
    codigoGeneracion,
    emitidoAt,
    receptor: p.receptor,
    lineas: p.lineas,
    totals: p.totals,
    pagos: p.pagos,
    documentoRelacionado: p.documentoRelacionado,
  });
  const jsonMs = performance.now() - t;
  t = performance.now();
  const jws = await signJson(json, trx);
  const firmaMs = performance.now() - t;
  await trx
    .updateTable('dte')
    .set({ json_original: JSON.stringify(json) })
    .where('id', '=', d.id)
    .execute();
  await transition(trx, {
    dteId: d.id,
    to: 'FIRMADO',
    actor: p.actor.nombre,
    motivo: 'Firmado con certificado de pruebas (JWS RS256)',
    set: { jws },
  });
  return {
    id: d.id,
    numeroControl,
    codigoGeneracion,
    pasos: [
      { paso: 'json', ms: Math.round(jsonMs) },
      { paso: 'firma', ms: Math.round(firmaMs) },
    ],
  };
}

export type ResultadoTransmision = {
  estado: EstadoDte;
  ms: number;
  resultado: string;
  respuesta?: unknown;
};

/**
 * Transmite un DTE FIRMADO al MH. Nunca bloquea al cajero (regla 6): sin conexión o con
 * timeout, el DTE queda ENCOLADO y lo transmite el worker de contingencia.
 */
export async function transmitirDte(
  dteId: string,
  actor: string,
  timeoutMs = MH_TIMEOUT_MS,
): Promise<ResultadoTransmision> {
  const t0 = performance.now();
  const d = await db
    .selectFrom('dte')
    .select(['tipo', 'codigo_generacion', 'jws', 'numero_control'])
    .where('id', '=', dteId)
    .executeTakeFirstOrThrow();
  const done = async (estado: EstadoDte, resultado: string, respuesta?: unknown) => {
    bus.publish({ type: 'dte', id: dteId, estado, numeroControl: d.numero_control });
    if (estado === 'ENCOLADO') await publishCola();
    return { estado, resultado, respuesta, ms: Math.round(performance.now() - t0) };
  };

  if (!mhStatus.online) {
    await db.transaction().execute((trx) =>
      transition(trx, {
        dteId,
        to: 'ENCOLADO',
        actor: 'sistema',
        motivo: 'Sin conexión con el MH: se encola para transmisión en lote',
      }),
    );
    return done('ENCOLADO', 'SIN_CONEXION');
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('dte')
      .set((eb) => ({ intentos_transmision: eb('intentos_transmision', '+', 1) }))
      .where('id', '=', dteId)
      .execute();
    await transition(trx, { dteId, to: 'TRANSMITIDO', actor, motivo: 'Enviado al MH' });
  });
  const r = await callMh(
    '/recepcion',
    { tipoDte: d.tipo, codigoGeneracion: d.codigo_generacion, documento: d.jws },
    { dteId, timeoutMs },
  );

  if (r.kind === 'ok') {
    await aplicarRespuesta(dteId, r.data);
    return done('PROCESADO', 'OK', r.data);
  }
  if (r.kind === 'rechazo') {
    await aplicarRespuesta(dteId, r.data);
    return done('RECHAZADO', 'RECHAZO', r.data);
  }
  const fallo = r as Extract<MhResult, { error: string }>;
  if (fallo.kind === 'sin_conexion') setOnline(false);
  await db.transaction().execute((trx) =>
    transition(trx, {
      dteId,
      to: 'ENCOLADO',
      actor: 'sistema',
      motivo:
        r.kind === 'timeout'
          ? `El MH no respondió en ${timeoutMs} ms (ZG-15)`
          : 'Sin conexión con el MH',
      payload: { error: fallo.error, latencia: fallo.latencia },
    }),
  );
  return done('ENCOLADO', fallo.kind.toUpperCase());
}

/** Aplica la respuesta del MH a un DTE TRANSMITIDO (PROCESADO con sello, o RECHAZADO). */
export async function aplicarRespuesta(
  dteId: string,
  resp: Record<string, unknown>,
  trx?: AnyDb,
): Promise<EstadoDte> {
  const run = async (t: AnyDb) => {
    if (resp.estado === 'PROCESADO') {
      await transition(t, {
        dteId,
        to: 'PROCESADO',
        actor: 'MH (simulado)',
        motivo: 'Sello de recepción asignado',
        payload: resp,
        set: {
          sello_recepcion: resp.selloRecibido,
          fh_procesamiento: new Date(String(resp.fhProcesamiento)),
          procesado_at: new Date(),
          respuesta_mh: JSON.stringify(resp),
        },
      });
      return 'PROCESADO' as const;
    }
    await transition(t, {
      dteId,
      to: 'RECHAZADO',
      actor: 'MH (simulado)',
      motivo: `${resp.codigoMsg}: ${resp.descripcionMsg}`,
      payload: resp,
      set: { respuesta_mh: JSON.stringify(resp) },
    });
    return 'RECHAZADO' as const;
  };
  return trx ? run(trx) : db.transaction().execute(run);
}

/**
 * PRT-POS-07: venta + DTE + descuento de stock en una sola transacción; luego la
 * transmisión al MH fuera de la transacción.
 */
export async function emitirVenta(input: VentaInput, user: AuthUser) {
  const t0 = performance.now();
  const creado = await db.transaction().execute(async (trx) => {
    const { turno } = await requireTurnoAbierto(user, trx);
    const receptor = await loadReceptor(trx, input.cliente_id);
    if (!receptor.activo)
      throw new AppError(422, 'CLIENTE_INACTIVO', 'El cliente está inactivo.', 'cliente_id');
    const sugerido = tipoForReceptor(receptor.tipo_contribuyente);
    const tipo: TipoDte = input.tipo ?? sugerido;
    if (tipo === '03') {
      if (receptor.tipo_contribuyente === 'CONSUMIDOR_FINAL') {
        throw new AppError(
          422,
          'CCFE_REQUIERE_CONTRIBUYENTE',
          'El crédito fiscal requiere un receptor contribuyente.',
          'tipo',
        );
      }
      await assertNrcRegistrado(receptor.nrc, trx); // regla 5
    }

    // Precios y existencias siempre desde el servidor; el cliente solo envía ids y cantidades.
    const ids = [...new Set(input.lineas.map((l) => l.producto_id))];
    const productos = await trx
      .selectFrom('producto')
      .select(['id', 'sku', 'nombre', 'tipo', 'activo', 'stock', cents('precio').as('precio')])
      .where('id', 'in', ids)
      .orderBy('id')
      .forUpdate()
      .execute();
    const lineas = input.lineas.map((l) => {
      const p = productos.find((x) => x.id === l.producto_id);
      if (!p || !p.activo)
        throw new AppError(422, 'PRODUCTO_NO_DISPONIBLE', 'Producto no disponible.', 'lineas');
      return {
        productoId: p.id as string,
        codigo: p.sku as string,
        descripcion: p.nombre as string,
        tipoItem: p.tipo as 'bien' | 'servicio',
        cantidad: l.cantidad,
        precioUnitario: p.precio,
        gravado: p.precio * l.cantidad,
      };
    });
    const totals = computeTotals({
      tipo,
      lineas: lineas.map((l) => ({ cantidad: l.cantidad, precioUnitario: l.precioUnitario })),
      receptor: receptor.tipo_contribuyente,
      ...retentionOpts(),
    });

    let vuelto: number | null = null;
    if (input.metodo_pago === 'EFECTIVO') {
      const recibido = input.efectivo_recibido ?? totals.total;
      if (recibido < totals.total) {
        throw new AppError(
          422,
          'EFECTIVO_INSUFICIENTE',
          'El efectivo recibido es menor que el total.',
          'efectivo_recibido',
        );
      }
      vuelto = recibido - totals.total;
    }
    const venta = await trx
      .insertInto('venta')
      .values({
        turno_id: turno.id,
        cliente_id: receptor.id,
        metodo_pago: input.metodo_pago,
        efectivo_recibido:
          input.metodo_pago === 'EFECTIVO'
            ? numeric(input.efectivo_recibido ?? totals.total)
            : null,
        vuelto: vuelto === null ? null : numeric(vuelto),
        total: numeric(totals.total),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const dte = await crearDteFirmado(trx, {
      tipo,
      receptor,
      lineas,
      totals,
      actor: user,
      ventaId: venta.id,
      turnoId: turno.id,
      pagos: [{ metodo: input.metodo_pago, monto: totals.total }],
    });
    // Regla 4 en servidor: el descuento falla (y revierte todo) si no hay existencias.
    for (const l of lineas) {
      await applyMovement(trx, {
        productoId: l.productoId,
        tipo: 'VENTA',
        delta: -l.cantidad,
        dteId: dte.id,
        usuarioId: user.id,
      });
    }
    return { ...dte, totals, vuelto, ventaId: venta.id };
  });

  const restante = Math.max(300, MH_TIMEOUT_MS - Math.round(performance.now() - t0));
  const tx = await transmitirDte(creado.id, user.nombre, restante);
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
      codigoGeneracion: creado.codigoGeneracion,
      ...creado.totals,
    },
    vuelto: creado.vuelto,
    pasos: [...creado.pasos, { paso: 'transmision' as const, ms: tx.ms, resultado: tx.resultado }],
    pipelineMs,
    respuesta: tx.respuesta ?? null,
  };
}
