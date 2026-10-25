/** Empresa emisora ficticia (sección 1). */
export const EMISOR = {
  nit: '0614-120598-102-3',
  nrc: '245891-8',
  nombre: 'Ciclo Andes, S.A. de C.V.',
  nombreComercial: 'Ciclo Andes',
  codActividad: '47722',
  descActividad: 'Venta al por menor de bicicletas, repuestos y accesorios',
  tipoEstablecimiento: '02',
  direccion: {
    departamento: '06',
    municipio: '14',
    complemento: 'Calle La Mascota 245, San Salvador',
  },
  telefono: '2264-1010',
  correo: 'facturacion@cicloandes.test',
  codEstableMH: 'M001',
  codPuntoVentaMH: 'P001',
} as const;

/** Credencial del API del simulador (no es una credencial real). */
export const MH_API_KEY = process.env.MH_API_KEY ?? 'clave-demo-ciclo-andes';
