import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError, api } from '@/api/client';
import { homeFor, useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';

const schema = z.object({
  correo: z.string().email('Ingrese un correo válido.'),
  password: z.string().min(1, 'Ingrese la contraseña.'),
});
type Form = z.infer<typeof schema>;

export type PublicConfig = {
  demoMode: boolean;
  invalidationWindowHours: number;
  batchMaxDocuments: number;
  retentionAppliesTo: string;
  contingencyPollSeconds: number;
};

export const usePublicConfig = () =>
  useQuery({
    queryKey: ['config-public'],
    queryFn: () => api<PublicConfig>('/config/public'),
    staleTime: Infinity,
  });

export function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const cfg = usePublicConfig();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={homeFor(user.rol)} replace />;

  const onSubmit = handleSubmit(async (f) => {
    setError(null);
    try {
      const u = await login(f.correo, f.password);
      nav(homeFor(u.rol), { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar sesión.');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="font-cond text-2xl font-semibold">Ciclo Andes</p>
          <p className="text-sm text-tinta-600">
            Punto de venta · Inventario · Facturación electrónica
          </p>
        </div>
        <Card className="p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Correo"
              type="email"
              autoComplete="username"
              {...register('correo')}
              error={formState.errors.correo?.message}
            />
            <Input
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              error={formState.errors.password?.message}
            />
            {error && (
              <p
                role="alert"
                className="rounded-control border border-granate-600/40 bg-granate-100 px-3 py-2 text-sm text-granate-600"
              >
                {error}
              </p>
            )}
            <Button type="submit" disabled={formState.isSubmitting}>
              Iniciar sesión
            </Button>
          </form>
        </Card>
        {cfg.data?.demoMode && (
          <p className="mt-4 text-center text-sm">
            <Link to="/demo/roles" className="text-sello-600 underline underline-offset-4">
              Explorar el prototipo
            </Link>
            <span className="block text-xs text-pizarra-400">
              Herramienta de demostración · selector de rol
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
