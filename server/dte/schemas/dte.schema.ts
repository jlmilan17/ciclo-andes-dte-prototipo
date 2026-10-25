import { z } from 'zod';

/**
 * ESTRUCTURA DE DEMOSTRACIÓN (ZG-11). Inspirada en los DTE salvadoreños, pero NO se afirma
 * conformidad con el esquema oficial del Ministerio de Hacienda. Ajustar contra la
 * documentación técnica oficial antes de cualquier uso real.
 */
const monto = z.number().multipleOf(0.01).min(0);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hora = z.string().regex(/^\d{2}:\d{2}:\d{2}$/);
const uuid = z
  .string()
  .regex(
    /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/,
    'codigoGeneracion inválido',
  );
const direccion = z.object({
  departamento: z.string(),
  municipio: z.string(),
  complemento: z.string(),
});

export const identificacionSchema = z.object({
  version: z.number().int(),
  ambiente: z.literal('00'),
  tipoDte: z.enum(['01', '03', '05']),
  numeroControl: z.string().regex(/^DTE-(01|03|05)-[A-Z0-9]{8}-\d{15}$/, 'numeroControl inválido'),
  codigoGeneracion: uuid,
  tipoModelo: z.union([z.literal(1), z.literal(2)]),
  tipoOperacion: z.union([z.literal(1), z.literal(2)]),
  tipoContingencia: z.number().int().nullable(),
  motivoContin: z.string().nullable(),
  fecEmi: fecha,
  horEmi: hora,
  tipoMoneda: z.literal('USD'),
});

export const emisorSchema = z.object({
  nit: z.string(),
  nrc: z.string(),
  nombre: z.string(),
  codActividad: z.string(),
  descActividad: z.string(),
  nombreComercial: z.string().nullable(),
  tipoEstablecimiento: z.string(),
  direccion,
  telefono: z.string(),
  correo: z.string(),
  codEstableMH: z.string(),
  codPuntoVentaMH: z.string(),
});

const receptorContribuyente = z.object({
  nit: z.string().regex(/^\d{4}-\d{6}-\d{3}-\d$/),
  nrc: z.string().regex(/^\d{1,7}-\d$/),
  nombre: z.string().min(1),
  descActividad: z.string().min(1),
  direccion: direccion.nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
});

const receptorConsumidor = z.object({
  tipoDocumento: z.enum(['13', '36']).nullable(),
  numDocumento: z.string().nullable(),
  nombre: z.string().min(1),
  correo: z.string().nullable(),
});

export const itemSchema = z.object({
  numItem: z.number().int().positive(),
  tipoItem: z.union([z.literal(1), z.literal(2)]),
  codigo: z.string(),
  descripcion: z.string().min(1),
  cantidad: z.number().int().positive(),
  uniMedida: z.number().int(),
  precioUni: monto,
  montoDescu: monto,
  ventaGravada: monto,
});

export const resumenSchema = z.object({
  totalGravada: monto,
  subTotal: monto,
  tributos: z.array(z.object({ codigo: z.string(), descripcion: z.string(), valor: monto })),
  ivaRete1: monto,
  montoTotalOperacion: monto,
  totalPagar: monto,
  totalLetras: z.string(),
  condicionOperacion: z.number().int(),
  pagos: z.array(z.object({ codigo: z.string(), montoPago: monto })).nullable(),
});

export const documentoRelacionadoSchema = z.object({
  tipoDocumento: z.enum(['01', '03']),
  tipoGeneracion: z.literal(2),
  numeroDocumento: uuid,
  fechaEmision: fecha,
});

export const dteSchema = z
  .object({
    identificacion: identificacionSchema,
    documentoRelacionado: z.array(documentoRelacionadoSchema).nullable(),
    emisor: emisorSchema,
    receptor: z.union([receptorContribuyente, receptorConsumidor]),
    cuerpoDocumento: z.array(itemSchema).min(1),
    resumen: resumenSchema,
    extension: z.null(),
    apendice: z
      .array(z.object({ campo: z.string(), etiqueta: z.string(), valor: z.string() }))
      .nullable(),
  })
  .superRefine((d, ctx) => {
    const tipo = d.identificacion.tipoDte;
    if ((tipo === '03' || tipo === '05') && !('nrc' in d.receptor)) {
      ctx.addIssue({
        code: 'custom',
        path: ['receptor', 'nrc'],
        message: 'El CCFE/NCE requiere receptor contribuyente con NRC.',
      });
    }
    if (tipo === '05' && !d.documentoRelacionado?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['documentoRelacionado'],
        message: 'La NCE debe referenciar el documento original.',
      });
    }
    const r = d.resumen;
    const iva = r.tributos.reduce((a, t) => a + Math.round(t.valor * 100), 0);
    const esperado = Math.round(r.totalGravada * 100) + iva - Math.round(r.ivaRete1 * 100);
    if (esperado !== Math.round(r.totalPagar * 100)) {
      ctx.addIssue({
        code: 'custom',
        path: ['resumen', 'totalPagar'],
        message: 'totalPagar no coincide con gravado + IVA − retención.',
      });
    }
  });

export type DteJson = z.infer<typeof dteSchema>;

/** Evento de invalidación (estructura de demostración, ZG-11). */
export const invalidacionSchema = z.object({
  identificacion: z.object({
    version: z.number().int(),
    ambiente: z.literal('00'),
    codigoGeneracion: uuid,
    fecAnula: fecha,
    horAnula: hora,
  }),
  emisor: z.object({
    nit: z.string(),
    nombre: z.string(),
    codEstableMH: z.string(),
    codPuntoVentaMH: z.string(),
  }),
  documento: z.object({
    tipoDte: z.enum(['01', '03', '05']),
    codigoGeneracion: uuid,
    selloRecibido: z.string().min(10),
    numeroControl: z.string(),
    fecEmi: fecha,
    montoIva: monto,
  }),
  motivo: z.object({
    tipoAnulacion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    motivoAnulacion: z.string().nullable(),
    nombreResponsable: z.string(),
    nombreSolicita: z.string(),
  }),
});

export type InvalidacionJson = z.infer<typeof invalidacionSchema>;
