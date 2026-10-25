import { db } from '../db/database.js';
import { notFound } from '../lib/errors.js';
import { cents } from '../lib/sql.js';

/** Detalle completo de un DTE para la UI, PDF y ticket. Montos en centavos. */
export async function loadDte(id: string) {
  const d = await db
    .selectFrom('dte as d')
    .leftJoin('venta as v', 'v.id', 'd.venta_id')
    .leftJoin('usuario as u', 'u.id', 'd.emitido_por')
    .leftJoin('turno_caja as t', 't.id', 'd.turno_id')
    .leftJoin('caja as c', 'c.id', 't.caja_id')
    .leftJoin('dte as ref', 'ref.id', 'd.referenced_dte_id')
    .leftJoin('dte as cor', 'cor.id', 'd.corrige_dte_id')
    .select([
      'd.id',
      'd.tipo',
      'd.numero_control',
      'd.codigo_generacion',
      'd.estado',
      'd.cliente_id',
      'd.receptor',
      'd.sello_recepcion',
      'd.fh_procesamiento',
      'd.respuesta_mh',
      'd.emitido_at',
      'd.procesado_at',
      'd.intentos_transmision',
      'd.pipeline_ms',
      'd.lote_id',
      'd.venta_id',
      'd.referenced_dte_id',
      'd.corrige_dte_id',
      cents('d.gravado').as('gravado'),
      cents('d.iva').as('iva'),
      cents('d.retencion').as('retencion'),
      cents('d.total').as('total'),
      'v.metodo_pago',
      cents('v.efectivo_recibido').as('efectivo_recibido'),
      cents('v.vuelto').as('vuelto'),
      'u.nombre as emitido_por',
      'c.codigo as caja',
      'ref.numero_control as ref_numero_control',
      'ref.codigo_generacion as ref_codigo_generacion',
      'cor.numero_control as corrige_numero_control',
    ])
    .where('d.id', '=', id)
    .executeTakeFirst();
  if (!d) throw notFound('DTE');
  const lineas = await db
    .selectFrom('dte_linea')
    .select([
      'id',
      'num_item',
      'producto_id',
      'linea_original_id',
      'codigo',
      'descripcion',
      'tipo_item',
      'cantidad',
      cents('precio_unitario').as('precio_unitario'),
      cents('gravado').as('gravado'),
    ])
    .where('dte_id', '=', id)
    .orderBy('num_item')
    .execute();
  return { ...d, lineas };
}

export type DteDetalle = Awaited<ReturnType<typeof loadDte>>;
