import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';

type Motivo = { id: number; descripcion: string; requiere_observaciones: boolean };

/** Modal Invalidar (Administrador): motivo del catálogo; "Otro" exige observaciones. */
export function InvalidarModal({
  dteId,
  numeroControl,
  onClose,
}: {
  dteId: string;
  numeroControl: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const motivos = useQuery({
    queryKey: ['motivos'],
    queryFn: () => api<Motivo[]>('/motivos-invalidacion'),
  });
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const m = motivos.data?.find((x) => String(x.id) === motivo);
  const valido = !!m && (!m.requiere_observaciones || obs.trim().length > 0);
  const inv = useMutation({
    mutationFn: () =>
      api<{ sello: string }>(`/dte/${dteId}/invalidar`, {
        body: { motivo_id: Number(motivo), observaciones: obs || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dte'] });
      toast(
        'Evento de invalidación sellado. El documento quedó INVALIDADO y el inventario se revirtió.',
        'exito',
      );
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Invalidar documento"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={!valido || inv.isPending}
            onClick={() => inv.mutate()}
            data-testid="confirmar-invalidar"
          >
            Invalidar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p>
          Se construirá, firmará y transmitirá al MH (simulado) el evento de invalidación de{' '}
          <span className="num">{numeroControl}</span>. Al sellarse, el documento queda INVALIDADO,
          se revierte el inventario y el registro es inmutable.
        </p>
        <Select
          label="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-label="Motivo de invalidación"
        >
          <option value="">Seleccione un motivo…</option>
          {motivos.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.descripcion}
            </option>
          ))}
        </Select>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-tinta-600">
            Observaciones {m?.requiere_observaciones ? '(obligatorias)' : '(opcional)'}
          </span>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={3}
            className="rounded-control border border-borde p-2"
          />
        </label>
        {inv.error && (
          <p className="rounded-control bg-granate-100 px-3 py-2 text-granate-600">
            {inv.error.message}
          </p>
        )}
      </div>
    </Modal>
  );
}
