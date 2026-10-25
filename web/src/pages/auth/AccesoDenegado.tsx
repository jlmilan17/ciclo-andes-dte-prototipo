import { useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

export function AccesoDenegado() {
  const { user } = useAuth();
  const nav = useNavigate();
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md p-8 text-center" data-testid="acceso-denegado">
        <p className="num mb-2 text-xs uppercase tracking-widest text-granate-600">403</p>
        <h1 className="font-cond text-2xl font-semibold">Acceso denegado</h1>
        <p className="mt-3 text-tinta-600">
          Su rol ({user?.rol === 'ADMIN' ? 'Administrador' : 'Cajero'}) no tiene permiso para ver
          esta pantalla. El servidor también rechaza la operación.
        </p>
        <Button className="mt-6" onClick={() => nav(user ? homeFor(user.rol) : '/login')}>
          Volver al inicio
        </Button>
      </Card>
    </div>
  );
}
