import { divHalfUp, type Cents } from './money.js';

export const IVA_RATE_PERCENT = 13;
export const RETENTION_RATE_PERCENT = 1;
/** Umbral de retención: gravado estrictamente mayor a $100.00. */
export const RETENTION_THRESHOLD: Cents = 10000;

export type TipoDte = '01' | '03' | '05';
export type TipoContribuyente = 'GRANDE' | 'NORMAL' | 'CONSUMIDOR_FINAL';

export type TaxLine = { cantidad: number; precioUnitario: Cents };

export type TaxInput = {
  tipo: TipoDte;
  lineas: TaxLine[];
  receptor: TipoContribuyente;
  /** ZG-06: a quién se exige ser Gran Contribuyente. Por defecto, al receptor. */
  retentionAppliesTo?: 'receptor' | 'emisor';
  emisorGranContribuyente?: boolean;
};

export type Totals = { gravado: Cents; iva: Cents; retencion: Cents; total: Cents };

export function lineGravado(l: TaxLine): Cents {
  if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) throw new RangeError('Cantidad inválida');
  return l.cantidad * l.precioUnitario;
}

export function retentionApplies(input: Omit<TaxInput, 'lineas'>, gravado: Cents): boolean {
  // FCFE (01) nunca lleva retención (ZG-02).
  if (input.tipo === '01') return false;
  const gc =
    (input.retentionAppliesTo ?? 'receptor') === 'receptor'
      ? input.receptor === 'GRANDE'
      : input.emisorGranContribuyente === true;
  return gc && gravado > RETENTION_THRESHOLD;
}

/**
 * Motor tributario (RF-CCFE-01/02, reglas 1–3, ZG-12): IVA 13% y retención 1% sobre el gravado
 * total del documento, redondeo half-up a centavos. Total = gravado + IVA − retención.
 */
export function computeTotals(input: TaxInput): Totals {
  const gravado = input.lineas.reduce((acc, l) => acc + lineGravado(l), 0);
  const iva = divHalfUp(gravado * IVA_RATE_PERCENT, 100);
  const retencion = retentionApplies(input, gravado)
    ? divHalfUp(gravado * RETENTION_RATE_PERCENT, 100)
    : 0;
  return { gravado, iva, retencion, total: gravado + iva - retencion };
}

/** Tipo de documento derivado del receptor (PRT-POS-05). */
export function tipoForReceptor(receptor: TipoContribuyente): TipoDte {
  return receptor === 'CONSUMIDOR_FINAL' ? '01' : '03';
}
