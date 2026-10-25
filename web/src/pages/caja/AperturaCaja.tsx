import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { useCaja } from '@/hooks/useCaja';
import { dateTime } from '@/lib/format';
import { parseMoney } from '@/lib/moneyInput';

/** PRT-POS-10: apertura de caja con fondo inicial; sin turno abierto el POS está inactivo. */
export function AperturaCaja() {
  const { user } = useAuth();
  const caja = useCaja();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [fondo, setFondo] = useState('100.00');
  const cents = parseMoney(fondo);
  const abrir = useMutation({
    mutationFn: () => api('/caja/abrir', { body: { fondo_inicial: cents } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['caja'] });
      nav('/pos', { replace: true });
    },
  });
  if (caja.data?.turno) return <Navigate to="/pos" replace />;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md p-6">
        <p className="num text-xs uppercase tracking-widest text-tinta-600">
          {caja.data?.caja.codigo ?? '…'}
        </p>
        <h1 className="font-cond text-2xl font-semibold">Apertura de caja</h1>
        <p className="mt-1 text-sm text-tinta-600">
          {user?.nombre} · {caja.data?.caja.nombre}
        </p>
        {caja.data?.ultimoCierre && (
          <p className="mt-2 text-xs text-pizarra-400">
            Último Corte Z #{String(caja.data.ultimoCierre.numero_corte).padStart(4, '0')} ·{' '}
            {dateTime(caja.data.ultimoCierre.cierre_at)}
          </p>
        )}
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cents !== null) abrir.mutate();
          }}
        >
          <Input
            label="Fondo inicial de efectivo"
            mono
            inputMode="decimal"
            autoFocus
            value={fondo}
            onChange={(e) => setFondo(e.target.value)}
            error={cents === null ? 'Monto inválido.' : abrir.error?.message}
          />
          <Button type="submit" size="lg" disabled={cents === null || abrir.isPending}>
            Abrir caja
          </Button>
        </form>
      </Card>
    </div>
  );
}
