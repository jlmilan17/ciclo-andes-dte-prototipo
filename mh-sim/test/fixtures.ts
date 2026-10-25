import { randomUUID } from 'node:crypto';
import { db } from '../../server/db/database.js';
import { seedAll } from '../../server/db/seed/index.js';
import { EMISOR, MH_API_KEY } from '../../server/dte/emisor.js';
import { signJson } from '../../server/dte/signer.js';

export const seed = () => seedAll(db, { minimal: true });
export const uuid = () => randomUUID().toUpperCase();

let seq = 1;
/** DTE de prueba armado a mano (la entrega 08 agrega los constructores reales). */
export function dte(
  tipo: '01' | '03' | '05' = '03',
  over: { nrc?: string; ref?: string; total?: number } = {},
) {
  const cg = uuid();
  const now = new Date();
  const contrib = tipo !== '01';
  return {
    identificacion: {
      version: 3,
      ambiente: '00',
      tipoDte: tipo,
      numeroControl: `DTE-${tipo}-M001P001-${String(seq++).padStart(15, '0')}`,
      codigoGeneracion: cg,
      tipoModelo: 1,
      tipoOperacion: 1,
      tipoContingencia: null,
      motivoContin: null,
      fecEmi: now.toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' }),
      horEmi: now.toLocaleTimeString('en-GB', { timeZone: 'America/El_Salvador' }),
      tipoMoneda: 'USD',
    },
    documentoRelacionado: over.ref
      ? [
          {
            tipoDocumento: '03',
            tipoGeneracion: 2,
            numeroDocumento: over.ref,
            fechaEmision: '2026-10-20',
          },
        ]
      : null,
    emisor: { ...EMISOR, direccion: { ...EMISOR.direccion } },
    receptor: contrib
      ? {
          nit: '0614-030417-103-8',
          nrc: over.nrc ?? '189234-5',
          nombre: 'Rutas del Pacífico, S.A. de C.V.',
          descActividad: 'Turismo',
          direccion: null,
          telefono: null,
          correo: null,
        }
      : { tipoDocumento: null, numDocumento: null, nombre: 'Consumidor final', correo: null },
    cuerpoDocumento: [
      {
        numItem: 1,
        tipoItem: 1,
        codigo: 'BIC-URB-0260',
        descripcion: 'Bicicleta',
        cantidad: 2,
        uniMedida: 59,
        precioUni: 235,
        montoDescu: 0,
        ventaGravada: 470,
      },
    ],
    resumen: {
      totalGravada: 470,
      subTotal: 470,
      tributos: [{ codigo: '20', descripcion: 'IVA 13%', valor: 61.1 }],
      ivaRete1: contrib ? 4.7 : 0,
      montoTotalOperacion: contrib ? 526.4 : 531.1,
      totalPagar: over.total ?? (contrib ? 526.4 : 531.1),
      totalLetras: 'QUINIENTOS VEINTISÉIS 40/100 USD',
      condicionOperacion: 1,
      pagos: null,
    },
    extension: null,
    apendice: null,
  };
}

export async function envio(doc: ReturnType<typeof dte>) {
  return {
    tipoDte: doc.identificacion.tipoDte,
    codigoGeneracion: doc.identificacion.codigoGeneracion,
    documento: await signJson(doc),
  };
}

export const credenciales = { user: EMISOR.nit, pwd: MH_API_KEY };
