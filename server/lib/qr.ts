import QRCode from 'qrcode';
import { config } from '../config.js';
import { fecEmi } from '../dte/builders/common.js';

export type ConsultaPublica = {
  ambiente: string;
  codigoGeneracion: string;
  /** `YYYY-MM-DD` (tal como `identificacion.fecEmi`) o una fecha, que se lleva a la zona de El Salvador. */
  fechaEmision: string | Date;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * URL de consulta pública del DTE que se codifica en el QR (ZG-22).
 * Apunta por defecto al SIMULADOR del MH; el formato oficial está pendiente de validar.
 */
export function urlConsultaPublica(
  { ambiente, codigoGeneracion, fechaEmision }: ConsultaPublica,
  base: string = config.MH_CONSULTA_PUBLICA_URL,
): string {
  const fecha = typeof fechaEmision === 'string' ? fechaEmision : fecEmi(fechaEmision);
  if (!ISO_DATE.test(fecha)) throw new Error(`fechaEmision inválida: ${fecha}`);
  const url = new URL(base);
  url.searchParams.set('ambiente', ambiente);
  url.searchParams.set('codGen', codigoGeneracion);
  url.searchParams.set('fechaEmi', fecha);
  return url.toString();
}

/** QR como PNG. Corrección de errores M, sin márgenes extra: el PDF controla el tamaño. */
export function qrPng(texto: string, width = 300): Promise<Buffer> {
  return QRCode.toBuffer(texto, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width });
}
