import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EstadoDte, type Estado } from '@/components/EstadoDte';
import { Table, Td, Tr } from '@/components/Table';
import { dateTime, money } from '@/lib/format';
import { ClienteForm } from './ClienteForm';
import { TIPO_LABEL, type Cliente } from './types';

type Ficha = Cliente & {
  resumen: { documentos: number; acumulado_anio: number; ultimo: string | null };
  historial: Array<{
    id: string;
    tipo: string;
    numero_control: string;
    estado: Estado;
    emitido_at: string;
    total: number;
  }>;
};

export const TIPO_DTE: Record<string, string> = { '01': 'FCFE', '03': 'CCFE', '05': 'NCE' };

export function ClienteFicha() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const { data: c } = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => api<Ficha>(`/clientes/${id}`),
  });
  if (!c) return <div className="p-6 text-tinta-600">Cargando…</div>;

  return (
    <div className="p-6">
      <SectionTitle
        actions={
          <>
            <Button variant="ghost" onClick={() => nav('/clientes')}>
              Volver
            </Button>
            {user?.rol === 'ADMIN' && (
              <Button variant="secondary" onClick={() => setEdit(true)}>
                Editar
              </Button>
            )}
            <Button disabled={!c.activo} onClick={() => nav(`/pos?cliente=${c.id}`)}>
              Nuevo documento
            </Button>
          </>
        }
      >
        {c.razon_social}
      </SectionTitle>
      <div className="mb-6 grid grid-cols-[2fr_1fr_1fr_1fr] gap-4">
        <Card className="grid grid-cols-[110px_1fr] gap-y-1.5 p-5 text-sm">
          <span className="text-tinta-600">Tipo</span>
          <span>
            <Chip tone={c.tipo_contribuyente === 'GRANDE' ? 'oscuro' : 'neutro'}>
              {TIPO_LABEL[c.tipo_contribuyente]}
            </Chip>{' '}
            {!c.activo && <Chip>Inactivo</Chip>}
          </span>
          <span className="text-tinta-600">NIT</span>
          <span className="num">{c.nit ?? '—'}</span>
          <span className="text-tinta-600">NRC</span>
          <span className="num">{c.nrc ?? '—'}</span>
          <span className="text-tinta-600">DUI</span>
          <span className="num">{c.dui ?? '—'}</span>
          <span className="text-tinta-600">Giro</span>
          <span>{c.giro ?? '—'}</span>
          <span className="text-tinta-600">Dirección</span>
          <span>
            {[c.direccion, c.municipio, c.departamento].filter(Boolean).join(', ') || '—'}
          </span>
          <span className="text-tinta-600">Contacto</span>
          <span>{[c.correo, c.telefono].filter(Boolean).join(' · ') || '—'}</span>
        </Card>
        <Stat label="Documentos emitidos" value={String(c.resumen.documentos)} />
        <Stat label="Acumulado del año" value={money(c.resumen.acumulado_anio)} />
        <Stat
          label="Último documento"
          value={c.resumen.ultimo ? dateTime(c.resumen.ultimo) : '—'}
        />
      </div>
      <h2 className="mb-2 font-cond text-lg font-semibold">Historial de DTE</h2>
      <Table head={['Tipo', 'Número de control', 'Fecha', 'Total', 'Estado']}>
        {c.historial.map((d) => (
          <Tr key={d.id} onClick={() => nav(`/dte/${d.id}`)}>
            <Td>{TIPO_DTE[d.tipo]}</Td>
            <Td className="num">{d.numero_control}</Td>
            <Td>{dateTime(d.emitido_at)}</Td>
            <Td num>{money(d.total)}</Td>
            <Td>
              <EstadoDte estado={d.estado} />
            </Td>
          </Tr>
        ))}
        {c.historial.length === 0 && (
          <Tr>
            <Td colSpan={5} className="py-6 text-center text-tinta-600">
              Sin documentos emitidos.
            </Td>
          </Tr>
        )}
      </Table>
      {edit && (
        <ClienteForm cliente={c} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-tinta-600">{label}</p>
      <p className="num mt-2 text-xl">{value}</p>
    </Card>
  );
}
