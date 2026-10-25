import { randomInt } from 'node:crypto';
import { config } from '../../config.js';
import { newCodigoGeneracion } from '../../domain/numbering.js';
import { computeNceTotals } from '../../domain/nce.js';
import { computeTotals, type TipoDte } from '../../domain/tax.js';
import { buildInvalidacion } from '../../dte/builders/invalidacion.js';
import { nextSequence } from '../../dte/numeracion.js';
import { crearDteFirmado, loadReceptor } from '../../dte/pipeline.js';
import { signJson } from '../../dte/signer.js';
import { transition } from '../../dte/stateMachine.js';
import { calcularCorte } from '../../lib/corte.js';
import { applyMovement } from '../../lib/inventory.js';
import { cents, numeric } from '../../lib/sql.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { AnyDb } from '../types.js';

const H = 3_600_000;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const sello = () => {
  let s = String(new Date().getFullYear());
  while (s.length < 40) s += ALNUM[randomInt(ALNUM.length)];
  return s;
};

type Spec = {
  key: string;
  horasAtras: number;
  tipo: TipoDte;
  cliente: string | null;
  items: Array<[string, number]>;
  pago: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
  final: 'PROCESADO' | 'RECHAZADO' | 'INVALIDADO';
};

/**
 * DTE semilla (sección 13): fechas relativas a la ejecución y totales del motor real.
 * Incluye un INVALIDADO, un RECHAZADO, PROCESADOS fuera del plazo de invalidación,
 * uno de hoy invalidable y una NCE.
 */
const SPECS: Spec[] = [
  {
    key: 'd1',
    horasAtras: 5 * 24 + 3,
    tipo: '01',
    cliente: null,
    items: [
      ['CAM-MTB-0029', 2],
      ['SER-MAN-0001', 1],
    ],
    pago: 'EFECTIVO',
    final: 'PROCESADO',
  },
  {
    key: 'd2',
    horasAtras: 5 * 24 + 1,
    tipo: '03',
    cliente: 'Taller Bici Norte',
    items: [
      ['CAD-9V-0210', 3],
      ['CAM-MTB-0029', 6],
    ],
    pago: 'TRANSFERENCIA',
    final: 'PROCESADO',
  },
  {
    key: 'd3',
    horasAtras: 4 * 24 + 2,
    tipo: '03',
    cliente: 'Distribuidora Pedal Sur',
    items: [
      ['BIC-MTB-0290', 1],
      ['CAS-URB-0114', 2],
    ],
    pago: 'TRANSFERENCIA',
    final: 'PROCESADO',
  },
  {
    key: 'd4',
    horasAtras: 3 * 24 + 5,
    tipo: '01',
    cliente: null,
    items: [['LUZ-LED-0055', 1]],
    pago: 'TARJETA',
    final: 'PROCESADO',
  },
  {
    key: 'd5',
    horasAtras: 3 * 24 + 2,
    tipo: '03',
    cliente: 'Ciclismo Escolar Los Planes',
    items: [['CAS-URB-0114', 4]],
    pago: 'TRANSFERENCIA',
    final: 'INVALIDADO',
  },
  {
    key: 'd6',
    horasAtras: 2 * 24 + 6,
    tipo: '03',
    cliente: 'Rutas del Pacífico, S.A. de C.V.',
    items: [['LUZ-LED-0055', 3]],
    pago: 'TARJETA',
    final: 'RECHAZADO',
  },
  {
    key: 'd7',
    horasAtras: 2 * 24 + 3,
    tipo: '01',
    cliente: null,
    items: [['BIC-URB-0260', 1]],
    pago: 'EFECTIVO',
    final: 'PROCESADO',
  },
  {
    key: 'd8',
    horasAtras: 2 * 24 + 1,
    tipo: '03',
    cliente: 'Rutas del Pacífico, S.A. de C.V.',
    items: [
      ['BIC-MTB-0290', 2],
      ['CAS-URB-0114', 2],
      ['LUZ-LED-0055', 2],
    ],
    pago: 'TRANSFERENCIA',
    final: 'PROCESADO',
  },
  {
    key: 'd10',
    horasAtras: 30,
    tipo: '01',
    cliente: null,
    items: [['CAM-MTB-0029', 4]],
    pago: 'EFECTIVO',
    final: 'PROCESADO',
  },
  {
    key: 'd11',
    horasAtras: 26,
    tipo: '03',
    cliente: 'Taller Bici Norte',
    items: [
      ['CAD-9V-0210', 1],
      ['SER-MAN-0001', 2],
    ],
    pago: 'TARJETA',
    final: 'PROCESADO',
  },
  {
    key: 'd12',
    horasAtras: 2,
    tipo: '01',
    cliente: null,
    items: [
      ['CAS-URB-0114', 1],
      ['LUZ-LED-0055', 1],
    ],
    pago: 'EFECTIVO',
    final: 'PROCESADO',
  },
  {
    key: 'd13',
    horasAtras: 1,
    tipo: '03',
    cliente: 'Rutas del Pacífico, S.A. de C.V.',
    items: [
      ['BIC-URB-0260', 1],
      ['CAS-URB-0114', 1],
    ],
    pago: 'TRANSFERENCIA',
    final: 'PROCESADO',
  },
];

const fhEmision = (d: Date) => d;

export async function seedDtes(
  db: AnyDb,
  ctx: {
    caja1: string;
    cajeroId: string;
    adminId: string;
    productoIdBySku: Record<string, string>;
    clienteIdByNombre: Record<string, string>;
  },
) {
  const cajero: AuthUser = {
    id: ctx.cajeroId,
    nombre: 'José Luis Hernández',
    correo: '',
    rol: 'CAJERO',
    cajaId: ctx.caja1,
  };
  const admin: AuthUser = {
    id: ctx.adminId,
    nombre: 'Daniela Reina',
    correo: '',
    rol: 'ADMIN',
    cajaId: null,
  };
  const now = Date.now();
  const turnos = new Map<number, string>();
  const ids: Record<string, string> = {};

  // Un turno cerrado por día con ventas.
  const turnoDe = async (trx: AnyDb, horasAtras: number) => {
    const dia = Math.floor(horasAtras / 24);
    if (turnos.has(dia)) return turnos.get(dia)!;
    const apertura = new Date(now - (dia * 24 + Math.max(horasAtras % 24, 1) + 2) * H);
    const cierre = dia === 0 ? new Date(now - 0.5 * H) : new Date(apertura.getTime() + 9 * H);
    const t = await trx
      .insertInto('turno_caja')
      .values({
        caja_id: ctx.caja1,
        cajero_id: ctx.cajeroId,
        apertura_at: apertura,
        cierre_at: cierre,
        fondo_inicial: '100.00',
        efectivo_contado: null,
        estado: 'CERRADA',
        numero_corte: await nextSequence(trx, 'CORTE_Z'),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    turnos.set(dia, t.id);
    return t.id as string;
  };

  // Ordenar del más antiguo al más reciente para que la numeración sea cronológica.
  const ordenados = [...SPECS].sort((a, b) => b.horasAtras - a.horasAtras);
  for (const s of ordenados) {
    await db.transaction().execute(async (trx) => {
      const at = new Date(now - s.horasAtras * H);
      const turnoId = await turnoDe(trx, s.horasAtras);
      const receptor = await loadReceptor(
        trx,
        s.cliente ? ctx.clienteIdByNombre[s.cliente]! : null,
      );
      const productos = await trx
        .selectFrom('producto')
        .select(['id', 'sku', 'nombre', 'tipo', cents('precio').as('precio')])
        .where(
          'sku',
          'in',
          s.items.map(([sku]) => sku),
        )
        .execute();
      const lineas = s.items.map(([sku, cantidad]) => {
        const p = productos.find((x) => x.sku === sku)!;
        return {
          productoId: p.id as string,
          codigo: sku,
          descripcion: p.nombre as string,
          tipoItem: p.tipo as 'bien' | 'servicio',
          cantidad,
          precioUnitario: p.precio,
          gravado: p.precio * cantidad,
        };
      });
      const totals = computeTotals({
        tipo: s.tipo,
        lineas,
        receptor: receptor.tipo_contribuyente,
        retentionAppliesTo: config.RETENTION_APPLIES_TO,
      });
      const venta = await trx
        .insertInto('venta')
        .values({
          turno_id: turnoId,
          cliente_id: receptor.id,
          metodo_pago: s.pago,
          efectivo_recibido: s.pago === 'EFECTIVO' ? numeric(totals.total) : null,
          vuelto: s.pago === 'EFECTIVO' ? '0.00' : null,
          total: numeric(totals.total),
          created_at: at,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const d = await crearDteFirmado(trx, {
        tipo: s.tipo,
        receptor,
        lineas,
        totals,
        actor: cajero,
        ventaId: venta.id,
        turnoId,
        pagos: [{ metodo: s.pago, monto: totals.total }],
        emitidoAt: at,
      });
      ids[s.key] = d.id;
      for (const l of lineas) {
        await applyMovement(trx, {
          productoId: l.productoId,
          tipo: 'VENTA',
          delta: -l.cantidad,
          dteId: d.id,
          usuarioId: ctx.cajeroId,
          at,
        });
      }
      await procesar(
        trx,
        d.id,
        s.final === 'RECHAZADO' ? 'RECHAZADO' : 'PROCESADO',
        at,
        s.tipo,
        totals.total,
      );
      if (s.final === 'INVALIDADO')
        await invalidar(trx, d.id, new Date(at.getTime() + 2 * H), admin, lineas);
    });
  }

  // NCE parcial sobre d8: devuelve 1 casco (PROCESADA, 1 día atrás).
  await db.transaction().execute(async (trx) => {
    const at = new Date(now - 20 * H);
    const orig = await trx
      .selectFrom('dte')
      .select([
        'id',
        'codigo_generacion',
        'cliente_id',
        'emitido_at',
        'turno_id',
        cents('gravado').as('gravado'),
        cents('iva').as('iva'),
        cents('retencion').as('retencion'),
        cents('total').as('total'),
      ])
      .where('id', '=', ids.d8!)
      .executeTakeFirstOrThrow();
    const ol = await trx
      .selectFrom('dte_linea')
      .select([
        'id',
        'producto_id',
        'codigo',
        'descripcion',
        'tipo_item',
        'cantidad',
        cents('precio_unitario').as('precio'),
      ])
      .where('dte_id', '=', orig.id)
      .execute();
    const casco = ol.find((l) => l.codigo === 'CAS-URB-0114')!;
    const t = computeNceTotals(
      { gravado: orig.gravado, iva: orig.iva, retencion: orig.retencion, total: orig.total },
      ol.map((l) => ({
        lineaId: l.id as string,
        cantidad: l.cantidad as number,
        precioUnitario: l.precio,
      })),
      [{ lineaId: casco.id as string, cantidad: 1 }],
    );
    const receptor = await loadReceptor(trx, orig.cliente_id);
    const d = await crearDteFirmado(trx, {
      tipo: '05',
      receptor,
      lineas: [
        {
          productoId: casco.producto_id,
          lineaOriginalId: casco.id,
          codigo: casco.codigo,
          descripcion: casco.descripcion,
          tipoItem: 'bien',
          cantidad: 1,
          precioUnitario: casco.precio,
          gravado: casco.precio,
        },
      ],
      totals: { gravado: t.gravado, iva: t.iva, retencion: t.retencion, total: t.total },
      actor: admin,
      referencedDteId: orig.id,
      documentoRelacionado: {
        tipo: '03',
        codigoGeneracion: orig.codigo_generacion,
        fechaEmision: new Date(orig.emitido_at).toLocaleDateString('en-CA', {
          timeZone: 'America/El_Salvador',
        }),
      },
      emitidoAt: at,
    });
    await applyMovement(trx, {
      productoId: casco.producto_id!,
      tipo: 'DEVOLUCION',
      delta: 1,
      dteId: d.id,
      usuarioId: ctx.adminId,
      at,
    });
    await procesar(trx, d.id, 'PROCESADO', at, '05', t.total);
  });
  // Fotografía del Corte Z de los turnos históricos.
  for (const turnoId of turnos.values()) {
    const corte = await calcularCorte(turnoId, null, db);
    const contado = corte.efectivoEsperado;
    await db
      .updateTable('turno_caja')
      .set({
        corte: JSON.stringify({ ...corte, efectivoContado: contado, diferencia: 0 }),
        efectivo_contado: numeric(contado),
      })
      .where('id', '=', turnoId)
      .execute();
  }
  return { dteIds: ids };
}

/** Simula el registro histórico del MH: sello en el DTE y documento en el esquema del simulador. */
async function procesar(
  trx: AnyDb,
  id: string,
  estado: 'PROCESADO' | 'RECHAZADO',
  at: Date,
  tipo: TipoDte,
  total: number,
) {
  const t1 = new Date(at.getTime() + 400);
  const d = await trx
    .selectFrom('dte')
    .select(['codigo_generacion', 'numero_control', 'json_original'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  await transition(trx, {
    dteId: id,
    to: 'TRANSMITIDO',
    actor: 'José Luis Hernández',
    motivo: 'Enviado al MH',
    set: { intentos_transmision: 1 },
    at: new Date(at.getTime() + 150),
  });
  if (estado === 'RECHAZADO') {
    const resp = {
      estado: 'RECHAZADO',
      codigoGeneracion: d.codigo_generacion,
      selloRecibido: null,
      fhProcesamiento: t1.toISOString(),
      codigoMsg: 'RCH-007',
      descripcionMsg: 'Rechazo forzado desde el panel de simulación: montos inconsistentes.',
      campo: 'resumen.totalPagar',
      observaciones: ['Documento semilla rechazado para demostrar la corrección.'],
    };
    await transition(trx, {
      dteId: id,
      to: 'RECHAZADO',
      actor: 'MH (simulado)',
      motivo: `${resp.codigoMsg}: ${resp.descripcionMsg}`,
      payload: resp,
      set: { respuesta_mh: JSON.stringify(resp) },
      at: t1,
    });
    return;
  }
  const s = sello();
  const resp = {
    estado: 'PROCESADO',
    codigoGeneracion: d.codigo_generacion,
    selloRecibido: s,
    fhProcesamiento: t1.toISOString(),
    codigoMsg: '001',
    descripcionMsg: 'RECIBIDO',
    observaciones: [],
  };
  await transition(trx, {
    dteId: id,
    to: 'PROCESADO',
    actor: 'MH (simulado)',
    motivo: 'Sello de recepción asignado',
    payload: resp,
    set: {
      sello_recepcion: s,
      fh_procesamiento: t1,
      procesado_at: t1,
      respuesta_mh: JSON.stringify(resp),
      pipeline_ms: 400 + randomInt(300),
    },
    at: t1,
  });
  await trx
    .withSchema('mh_sim')
    .insertInto('documento')
    .values({
      codigo_generacion: d.codigo_generacion,
      tipo_dte: tipo,
      numero_control: d.numero_control,
      nit_emisor: '0614-120598-102-3',
      estado: 'PROCESADO',
      sello_recepcion: s,
      fh_procesamiento: t1,
      fh_emision: fhEmision(at),
      total: numeric(total),
      json: JSON.stringify(d.json_original),
    })
    .execute();
}

async function invalidar(
  trx: AnyDb,
  id: string,
  at: Date,
  admin: AuthUser,
  lineas: Array<{ productoId: string; cantidad: number }>,
) {
  const d = await trx
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
    ahora: at,
    dte: {
      tipo: d.tipo,
      codigoGeneracion: d.codigo_generacion,
      sello: d.sello_recepcion!,
      numeroControl: d.numero_control,
      emitidoAt: new Date(d.emitido_at),
      ivaCents: d.iva,
    },
    motivoId: 1,
    observaciones: null,
    responsable: admin.nombre,
  });
  const jws = await signJson(json, trx);
  const s = sello();
  const resp = {
    estado: 'PROCESADO',
    codigoGeneracion: codigo,
    selloRecibido: s,
    fhProcesamiento: at.toISOString(),
    codigoMsg: '001',
    descripcionMsg: 'RECIBIDO',
  };
  await trx
    .insertInto('evento_invalidacion')
    .values({
      dte_id: id,
      codigo_generacion: codigo,
      motivo_id: 1,
      responsable_id: admin.id,
      observaciones: null,
      json: JSON.stringify(json),
      jws,
      sello: s,
      respuesta_mh: JSON.stringify(resp),
      created_at: at,
    })
    .execute();
  await transition(trx, {
    dteId: id,
    to: 'INVALIDADO',
    actor: admin.nombre,
    motivo: 'Error en la información del documento',
    payload: resp,
    at,
  });
  for (const l of lineas) {
    await applyMovement(trx, {
      productoId: l.productoId,
      tipo: 'REVERSION_INVALIDACION',
      delta: l.cantidad,
      dteId: id,
      usuarioId: admin.id,
      at,
    });
  }
  await trx
    .withSchema('mh_sim')
    .updateTable('documento')
    .set({ estado: 'INVALIDADO' })
    .where('codigo_generacion', '=', d.codigo_generacion)
    .execute();
  await trx
    .withSchema('mh_sim')
    .insertInto('anulacion')
    .values({
      codigo_generacion: codigo,
      documento_codigo_generacion: d.codigo_generacion,
      sello_recepcion: s,
      fh_procesamiento: at,
      json: JSON.stringify(json),
    })
    .execute();
}
