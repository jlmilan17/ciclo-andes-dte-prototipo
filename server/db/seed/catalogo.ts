import { toCents } from '../../domain/money.js';
import { numeric } from '../../lib/sql.js';
import { rng } from './rng.js';
import type { AnyDb } from '../types.js';

type Prod = {
  sku: string;
  nombre: string;
  categoria: string;
  tipo: 'bien' | 'servicio';
  costo: number;
  precio: number;
  stock: number;
  stock_minimo: number;
  codigo_barras?: string;
};

/** Los 9 productos de la sección 13 (precios netos, sin IVA). */
export const CATALOGO_BASE: Prod[] = [
  {
    sku: 'BIC-MTB-0290',
    nombre: 'Bicicleta MTB Trailhawk 29" talla M',
    categoria: 'Bicicletas',
    tipo: 'bien',
    costo: toCents('268.00'),
    precio: toCents('415.00'),
    stock: 12,
    stock_minimo: 3,
  },
  {
    sku: 'BIC-RUT-0700',
    nombre: 'Bicicleta de ruta Velodry 700c talla 54',
    categoria: 'Bicicletas',
    tipo: 'bien',
    costo: toCents('392.00'),
    precio: toCents('610.00'),
    stock: 4,
    stock_minimo: 5,
  },
  {
    sku: 'BIC-URB-0260',
    nombre: 'Bicicleta urbana Sendero 26"',
    categoria: 'Bicicletas',
    tipo: 'bien',
    costo: toCents('148.00'),
    precio: toCents('235.00'),
    stock: 18,
    stock_minimo: 4,
  },
  {
    sku: 'CAS-URB-0114',
    nombre: 'Casco urbano Orbea talla L',
    categoria: 'Accesorios',
    tipo: 'bien',
    costo: toCents('22.50'),
    precio: toCents('38.00'),
    stock: 26,
    stock_minimo: 6,
  },
  {
    sku: 'LUZ-LED-0055',
    nombre: 'Juego de luces LED recargables',
    categoria: 'Accesorios',
    tipo: 'bien',
    costo: toCents('9.40'),
    precio: toCents('16.00'),
    stock: 24,
    stock_minimo: 6,
    codigo_barras: '7421000550551',
  },
  {
    sku: 'CAD-9V-0210',
    nombre: 'Cadena 9 velocidades KMC',
    categoria: 'Repuestos',
    tipo: 'bien',
    costo: toCents('11.20'),
    precio: toCents('19.50'),
    stock: 7,
    stock_minimo: 8,
  },
  {
    sku: 'CAM-MTB-0029',
    nombre: 'Cámara 29" válvula Presta',
    categoria: 'Repuestos',
    tipo: 'bien',
    costo: toCents('2.80'),
    precio: toCents('5.50'),
    stock: 140,
    stock_minimo: 30,
    codigo_barras: '7421000290291',
  },
  {
    sku: 'POR-ALU-0032',
    nombre: 'Portabultos trasero de aluminio',
    categoria: 'Accesorios',
    tipo: 'bien',
    costo: toCents('14.00'),
    precio: toCents('26.00'),
    stock: 0,
    stock_minimo: 3,
  },
  {
    sku: 'SER-MAN-0001',
    nombre: 'Mantenimiento preventivo',
    categoria: 'Servicios',
    tipo: 'servicio',
    costo: 0,
    precio: toCents('25.00'),
    stock: 0,
    stock_minimo: 0,
  },
];

const FAMILIAS = [
  {
    pre: 'BIC',
    cat: 'Bicicletas',
    costo: [9000, 52000],
    items: [
      'Bicicleta MTB Cumbre 27.5"',
      'Bicicleta infantil Pecas 20"',
      'Bicicleta plegable Metro 20"',
      'Bicicleta gravel Volcán 700c',
      'Bicicleta urbana Paseo 28"',
      'Bicicleta BMX Rampa 20"',
    ],
    tallas: ['S', 'M', 'L'],
  },
  {
    pre: 'CAS',
    cat: 'Accesorios',
    costo: [1200, 6500],
    items: ['Casco MTB Ridge', 'Casco de ruta Aero', 'Casco infantil Mini'],
    tallas: ['S', 'M', 'L'],
  },
  {
    pre: 'GUA',
    cat: 'Ropa',
    costo: [450, 2800],
    items: ['Guantes de gel', 'Guantes dedo completo', 'Guantes de invierno'],
    tallas: ['S', 'M', 'L', 'XL'],
  },
  {
    pre: 'JER',
    cat: 'Ropa',
    costo: [1400, 4200],
    items: ['Jersey manga corta Andes', 'Jersey manga larga Ruta', 'Chaleco cortaviento'],
    tallas: ['S', 'M', 'L', 'XL'],
  },
  {
    pre: 'LLA',
    cat: 'Repuestos',
    costo: [900, 4800],
    items: ['Llanta MTB 29x2.25', 'Llanta ruta 700x25', 'Llanta urbana 26x1.95', 'Llanta 27.5x2.4'],
  },
  {
    pre: 'FRE',
    cat: 'Repuestos',
    costo: [350, 6200],
    items: [
      'Pastillas de freno orgánicas',
      'Pastillas de freno metálicas',
      'Disco de freno 160 mm',
      'Disco de freno 180 mm',
      'Cable de freno inoxidable',
    ],
  },
  {
    pre: 'TRA',
    cat: 'Repuestos',
    costo: [600, 9800],
    items: [
      'Piñón 11-42 11v',
      'Plato 32T',
      'Desviador trasero 9v',
      'Cambiador de manubrio 9v',
      'Pedalier BSA',
    ],
  },
  {
    pre: 'ACC',
    cat: 'Accesorios',
    costo: [200, 3500],
    items: [
      'Bomba de piso',
      'Minibomba de aluminio',
      'Candado en U',
      'Candado de cable',
      'Timbre clásico',
      'Portabotella',
      'Botella 750 ml',
      'Bolso de sillín',
      'Espejo retrovisor',
      'Guardafangos',
    ],
  },
  {
    pre: 'HER',
    cat: 'Herramientas',
    costo: [300, 5200],
    items: [
      'Multiherramienta 16 funciones',
      'Juego de llaves Allen',
      'Extractor de cadena',
      'Desmontadores de llanta',
      'Lubricante de cadena 120 ml',
      'Desengrasante 500 ml',
    ],
  },
] as const;

export function generarCatalogo(total = 214): Prod[] {
  const r = rng(214);
  const out = [...CATALOGO_BASE];
  const skus = new Set(out.map((p) => p.sku));
  let n = 1;
  while (out.length < total - 2) {
    const f = r.pick(FAMILIAS);
    const base = r.pick(f.items);
    const talla = 'tallas' in f ? r.pick(f.tallas) : null;
    const sku = `${f.pre}-${base
      .slice(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, 'X')}-${String(1000 + n++).padStart(4, '0')}`;
    if (skus.has(sku)) continue;
    skus.add(sku);
    const costo = r.int(f.costo[0], f.costo[1]);
    const precio = Math.round((costo * (1.45 + r.next() * 0.35)) / 50) * 50;
    const stock = r.next() < 0.06 ? 0 : r.int(2, 60);
    out.push({
      sku,
      nombre: talla ? `${base} talla ${talla}` : base,
      categoria: f.cat,
      tipo: 'bien',
      costo,
      precio,
      stock,
      stock_minimo: r.int(2, 8),
      codigo_barras: r.next() < 0.5 ? `742100${String(r.int(1000000, 9999999))}` : undefined,
    });
  }
  out.push(
    {
      sku: 'SER-AJU-0002',
      nombre: 'Ajuste de cambios y frenos',
      categoria: 'Servicios',
      tipo: 'servicio',
      costo: 0,
      precio: toCents('12.00'),
      stock: 0,
      stock_minimo: 0,
    },
    {
      sku: 'SER-ARM-0003',
      nombre: 'Armado de bicicleta',
      categoria: 'Servicios',
      tipo: 'servicio',
      costo: 0,
      precio: toCents('18.00'),
      stock: 0,
      stock_minimo: 0,
    },
  );
  return out;
}

export async function seedCatalogo(db: AnyDb, adminId: string, opts: { minimal?: boolean } = {}) {
  const proveedor = await db
    .insertInto('proveedor')
    .values([
      { nombre: 'Importadora Ciclos del Istmo', nit: '0614-150310-104-6' },
      { nombre: 'Repuestos Centroamericanos', nit: '0614-020715-101-0' },
    ])
    .returning(['id', 'nombre'])
    .execute();
  const productos = opts.minimal ? CATALOGO_BASE : generarCatalogo();
  const rows = await db
    .insertInto('producto')
    .values(
      productos.map((p) => ({
        sku: p.sku,
        nombre: p.nombre,
        categoria: p.categoria,
        tipo: p.tipo,
        costo_promedio: numeric(p.costo),
        precio: numeric(p.precio),
        stock: p.stock,
        stock_minimo: p.stock_minimo,
        codigo_barras: p.codigo_barras ?? null,
      })),
    )
    .returning(['id', 'sku', 'stock', 'tipo', 'costo_promedio'])
    .execute();
  // Inventario inicial como movimiento AJUSTE (SRS-REQ-INV-003: todo cambio de stock queda registrado).
  const inicial = rows.filter((r) => r.tipo === 'bien' && r.stock > 0);
  if (inicial.length) {
    await db
      .insertInto('movimiento_inventario')
      .values(
        inicial.map((r) => ({
          producto_id: r.id,
          tipo: 'AJUSTE',
          cantidad: r.stock,
          costo: r.costo_promedio,
          saldo_resultante: r.stock,
          usuario_id: adminId,
          created_at: new Date(Date.now() - 30 * 86_400_000),
        })),
      )
      .execute();
  }
  const bySku = Object.fromEntries(rows.map((r) => [r.sku, r.id as string]));
  return { proveedorId: proveedor[0]!.id as string, productoIdBySku: bySku };
}
