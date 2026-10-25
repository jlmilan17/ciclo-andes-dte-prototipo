export type TipoContribuyente = 'GRANDE' | 'NORMAL' | 'CONSUMIDOR_FINAL';

export type Cliente = {
  id: string;
  nit: string | null;
  nrc: string | null;
  dui: string | null;
  razon_social: string;
  nombre_comercial: string | null;
  giro: string | null;
  tipo_contribuyente: TipoContribuyente;
  departamento: string | null;
  municipio: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  activo: boolean;
  es_consumidor_final_generico: boolean;
};

export const TIPO_LABEL: Record<TipoContribuyente, string> = {
  GRANDE: 'Gran contribuyente',
  NORMAL: 'Contribuyente',
  CONSUMIDOR_FINAL: 'Consumidor final',
};

export const docId = (c: Pick<Cliente, 'nit' | 'nrc' | 'dui'>) =>
  c.nrc ? `NRC ${c.nrc}` : c.nit ? `NIT ${c.nit}` : c.dui ? `DUI ${c.dui}` : '—';
