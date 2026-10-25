import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { api, fileUrl } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CorteTermico, type CorteZ } from '@/components/CorteTermico';
import { useCaja } from '@/hooks/useCaja';

/** Terminal bloqueada tras el Corte Z (regla 7). */
export function CajaCerrada() {
  const caja = useCaja();
  const ultimo = caja.data?.ultimoCierre;
  const corte = useQuery({
    queryKey: ['corte', ultimo?.id],
    queryFn: () => api<CorteZ>(`/caja/corte-z/${ultimo!.id}`),
    enabled: !!ultimo,
  });
  if (caja.data?.turno) return <Navigate to="/pos" replace />;
  return (
    <div className="grid h-full grid-cols-[1fr_360px] gap-6 p-6">
      <div className="flex items-center justify-center">
        <Card className="max-w-md p-8 text-center" data-testid="caja-cerrada">
          <p className="num text-xs uppercase tracking-widest text-tinta-600">
            {caja.data?.caja.codigo}
          </p>
          <h1 className="font-cond text-2xl font-semibold">Caja cerrada</h1>
          <p className="mt-2 text-sm text-tinta-600">
            La terminal está bloqueada. No se pueden registrar ventas hasta abrir un nuevo turno; el
            servidor también las rechaza.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/caja/apertura">
              <Button size="lg">Abrir nuevo turno</Button>
            </Link>
            {ultimo && (
              <a href={fileUrl(`/caja/corte-z/${ultimo.id}/pdf`)} target="_blank" rel="noreferrer">
                <Button size="lg" variant="secondary">
                  Exportar Corte Z
                </Button>
              </a>
            )}
          </div>
        </Card>
      </div>
      {corte.data && (
        <div className="flex justify-center overflow-auto bg-papel-50 py-2">
          <CorteTermico c={corte.data} />
        </div>
      )}
    </div>
  );
}
