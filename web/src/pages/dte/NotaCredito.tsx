import { useMutation, useQuery } from '@tanstack/react-query';
import { NceError, assertNceCap, computeNceTotals } from '@domain/nce';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '@/api/client';
import { BandaSello } from '@/components/BandaSello';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Input } from '@/components/Input';
import { useToast } from '@/components/Toast';
import { dateTime, money } from '@/lib/format';
import { Procesando, type Paso } from '@/pages/pos/Procesando';

type Original = {
  id: string;
  numero_control: string;
  codigo_generacion: string;
  sello_recepcion: string;
  emitido_at: string;
  receptor: { razon_social: string; nrc: string | null };
  gravado: number;
  iva: number;
  retencion: number;
  total: number;
  acumulado: number;
  disponible: number;
  lineas: Array<{
    id: string;
    num_item: number;
    codigo: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    devuelto: number;
  }>;
};

/** Nota de crédito (Administrador): búsqueda por UUID, ítems parciales y tope acumulado. */
export function NotaCredito() {
  const { id } = useParams();
  const [q, setQ] = useState(id ?? '');
  const [buscado, setBuscado] = useState(id ?? '');
  const orig = useQuery({
    queryKey: ['nce-original', buscado],
    queryFn: () => api<Original>(`/nce/original?q=${encodeURIComponent(buscado)}`),
    enabled: !!buscado,
  });
  return (
    <div className="p-6">
      <SectionTitle>Nota de crédito electrónica</SectionTitle>
      <form
        className="mb-6 flex max-w-3xl items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBuscado(q.trim());
        }}
      >
        <Input
          className="w-[520px]"
          label="Documento original (código de generación o número de control)"
          mono
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A1F3C8D2-5B47-4E19-9C06-3D82F1E70B45"
          error={orig.error instanceof ApiError ? orig.error.message : undefined}
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
      {orig.data && <Formulario o={orig.data} key={orig.data.id + orig.dataUpdatedAt} />}
    </div>
  );
}

function Formulario({ o }: { o: Original }) {
  const nav = useNavigate();
  const toast = useToast();
  const [cant, setCant] = useState<Record<string, string>>({});
  const [proc, setProc] = useState<{ pasos: Paso[] | null; error: string | null } | null>(null);

  const calc = useMemo(() => {
    const devolucion = o.lineas.map((l) => ({ lineaId: l.id, cantidad: Number(cant[l.id] || 0) }));
    try {
      const t = computeNceTotals(
        { gravado: o.gravado, iva: o.iva, retencion: o.retencion, total: o.total },
        o.lineas.map((l) => ({
          lineaId: l.id,
          cantidad: l.cantidad,
          precioUnitario: l.precio_unitario,
        })),
        devolucion,
        Object.fromEntries(o.lineas.map((l) => [l.id, l.devuelto])),
      );
      assertNceCap(o.total, o.acumulado, t.total);
      return { t, error: null };
    } catch (e) {
      return {
        t: null,
        error: e instanceof NceError && e.code !== 'NCE_SIN_LINEAS' ? e.message : null,
      };
    }
  }, [cant, o]);

  const emitir = useMutation({
    mutationFn: () =>
      api<{ dte: { id: string }; pasos: Paso[] }>('/dte/nce', {
        body: {
          original_id: o.id,
          lineas: o.lineas
            .map((l) => ({ linea_id: l.id, cantidad: Number(cant[l.id] || 0) }))
            .filter((l) => l.cantidad > 0),
        },
      }),
    onMutate: () => setProc({ pasos: null, error: null }),
    onSuccess: async (r) => {
      setProc({ pasos: r.pasos, error: null });
      await new Promise((res) => setTimeout(res, 900));
      nav(`/pos/venta/${r.dte.id}`);
    },
    onError: (e) => {
      setProc({ pasos: [], error: e.message });
      setTimeout(() => setProc(null), 2500);
      toast(e.message, 'error');
    },
  });

  return (
    <div className="grid grid-cols-[1fr_400px] gap-6">
      <div className="flex flex-col gap-4">
        <BandaSello
          numeroControl={o.numero_control}
          codigoGeneracion={o.codigo_generacion}
          selloRecepcion={o.sello_recepcion}
        />
        <p className="text-sm text-tinta-600">
          {o.receptor.razon_social} · NRC <span className="num">{o.receptor.nrc}</span> · emitido{' '}
          {dateTime(o.emitido_at)}
        </p>
        <div className="overflow-hidden rounded-card border border-borde bg-superficie">
          <table className="w-full text-sm">
            <thead className="bg-papel-50 text-left text-xs uppercase tracking-wide text-tinta-600">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Vendido</th>
                <th className="px-3 py-2 text-right">Ya devuelto</th>
                <th className="px-3 py-2 text-right">Devolver</th>
              </tr>
            </thead>
            <tbody>
              {o.lineas.map((l) => {
                const max = l.cantidad - l.devuelto;
                return (
                  <tr key={l.id} className="border-t border-borde">
                    <td className="px-3 py-2">
                      {l.descripcion}
                      <span className="num block text-xs text-tinta-600">{l.codigo}</span>
                    </td>
                    <td className="num px-3 py-2 text-right">{money(l.precio_unitario)}</td>
                    <td className="num px-3 py-2 text-right">{l.cantidad}</td>
                    <td className="num px-3 py-2 text-right">{l.devuelto}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={max}
                        disabled={max === 0}
                        aria-label={`Cantidad a devolver de ${l.descripcion}`}
                        value={cant[l.id] ?? ''}
                        placeholder="0"
                        onChange={(e) => setCant((c) => ({ ...c, [l.id]: e.target.value }))}
                        className="num h-9 w-20 rounded-control border border-borde px-2 text-right disabled:bg-papel-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Card className="flex h-fit flex-col gap-3 p-5">
        <p className="text-xs uppercase tracking-wide text-tinta-600">Documento original</p>
        <div className="num flex justify-between text-sm">
          <span className="font-sans">Total original</span>
          {money(o.total)}
        </div>
        <div className="num flex justify-between text-sm">
          <span className="font-sans">NCE previas</span>−{money(o.acumulado)}
        </div>
        <div className="num flex justify-between text-sm font-medium">
          <span className="font-sans">Disponible</span>
          {money(o.disponible)}
        </div>
        <hr className="border-borde" />
        <p className="text-xs uppercase tracking-wide text-tinta-600">
          Nota de crédito (impuestos proporcionales)
        </p>
        <dl className="num flex flex-col gap-1 text-sm" data-testid="nce-totales">
          <div className="flex justify-between">
            <dt className="font-sans text-tinta-600">Gravado</dt>
            <dd>{money(calc.t?.gravado ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-sans text-tinta-600">IVA 13 %</dt>
            <dd>{money(calc.t?.iva ?? 0)}</dd>
          </div>
          {o.retencion > 0 && (
            <div className="flex justify-between">
              <dt className="font-sans text-tinta-600">Retención 1 %</dt>
              <dd>−{money(calc.t?.retencion ?? 0)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-borde pt-2 text-xl">
            <dt className="font-sans">Total NCE</dt>
            <dd data-testid="nce-total">{money(calc.t?.total ?? 0)}</dd>
          </div>
        </dl>
        {calc.error && (
          <p
            role="alert"
            className="rounded-control bg-granate-100 px-3 py-2 text-sm text-granate-600"
          >
            {calc.error}
          </p>
        )}
        <Button
          size="lg"
          disabled={!calc.t || emitir.isPending}
          onClick={() => emitir.mutate()}
          data-testid="emitir-nce"
        >
          Emitir nota de crédito
        </Button>
        <p className="text-xs text-pizarra-400">
          El stock de los ítems devueltos se reintegra al confirmar. Si el MH no responde, la NCE
          entra en contingencia.
        </p>
      </Card>
      {proc && <Procesando pasos={proc.pasos} error={proc.error} />}
    </div>
  );
}
