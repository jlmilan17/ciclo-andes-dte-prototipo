import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { useToast } from './Toast';

export function EnviarCorreo({
  dteId,
  sugerido,
  onClose,
}: {
  dteId: string;
  sugerido: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [to, setTo] = useState(sugerido ?? '');
  const m = useMutation({
    mutationFn: () => api(`/dte/${dteId}/enviar-correo`, { body: { destinatario: to } }),
    onSuccess: () => {
      toast('Correo guardado en la bandeja de salida (simulado).', 'exito');
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Enviar por correo"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            Enviar
          </Button>
        </>
      }
    >
      <Input
        label="Destinatario"
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        error={m.error?.message}
        autoFocus
      />
      <p className="mt-2 text-xs text-pizarra-400">
        Simulado: el mensaje con el PDF y el JSON adjuntos queda en "Correos enviados".
      </p>
    </Modal>
  );
}
