import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export type CajaEstado = {
  caja: { id: string; codigo: string; nombre: string };
  turno: {
    id: string;
    apertura_at: string;
    fondo_inicial: number;
    cajero: string;
    cajero_id: string;
  } | null;
  ultimoCierre: { id: string; cierre_at: string; numero_corte: number } | null;
};

export function useCaja() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['caja'],
    queryFn: () => api<CajaEstado>('/caja/estado'),
    enabled: !!user,
  });
}
