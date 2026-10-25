import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cliente } from '@/pages/clientes/types';

export type LineaCarrito = {
  productoId: string;
  sku: string;
  nombre: string;
  tipo: 'bien' | 'servicio';
  precio: number;
  stock: number;
  cantidad: number;
};

export type Carrito = { lineas: LineaCarrito[]; receptor: Cliente | null };

const key = (cajaId: string) => `ca.carrito.${cajaId}`;
const read = (cajaId: string): Carrito => {
  try {
    const raw = localStorage.getItem(key(cajaId));
    return raw ? (JSON.parse(raw) as Carrito) : { lineas: [], receptor: null };
  } catch {
    return { lineas: [], receptor: null };
  }
};

export type StockAlert = { nombre: string; disponible: number } | null;

/**
 * PRT-POS-09: el carrito sobrevive a modales y recargas (almacenamiento local por terminal).
 * Regla 4: superar el stock dispara alerta y conserva la cantidad anterior.
 */
export function useCarrito(cajaId: string | undefined) {
  const [c, setC] = useState<Carrito>(() =>
    cajaId ? read(cajaId) : { lineas: [], receptor: null },
  );
  const [alerta, setAlerta] = useState<StockAlert>(null);

  useEffect(() => {
    if (cajaId) setC(read(cajaId));
  }, [cajaId]);
  useEffect(() => {
    if (!cajaId) return;
    try {
      localStorage.setItem(key(cajaId), JSON.stringify(c));
    } catch {
      /* sin almacenamiento */
    }
  }, [c, cajaId]);

  const ref = useRef(c);
  ref.current = c;

  const setCantidad = useCallback((productoId: string, cantidad: number) => {
    const cur = ref.current;
    const l = cur.lineas.find((x) => x.productoId === productoId);
    if (!l) return;
    if (cantidad <= 0) {
      setC({ ...cur, lineas: cur.lineas.filter((x) => x.productoId !== productoId) });
      return;
    }
    if (l.tipo === 'bien' && cantidad > l.stock) {
      setAlerta({ nombre: l.nombre, disponible: l.stock });
      return;
    }
    setAlerta(null);
    setC({
      ...cur,
      lineas: cur.lineas.map((x) => (x.productoId === productoId ? { ...x, cantidad } : x)),
    });
  }, []);

  const agregar = useCallback((p: Omit<LineaCarrito, 'cantidad'>) => {
    const cur = ref.current;
    const l = cur.lineas.find((x) => x.productoId === p.productoId);
    const nueva = (l?.cantidad ?? 0) + 1;
    if (p.tipo === 'bien' && nueva > p.stock) {
      setAlerta({ nombre: p.nombre, disponible: p.stock });
      return false;
    }
    setAlerta(null);
    setC(
      l
        ? {
            ...cur,
            lineas: cur.lineas.map((x) =>
              x.productoId === p.productoId ? { ...x, stock: p.stock, cantidad: nueva } : x,
            ),
          }
        : { ...cur, lineas: [...cur.lineas, { ...p, cantidad: 1 }] },
    );
    return true;
  }, []);

  const quitar = useCallback((productoId: string) => {
    setC((cur) => ({ ...cur, lineas: cur.lineas.filter((x) => x.productoId !== productoId) }));
  }, []);
  const setReceptor = useCallback(
    (receptor: Cliente | null) => setC((cur) => ({ ...cur, receptor })),
    [],
  );
  const limpiar = useCallback(() => {
    setAlerta(null);
    setC({ lineas: [], receptor: null });
  }, []);

  return { ...c, alerta, setAlerta, agregar, setCantidad, quitar, setReceptor, limpiar };
}
