import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, api } from '@/api/client';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { dateTime, money } from '@/lib/format';
import { centsToInput, parseMoney } from '@/lib/moneyInput';
import { ComprobanteLote } from './ComprobanteLote';
import type { Producto } from './types';

const schema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9]{2,5}(-[A-Z0-9]{1,6}){1,3}$/,
      'Formato de SKU inválido (p. ej. BIC-MTB-0290).',
    ),
  nombre: z.string().trim().min(3, 'Nombre demasiado corto.'),
  categoria: z.string().trim().min(2, 'Ingrese la categoría.'),
  tipo: z.enum(['bien', 'servicio']),
  precio: z.string().refine((v) => (parseMoney(v) ?? 0) > 0, 'Precio inválido.'),
  stock_minimo: z.coerce.number().int().min(0),
  codigo_barras: z.string().trim().optional(),
});
type Form = z.input<typeof schema>;

type Movimiento = {
  id: string;
  tipo: string;
  cantidad: number;
  saldo_resultante: number;
  created_at: string;
  numero_control: string | null;
  referencia_lote_id: string | null;
  factura_proveedor: string | null;
};

export function ProductoPanel({
  producto,
  categorias,
  onClose,
  onIngreso,
}: {
  producto: Producto | null;
  categorias: string[];
  onClose: () => void;
  onIngreso: (p: Producto) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [comprobante, setComprobante] = useState<string | null>(null);
  const { register, handleSubmit, formState, setError, watch } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: producto
      ? {
          sku: producto.sku,
          nombre: producto.nombre,
          categoria: producto.categoria,
          tipo: producto.tipo,
          precio: centsToInput(producto.precio),
          stock_minimo: producto.stock_minimo,
          codigo_barras: producto.codigo_barras ?? '',
        }
      : { tipo: 'bien', stock_minimo: 0, sku: '', nombre: '', categoria: '', precio: '' },
  });

  const movimientos = useQuery({
    queryKey: ['movimientos', producto?.id],
    queryFn: () => api<{ items: Movimiento[] }>(`/productos/${producto!.id}/movimientos`),
    enabled: !!producto,
  });

  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = {
        sku: f.sku,
        nombre: f.nombre,
        categoria: f.categoria,
        tipo: f.tipo,
        precio: parseMoney(f.precio)!,
        stock_minimo: Number(f.stock_minimo),
        codigo_barras: f.codigo_barras || null,
      };
      return producto
        ? api(`/productos/${producto.id}`, { method: 'PUT', body })
        : api('/productos', { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast(producto ? 'Producto actualizado.' : 'Producto creado.', 'exito');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.field === 'sku') setError('sku', { message: e.message });
      else toast(e.message, 'error');
    },
  });

  const toggle = useMutation({
    mutationFn: () =>
      api(`/productos/${producto!.id}/estado`, {
        method: 'PATCH',
        body: { activo: !producto!.activo },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast(
        producto!.activo
          ? 'Producto deshabilitado: ya no aparece en el POS.'
          : 'Producto habilitado.',
        'info',
      );
      onClose();
    },
  });

  const checkSku = async (sku: string) => {
    if (!sku) return;
    const qs = new URLSearchParams({ sku });
    if (producto) qs.set('exceptId', producto.id);
    const r = await api<{ disponible: boolean }>(`/productos/sku-disponible?${qs}`);
    if (!r.disponible)
      setError('sku', { message: 'Ya existe un producto con ese SKU. El SKU debe ser único.' });
  };

  const skuReg = register('sku');

  return (
    <Modal
      side
      open
      title={producto ? `Editar · ${producto.sku}` : 'Nuevo producto'}
      onClose={onClose}
      footer={
        <>
          {producto && (
            <Button
              variant={producto.activo ? 'danger' : 'secondary'}
              className="mr-auto"
              onClick={() => toggle.mutate()}
            >
              {producto.activo ? 'Deshabilitar' : 'Habilitar'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((f) => save.mutate(f))} disabled={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <Input
          label="SKU"
          mono
          {...skuReg}
          onBlur={(e) => {
            skuReg.onBlur(e);
            void checkSku(e.target.value.trim().toUpperCase());
          }}
          error={formState.errors.sku?.message}
        />
        <Input label="Nombre" {...register('nombre')} error={formState.errors.nombre?.message} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Categoría"
            list="categorias"
            {...register('categoria')}
            error={formState.errors.categoria?.message}
          />
          <datalist id="categorias">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Select label="Tipo" {...register('tipo')}>
            <option value="bien">Bien</option>
            <option value="servicio">Servicio (no descuenta stock)</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Precio neto (sin IVA)"
            mono
            inputMode="decimal"
            {...register('precio')}
            error={formState.errors.precio?.message}
          />
          <Input
            label="Stock mínimo"
            mono
            type="number"
            min={0}
            disabled={watch('tipo') === 'servicio'}
            {...register('stock_minimo')}
          />
        </div>
        <Input label="Código de barras (opcional)" mono {...register('codigo_barras')} />
        {!producto && (
          <p className="text-xs text-pizarra-400">Las existencias entran con un ingreso de lote.</p>
        )}
      </form>

      {producto && producto.tipo === 'bien' && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-cond text-base font-semibold">Movimientos de inventario</h3>
            <Button variant="secondary" onClick={() => onIngreso(producto)}>
              Registrar ingreso
            </Button>
          </div>
          <p className="mb-2 text-sm text-tinta-600">
            Stock actual <span className="num">{producto.stock}</span> · Costo promedio{' '}
            <span className="num">{money(producto.costo_promedio)}</span>
          </p>
          <ul className="divide-y divide-borde rounded-card border border-borde text-sm">
            {movimientos.data?.items.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="w-44 text-xs">{m.tipo.replace('_', ' ')}</span>
                <span
                  className={`num w-12 text-right ${m.cantidad < 0 ? 'text-granate-600' : 'text-sello-600'}`}
                >
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </span>
                <span className="num w-12 text-right text-tinta-600">{m.saldo_resultante}</span>
                <span className="flex-1 truncate text-right text-xs text-tinta-600">
                  {m.referencia_lote_id ? (
                    <button
                      className="text-sello-600 underline"
                      onClick={() => setComprobante(m.referencia_lote_id)}
                    >
                      Factura {m.factura_proveedor}
                    </button>
                  ) : (
                    (m.numero_control ?? '')
                  )}
                </span>
                <span className="w-28 text-right text-xs text-pizarra-400">
                  {dateTime(m.created_at)}
                </span>
              </li>
            ))}
            {movimientos.data?.items.length === 0 && (
              <li className="px-3 py-2 text-tinta-600">Sin movimientos.</li>
            )}
          </ul>
        </section>
      )}
      {comprobante && <ComprobanteLote loteId={comprobante} onClose={() => setComprobante(null)} />}
    </Modal>
  );
}
