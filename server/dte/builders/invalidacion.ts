import { EMISOR } from '../emisor.js';
import { invalidacionSchema, type InvalidacionJson } from '../schemas/dte.schema.js';
import { fecEmi, horEmi } from './common.js';

/** Evento de invalidación (estructura de demostración, ZG-11). */
export function buildInvalidacion(i: {
  codigoGeneracion: string;
  ahora: Date;
  dte: {
    tipo: '01' | '03' | '05';
    codigoGeneracion: string;
    sello: string;
    numeroControl: string;
    emitidoAt: Date;
    ivaCents: number;
  };
  motivoId: 1 | 2 | 3;
  observaciones: string | null;
  responsable: string;
}): InvalidacionJson {
  return invalidacionSchema.parse({
    identificacion: {
      version: 2,
      ambiente: '00',
      codigoGeneracion: i.codigoGeneracion,
      fecAnula: fecEmi(i.ahora),
      horAnula: horEmi(i.ahora),
    },
    emisor: {
      nit: EMISOR.nit,
      nombre: EMISOR.nombre,
      codEstableMH: EMISOR.codEstableMH,
      codPuntoVentaMH: EMISOR.codPuntoVentaMH,
    },
    documento: {
      tipoDte: i.dte.tipo,
      codigoGeneracion: i.dte.codigoGeneracion,
      selloRecibido: i.dte.sello,
      numeroControl: i.dte.numeroControl,
      fecEmi: fecEmi(i.dte.emitidoAt),
      montoIva: i.dte.ivaCents / 100,
    },
    motivo: {
      tipoAnulacion: i.motivoId,
      motivoAnulacion: i.observaciones,
      nombreResponsable: i.responsable,
      nombreSolicita: i.responsable,
    },
  });
}
