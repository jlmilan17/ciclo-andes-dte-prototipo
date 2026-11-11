import PDFDocument from 'pdfkit';
import type { DteDetalle } from '../dte/repo.js';
import { qrPng, urlConsultaPublica } from '../lib/qr.js';

export function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export const money = (c: number | null | undefined) => {
  const v = c ?? 0;
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  return `${sign}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
};

export const fecha = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleString('es-SV', {
        timeZone: 'America/El_Salvador',
        dateStyle: 'short',
        timeStyle: 'medium',
      })
    : '—';

export const TIPO_NOMBRE: Record<string, string> = {
  '01': 'FACTURA DE CONSUMIDOR FINAL ELECTRÓNICA',
  '03': 'COMPROBANTE DE CRÉDITO FISCAL ELECTRÓNICO',
  '05': 'NOTA DE CRÉDITO ELECTRÓNICA',
};

/*
 * Etiquetas de los códigos que trae el JSON del DTE. Son supuestos de demostración (ZG-22):
 * pendientes de validar contra los catálogos oficiales del MH.
 */
const AMBIENTE: Record<string, string> = { '00': 'Pruebas', '01': 'Producción' };
const MODELO: Record<number, string> = { 1: 'Previo', 2: 'Diferido' };
const CONDICION: Record<number, string> = { 1: 'Contado', 2: 'A crédito', 3: 'Otro' };
const UNIDAD: Record<number, string> = { 59: 'Unidad', 99: 'Otra' };

type JsonDte = {
  identificacion?: {
    version?: number;
    ambiente?: string;
    tipoModelo?: number;
    fecEmi?: string;
    horEmi?: string;
  };
  cuerpoDocumento?: Array<{ numItem: number; uniMedida?: number }>;
  resumen?: { totalLetras?: string; condicionOperacion?: number };
};

const etiqueta = (cod: string | number | undefined, cat: Record<string | number, string>) =>
  cod === undefined || cod === null ? '—' : cat[cod] ? `${cod} · ${cat[cod]}` : String(cod);

/**
 * Datos de la representación gráfica que salen del JSON del DTE ya persistido (no se recalculan).
 * Excepción: el tipo de transmisión. El JSON se firma antes de saber si el MH responde, así que
 * siempre dice `tipoOperacion: 1`; la contingencia se lee del estado persistido (ZG-22).
 */
export function datosRepresentacion(d: DteDetalle) {
  const j = (d.json_original ?? {}) as JsonDte;
  const id = j.identificacion ?? {};
  const unidades = new Map((j.cuerpoDocumento ?? []).map((l) => [l.numItem, l.uniMedida]));
  const contingencia = d.estado === 'ENCOLADO' || d.lote_id !== null;
  return {
    ambiente: id.ambiente ?? '—',
    ambienteTxt: etiqueta(id.ambiente, AMBIENTE),
    version: id.version !== undefined ? String(id.version) : '—',
    modelo: etiqueta(id.tipoModelo, MODELO),
    transmision: contingencia ? 'Contingencia' : 'Normal',
    fechaEmision: id.fecEmi ?? '—',
    horaEmision: id.horEmi ?? '—',
    condicion: etiqueta(j.resumen?.condicionOperacion, CONDICION),
    totalLetras: j.resumen?.totalLetras ?? '—',
    uniMedida: (numItem: number) => {
      const u = unidades.get(numItem);
      return u === undefined ? '—' : (UNIDAD[u] ?? String(u));
    },
  };
}

/** QR hacia la consulta pública del SIMULADOR (ZG-22); null si el DTE aún no tiene JSON. */
export async function qrDte(d: DteDetalle): Promise<Buffer | null> {
  const id = (d.json_original as JsonDte | null)?.identificacion;
  if (!id?.ambiente || !id.fecEmi) return null;
  return qrPng(
    urlConsultaPublica({
      ambiente: id.ambiente,
      codigoGeneracion: d.codigo_generacion,
      fechaEmision: id.fecEmi,
    }),
  );
}

export { PDFDocument };
