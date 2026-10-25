import { useAuth } from '@/auth/AuthContext';
import { Card, SectionTitle } from '@/components/Card';

export function MiPerfil() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="p-6">
      <SectionTitle>Mi perfil</SectionTitle>
      <Card className="grid max-w-xl grid-cols-[160px_1fr] gap-y-3 p-6 text-sm">
        <span className="text-tinta-600">Nombre</span>
        <span>{user.nombre}</span>
        <span className="text-tinta-600">Correo</span>
        <span className="num">{user.correo}</span>
        <span className="text-tinta-600">Rol</span>
        <span>{user.rol === 'ADMIN' ? 'Administrador' : 'Cajero'}</span>
      </Card>
    </div>
  );
}
