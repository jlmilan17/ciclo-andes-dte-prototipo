import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Input, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { SupuestoDemo } from '@/components/SupuestoDemo';
import { Table, Td, Tr } from '@/components/Table';
import { useToast } from '@/components/Toast';

type Usuario = {
  id: string;
  nombre: string;
  correo: string;
  rol: 'CAJERO' | 'ADMIN';
  caja_id: string | null;
  caja: string | null;
  activo: boolean;
  bloqueado: boolean;
  intentos_fallidos: number;
};
type Data = { items: Usuario[]; cajas: Array<{ id: string; codigo: string; nombre: string }> };

/** PRT-ADM-05: alta, edición, asignación de rol y desbloqueo. */
export function Usuarios() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Data>('/usuarios') });
  const [edit, setEdit] = useState<Usuario | 'nuevo' | null>(null);
  const desbloquear = useMutation({
    mutationFn: (id: string) => api(`/usuarios/${id}/desbloquear`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast('Cuenta desbloqueada.', 'exito');
    },
  });
  return (
    <div className="p-6">
      <SectionTitle
        actions={
          <>
            <Button variant="secondary" onClick={() => nav('/auditoria')}>
              Auditoría
            </Button>
            <Button onClick={() => setEdit('nuevo')}>Nuevo usuario</Button>
          </>
        }
      >
        Usuarios y roles
      </SectionTitle>
      <Table head={['Nombre', 'Correo', 'Rol', 'Caja', 'Estado', '']}>
        {data?.items.map((u) => (
          <Tr key={u.id} onClick={() => setEdit(u)} data-testid={`usuario-${u.correo}`}>
            <Td>{u.nombre}</Td>
            <Td className="num">{u.correo}</Td>
            <Td>
              <Chip tone={u.rol === 'ADMIN' ? 'oscuro' : 'neutro'}>
                {u.rol === 'ADMIN' ? 'Administrador' : 'Cajero'}
              </Chip>
            </Td>
            <Td>{u.caja ?? '—'}</Td>
            <Td>
              {u.bloqueado ? (
                <Chip tone="error">Bloqueada</Chip>
              ) : u.activo ? (
                <Chip tone="exito">Activa</Chip>
              ) : (
                <Chip>Inactiva</Chip>
              )}
            </Td>
            <Td className="text-right">
              {u.bloqueado && (
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    desbloquear.mutate(u.id);
                  }}
                >
                  Desbloquear
                </Button>
              )}
            </Td>
          </Tr>
        ))}
      </Table>
      <div className="mt-3">
        <SupuestoDemo zg="ZG-09">
          el bloqueo tras 3 intentos es una propuesta del equipo, no un requerimiento formal.
        </SupuestoDemo>
      </div>
      {edit && data && (
        <UsuarioForm
          u={edit === 'nuevo' ? null : edit}
          cajas={data.cajas}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function UsuarioForm({
  u,
  cajas,
  onClose,
}: {
  u: Usuario | null;
  cajas: Data['cajas'];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = useState({
    nombre: u?.nombre ?? '',
    correo: u?.correo ?? '',
    rol: u?.rol ?? 'CAJERO',
    caja_id: u?.caja_id ?? cajas[0]?.id ?? '',
    activo: u?.activo ?? true,
    password: '',
  });
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null);
  const save = useMutation({
    mutationFn: () =>
      u
        ? api(`/usuarios/${u.id}`, {
            method: 'PUT',
            body: {
              nombre: f.nombre,
              rol: f.rol,
              caja_id: f.rol === 'CAJERO' ? f.caja_id : null,
              activo: f.activo,
              password: f.password,
            },
          })
        : api('/usuarios', { body: { ...f, caja_id: f.rol === 'CAJERO' ? f.caja_id : null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      onClose();
    },
    onError: (e) =>
      setErr({ field: e instanceof ApiError ? e.field : undefined, message: e.message }),
  });
  const fe = (k: string) => (err?.field === k ? err.message : undefined);
  return (
    <Modal
      open
      title={u ? 'Editar usuario' : 'Nuevo usuario'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Nombre"
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          error={fe('nombre')}
        />
        <Input
          label="Correo"
          type="email"
          value={f.correo}
          disabled={!!u}
          onChange={(e) => setF({ ...f, correo: e.target.value })}
          error={fe('correo')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Rol"
            value={f.rol}
            onChange={(e) => setF({ ...f, rol: e.target.value as 'CAJERO' | 'ADMIN' })}
            disabled={u?.id === user?.id}
          >
            <option value="CAJERO">Cajero</option>
            <option value="ADMIN">Administrador</option>
          </Select>
          {f.rol === 'CAJERO' && (
            <Select
              label="Caja"
              value={f.caja_id}
              onChange={(e) => setF({ ...f, caja_id: e.target.value })}
              error={fe('caja_id')}
            >
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo}
                </option>
              ))}
            </Select>
          )}
        </div>
        <Input
          label={u ? 'Nueva contraseña (opcional)' : 'Contraseña'}
          type="password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          error={fe('password')}
          hint="Mínimo 8 caracteres. Se guarda con hash bcrypt."
        />
        {u && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.activo}
              disabled={u.id === user?.id}
              onChange={(e) => setF({ ...f, activo: e.target.checked })}
            />{' '}
            Cuenta activa
          </label>
        )}
        {err && !err.field && <p className="text-sm text-granate-600">{err.message}</p>}
      </div>
    </Modal>
  );
}
