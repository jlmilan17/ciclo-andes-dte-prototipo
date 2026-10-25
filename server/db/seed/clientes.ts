import type { AnyDb } from '../types.js';
import { rng } from './rng.js';

type Tipo = 'GRANDE' | 'NORMAL' | 'CONSUMIDOR_FINAL';
type Cli = {
  razon_social: string;
  nit?: string;
  nrc?: string;
  dui?: string;
  giro?: string;
  tipo_contribuyente: Tipo;
  activo?: boolean;
  es_consumidor_final_generico?: boolean;
  correo?: string;
  departamento?: string;
  municipio?: string;
  direccion?: string;
  telefono?: string;
};

/** Clientes de la sección 13. */
export const CLIENTES_BASE: Cli[] = [
  {
    razon_social: 'Rutas del Pacífico, S.A. de C.V.',
    nit: '0614-030417-103-8',
    nrc: '189234-5',
    giro: 'Servicios de turismo de aventura',
    tipo_contribuyente: 'GRANDE',
    correo: 'compras@rutaspacifico.test',
    departamento: 'La Libertad',
    municipio: 'La Libertad',
    direccion: 'Carretera del Litoral km 34',
    telefono: '2335-1180',
  },
  {
    razon_social: 'Taller Bici Norte',
    nit: '0614-221199-101-2',
    nrc: '302118-7',
    giro: 'Reparación de bicicletas',
    tipo_contribuyente: 'NORMAL',
    correo: 'taller@bicinorte.test',
    departamento: 'San Salvador',
    municipio: 'Apopa',
    direccion: 'Calle principal 12',
    telefono: '2216-4410',
  },
  {
    razon_social: 'Ciclismo Escolar Los Planes',
    nit: '0614-140820-105-1',
    nrc: '418902-3',
    giro: 'Enseñanza deportiva',
    tipo_contribuyente: 'NORMAL',
    correo: 'admin@losplanes.test',
    departamento: 'San Salvador',
    municipio: 'Panchimalco',
    direccion: 'Los Planes de Renderos',
    telefono: '2280-0912',
  },
  {
    razon_social: 'Distribuidora Pedal Sur',
    nit: '0614-090316-108-4',
    nrc: '205673-1',
    giro: 'Comercio al por mayor',
    tipo_contribuyente: 'GRANDE',
    correo: 'facturas@pedalsur.test',
    departamento: 'San Miguel',
    municipio: 'San Miguel',
    direccion: 'Av. Roosevelt 450',
    telefono: '2661-3300',
  },
  {
    razon_social: 'Bici Tours El Boquerón',
    nit: '0614-271121-102-9',
    nrc: '390455-6',
    giro: 'Turismo local',
    tipo_contribuyente: 'NORMAL',
    activo: false,
    departamento: 'La Libertad',
    municipio: 'Santa Tecla',
    direccion: 'Parque El Boquerón',
  },
  {
    razon_social: 'Consumidor final',
    dui: '04521987-3',
    tipo_contribuyente: 'CONSUMIDOR_FINAL',
    es_consumidor_final_generico: true,
  },
];

/** NRC inexistente documentado para demostrar el bloqueo de la regla 5. */
export const NRC_INEXISTENTE = '999999-9';

const NOMBRES = [
  'María',
  'José',
  'Ana',
  'Carlos',
  'Lucía',
  'Jorge',
  'Sofía',
  'Mario',
  'Gabriela',
  'Ricardo',
  'Elena',
  'Fernando',
  'Patricia',
  'Óscar',
  'Daniel',
  'Karla',
];
const APELLIDOS = [
  'Martínez',
  'Hernández',
  'López',
  'Rivas',
  'Flores',
  'Castillo',
  'Mejía',
  'Rodríguez',
  'Alvarado',
  'Portillo',
  'Guzmán',
  'Ramos',
  'Cruz',
  'Orellana',
];
const EMPRESAS = [
  'Ciclo',
  'Ruta',
  'Pedal',
  'Montaña',
  'Volcán',
  'Lago',
  'Sendero',
  'Rueda',
  'Cadena',
  'Piñón',
];
const RUBROS = [
  ['Club Deportivo', 'Actividades deportivas'],
  ['Tours', 'Turismo local'],
  ['Mensajería', 'Servicios de mensajería'],
  ['Repuestos', 'Comercio al por menor'],
  ['Academia', 'Enseñanza deportiva'],
  ['Hotel', 'Alojamiento'],
] as const;
const DEPTOS = [
  ['San Salvador', 'San Salvador'],
  ['La Libertad', 'Santa Tecla'],
  ['Santa Ana', 'Santa Ana'],
  ['San Miguel', 'San Miguel'],
  ['Sonsonate', 'Sonsonate'],
  ['La Paz', 'Zacatecoluca'],
] as const;

export function generarClientes(n = 80): Cli[] {
  const r = rng(87);
  const out: Cli[] = [];
  const pad = (x: number, l: number) => String(x).padStart(l, '0');
  for (let i = 0; i < n; i++) {
    const [depto, muni] = r.pick(DEPTOS);
    if (i % 2 === 0) {
      const [pref, giro] = r.pick(RUBROS);
      const nombre = `${pref} ${r.pick(EMPRESAS)} ${r.pick(['Norte', 'Sur', 'Oriente', 'Occidente', 'Central'])} ${i + 1}`;
      out.push({
        razon_social: r.next() < 0.5 ? `${nombre}, S.A. de C.V.` : nombre,
        nit: `0614-${pad(r.int(10101, 311299), 6)}-${pad(110 + i, 3)}-${r.int(0, 9)}`,
        nrc: `${5000 + i * 37}-${r.int(0, 9)}`,
        giro,
        tipo_contribuyente: r.next() < 0.15 ? 'GRANDE' : 'NORMAL',
        departamento: depto,
        municipio: muni,
        direccion: `Colonia ${r.pick(APELLIDOS)}, casa ${r.int(1, 99)}`,
        telefono: `2${r.int(100, 999)}-${pad(r.int(0, 9999), 4)}`,
        correo: `contacto${i + 1}@cliente.test`,
      });
    } else {
      out.push({
        razon_social: `${r.pick(NOMBRES)} ${r.pick(APELLIDOS)} ${r.pick(APELLIDOS)}`,
        dui: `${pad(r.int(1000000, 69999999), 8)}-${r.int(0, 9)}`,
        tipo_contribuyente: 'CONSUMIDOR_FINAL',
        departamento: depto,
        municipio: muni,
        telefono: `7${r.int(100, 999)}-${pad(r.int(0, 9999), 4)}`,
        correo: r.next() < 0.5 ? `cliente${i + 1}@correo.test` : undefined,
      });
    }
  }
  return out;
}

export async function seedClientes(db: AnyDb, opts: { minimal?: boolean } = {}) {
  const clientes = [...CLIENTES_BASE, ...(opts.minimal ? [] : generarClientes())];
  const padron = clientes
    .filter((c) => c.nrc)
    .map((c) => ({ nrc: c.nrc!, razon_social: c.razon_social, activo: true }));
  // NRC válidos de contribuyentes aún no registrados como clientes (para demostrar el alta).
  padron.push(
    { nrc: '512340-7', razon_social: 'Bicicletas Usulután, S.A. de C.V.', activo: true },
    { nrc: '611208-2', razon_social: 'Gimnasio Ciclo Fuerte', activo: true },
  );
  await db.insertInto('padron_nrc').values(padron).execute();
  const rows = await db
    .insertInto('cliente')
    .values(clientes.map((c) => ({ activo: true, es_consumidor_final_generico: false, ...c })))
    .returning(['id', 'razon_social'])
    .execute();
  return {
    clienteIdByNombre: Object.fromEntries(rows.map((r) => [r.razon_social, r.id as string])),
  };
}
