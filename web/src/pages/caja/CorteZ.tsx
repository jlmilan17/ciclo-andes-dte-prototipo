import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { CorteTermico, type CorteZ as Corte } from '@/components/CorteTermico';
import { cx } from '@/components/cx';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { useCaja } from '@/hooks/useCaja';
import { useDebounced } from '@/hooks/useDebounced';
import { money } from '@/lib/format';
import { parseMoney } from '@/lib/moneyInput';

/** Corte Z (RF-CAJ-01/02/03): totales reales, conteo de efectivo, diferencia y bloqueo. */
export function CorteZ() {
  const { user } = useAuth();
  const caja = useCaja();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [contado, setContado] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const cents = parseMoney(contado);
  const dc = useDebounced(cents, 250);
  const preview = useQuery({
    queryKey: ['corte-preview', dc],
    queryFn: () =>
      api<Corte>(`/caja/corte-z/preview${dc !== null ? `?efectivo_contado=${dc}` : ''}`),
    enabled: !!caja.data?.turno,
  });
  const cerrar = useMutation({
    mutationFn: () => api<Corte>('/caja/corte-z/confirmar', { body: { efectivo_contado: cents } }),
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ['caja'] });
      nav(`/caja/cerrada`, { replace: true, state: { turnoId: c.turnoId } });
    },
  });

  if (caja.data && !caja.data.turno) return <Navigate to="/caja/cerrada" replace />;
  const c = preview.data;
  return (
    <div className="p-6">
      <SectionTitle>Corte Z · cierre de turno</SectionTitle>
      {c && (
        <div className="grid grid-cols-[1fr_360px] gap-6">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              {(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const).map((m) => (
                <Card key={m} className="p-4">
                  <p className="text-xs uppercase tracking-wide text-tinta-600">
                    {m.toLowerCase()}
                  </p>
                  <p className="num mt-1 text-xl">{money(c.porMetodo[m].monto)}</p>
                  <p className="text-xs text-tinta-600">{c.porMetodo[m].ventas} ventas</p>
                </Card>
              ))}
            </div>
            <Card className="num grid grid-cols-4 gap-4 p-4 text-sm">
              <Dato k="FCFE 01" v={`${c.dtePorTipo['01'].cantidad}`} />
              <Dato k="CCFE 03" v={`${c.dtePorTipo['03'].cantidad}`} />
              <Dato k="NCE 05" v={`${c.dtePorTipo['05'].cantidad}`} />
              <Dato k="En contingencia" v={`${c.pendientesContingencia}`} />
              <Dato
                k="Invalidados (excluidos)"
                v={`${c.invalidados.cantidad} · ${money(c.invalidados.monto)}`}
              />
              <Dato k="Rechazados" v={`${c.rechazados}`} />
              <Dato k="Total ventas" v={money(c.totalVentas)} />
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <h2 className="font-cond text-lg font-semibold">Conteo de efectivo</h2>
              <div className="grid grid-cols-3 items-end gap-4">
                <div className="text-sm">
                  <p className="text-tinta-600">Esperado (fondo + ventas en efectivo)</p>
                  <p className="num text-xl">{money(c.efectivoEsperado)}</p>
                </div>
                <Input
                  label="Efectivo contado"
                  mono
                  inputMode="decimal"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
                <div className="text-sm">
                  <p className="text-tinta-600">Diferencia</p>
                  <p
                    className={cx(
                      'num text-xl',
                      c.diferencia !== null && c.diferencia < 0 && 'text-granate-600',
                      c.diferencia !== null && c.diferencia > 0 && 'text-ambar-600',
                    )}
                    data-testid="diferencia"
                  >
                    {c.diferencia === null ? '—' : money(c.diferencia)}
                  </p>
                </div>
              </div>
              {c.pendientesContingencia > 0 && (
                <p className="rounded-control bg-ambar-100 px-3 py-2 text-xs text-ambar-600">
                  Hay {c.pendientesContingencia} DTE en contingencia: se transmitirán
                  automáticamente; el corte los cuenta como pendientes.
                </p>
              )}
              <Button
                size="lg"
                disabled={cents === null || user?.rol !== 'CAJERO'}
                onClick={() => setConfirmar(true)}
                data-testid="confirmar-corte"
              >
                Confirmar Corte Z y cerrar turno
              </Button>
              {user?.rol !== 'CAJERO' && (
                <p className="text-xs text-tinta-600">
                  El Administrador consulta el corte; lo confirma el Cajero del turno.
                </p>
              )}
            </Card>
          </div>
          <div className="flex justify-center bg-papel-50 py-2">
            <CorteTermico c={c} />
          </div>
        </div>
      )}
      {confirmar && (
        <Modal
          open
          title="Confirmar Corte Z"
          onClose={() => setConfirmar(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => cerrar.mutate()}
                disabled={cerrar.isPending}
                data-testid="confirmar-corte-modal"
              >
                Cerrar turno
              </Button>
            </>
          }
        >
          La terminal quedará bloqueada y no podrá registrar ventas hasta una nueva apertura de
          caja.
          {cerrar.error && <p className="mt-2 text-granate-600">{cerrar.error.message}</p>}
        </Modal>
      )}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="font-sans text-xs text-tinta-600">{k}</p>
      <p>{v}</p>
    </div>
  );
}
