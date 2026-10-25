export type Producto = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  nombre: string;
  categoria: string;
  tipo: 'bien' | 'servicio';
  precio: number;
  costo_promedio: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
  estado: string;
};

export type ProductosPage = {
  items: Producto[];
  page: number;
  pageSize: number;
  total: number;
  categorias: string[];
};
