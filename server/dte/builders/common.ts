import { centsToNumber, type Cents } from '../../domain/money.js';
import type { TipoDte, Totals } from '../../domain/tax.js';
import { montoEnLetras } from '../../lib/letras.js';
import { EMISOR } from '../emisor.js';
import { dteSchema, type DteJson } from '../schemas/dte.schema.js';

export type ReceptorData = {
  tipo_contribuyente: 'GRANDE' | 'NORMAL' | 'CONSUMIDOR_FINAL';
  razon_social: string;
  nit: string | null;
  nrc: string | null;
  dui: string | null;
  giro: string | null;
  departamento: string | null;
  municipio: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
};

export type LineaData = {
  codigo: string;
  descripcion: string;
  tipoItem: 'bien' | 'servicio';
  cantidad: number;
  precioUnitario: Cents;
  gravado: Cents;
};

export type BuildInput = {
  tipo: TipoDte;
  numeroControl: string;
  codigoGeneracion: string;
  emitidoAt: Date;
  receptor: ReceptorData;
  lineas: LineaData[];
  totals: Totals;
  pagos?: Array<{ metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'; monto: Cents }>;
  documentoRelacionado?: { tipo: '01' | '03'; codigoGeneracion: string; fechaEmision: string };
};

const TZ = 'America/El_Salvador';
export const fecEmi = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
export const horEmi = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false });

const PAGO: Record<string, string> = { EFECTIVO: '01', TARJETA: '02', TRANSFERENCIA: '05' };

function receptorJson(tipo: TipoDte, r: ReceptorData): DteJson['receptor'] {
  if (tipo === '01') {
    return {
      tipoDocumento: r.dui ? '13' : r.nit ? '36' : null,
      numDocumento: r.dui ?? r.nit ?? null,
      nombre: r.razon_social,
      correo: r.correo,
    };
  }
  return {
    nit: r.nit!,
    nrc: r.nrc!,
    nombre: r.razon_social,
    descActividad: r.giro ?? '',
    direccion: r.direccion
      ? {
          departamento: r.departamento ?? '',
          municipio: r.municipio ?? '',
          complemento: r.direccion,
        }
      : null,
    telefono: r.telefono,
    correo: r.correo,
  };
}

/**
 * Construye el JSON del DTE (estructura de demostración, ZG-11) y lo valida contra el esquema.
 * FCFE, CCFE y NCE comparten estructura; difieren en receptor, retención y documento relacionado.
 */
export function buildDteJson(i: BuildInput): DteJson {
  const t = i.totals;
  const json = {
    identificacion: {
      version: 3,
      ambiente: '00' as const,
      tipoDte: i.tipo,
      numeroControl: i.numeroControl,
      codigoGeneracion: i.codigoGeneracion,
      tipoModelo: 1 as const,
      tipoOperacion: 1 as const,
      tipoContingencia: null,
      motivoContin: null,
      fecEmi: fecEmi(i.emitidoAt),
      horEmi: horEmi(i.emitidoAt),
      tipoMoneda: 'USD' as const,
    },
    documentoRelacionado: i.documentoRelacionado
      ? [
          {
            tipoDocumento: i.documentoRelacionado.tipo,
            tipoGeneracion: 2 as const,
            numeroDocumento: i.documentoRelacionado.codigoGeneracion,
            fechaEmision: i.documentoRelacionado.fechaEmision,
          },
        ]
      : null,
    emisor: { ...EMISOR, direccion: { ...EMISOR.direccion } },
    receptor: receptorJson(i.tipo, i.receptor),
    cuerpoDocumento: i.lineas.map((l, idx) => ({
      numItem: idx + 1,
      tipoItem: l.tipoItem === 'servicio' ? (2 as const) : (1 as const),
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      uniMedida: l.tipoItem === 'servicio' ? 99 : 59,
      precioUni: centsToNumber(l.precioUnitario),
      montoDescu: 0,
      ventaGravada: centsToNumber(l.gravado),
    })),
    resumen: {
      totalGravada: centsToNumber(t.gravado),
      subTotal: centsToNumber(t.gravado),
      tributos: [
        {
          codigo: '20',
          descripcion: 'Impuesto al Valor Agregado 13%',
          valor: centsToNumber(t.iva),
        },
      ],
      ivaRete1: centsToNumber(t.retencion),
      montoTotalOperacion: centsToNumber(t.gravado + t.iva),
      totalPagar: centsToNumber(t.total),
      totalLetras: montoEnLetras(t.total),
      condicionOperacion: 1,
      pagos: i.pagos?.length
        ? i.pagos.map((p) => ({ codigo: PAGO[p.metodo]!, montoPago: centsToNumber(p.monto) }))
        : null,
    },
    extension: null,
    apendice: [
      {
        campo: 'demo',
        etiqueta: 'Aviso',
        valor: 'Documento de demostración. Estructura no oficial.',
      },
    ],
  };
  return dteSchema.parse(json);
}
