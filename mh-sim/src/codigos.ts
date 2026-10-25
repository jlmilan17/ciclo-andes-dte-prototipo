/** Catálogo de rechazos del simulador (códigos propios de la demostración, no oficiales). */
export const CODIGOS_RECHAZO = {
  'RCH-001': {
    descripcion: 'Firma electrónica inválida o no verificable con el certificado registrado.',
    campo: 'firma',
  },
  'RCH-002': { descripcion: 'La estructura del documento no cumple el esquema.', campo: null },
  'RCH-003': {
    descripcion: 'El codigoGeneracion ya fue recibido con otro contenido (duplicado).',
    campo: 'identificacion.codigoGeneracion',
  },
  'RCH-004': {
    descripcion: 'El NRC del receptor no está registrado en el padrón.',
    campo: 'receptor.nrc',
  },
  'RCH-005': {
    descripcion: 'El documento relacionado no existe o no ha sido sellado.',
    campo: 'documentoRelacionado',
  },
  'RCH-006': {
    descripcion: 'El documento está fuera del plazo de invalidación.',
    campo: 'documento.codigoGeneracion',
  },
  'RCH-007': {
    descripcion: 'Rechazo forzado desde el panel de simulación: montos inconsistentes.',
    campo: 'resumen.totalPagar',
  },
  'RCH-008': {
    descripcion: 'El emisor no está autorizado o el token es inválido.',
    campo: 'emisor.nit',
  },
} as const;

export type CodigoRechazo = keyof typeof CODIGOS_RECHAZO;
export const isCodigo = (c: string): c is CodigoRechazo => c in CODIGOS_RECHAZO;
