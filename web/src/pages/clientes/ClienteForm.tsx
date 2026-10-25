import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, api } from '@/api/client';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import type { Cliente } from './types';

const MSG_NRC =
  'El NRC no está registrado en el padrón del Ministerio de Hacienda. No se puede emitir crédito fiscal con este dato.';

const schema = z
  .object({
    tipo_contribuyente: z.enum(['GRANDE', 'NORMAL', 'CONSUMIDOR_FINAL']),
    razon_social: z.string().trim().min(3, 'Ingrese el nombre o razón social.'),
    nombre_comercial: z.string().trim().optional(),
    nit: z
      .string()
      .trim()
      .regex(/^(\d{4}-\d{6}-\d{3}-\d)?$/, 'Formato 0614-030417-103-8.')
      .optional(),
    nrc: z
      .string()
      .trim()
      .regex(/^(\d{1,7}-\d)?$/, 'Formato 189234-5.')
      .optional(),
    dui: z
      .string()
      .trim()
      .regex(/^(\d{8}-\d)?$/, 'Formato 04521987-3.')
      .optional(),
    giro: z.string().trim().optional(),
    departamento: z.string().trim().optional(),
    municipio: z.string().trim().optional(),
    direccion: z.string().trim().optional(),
    telefono: z.string().trim().optional(),
    correo: z.union([z.literal(''), z.string().trim().email('Correo inválido.')]).optional(),
    activo: z.boolean().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.tipo_contribuyente === 'CONSUMIDOR_FINAL') return;
    if (!c.nit)
      ctx.addIssue({ code: 'custom', path: ['nit'], message: 'Obligatorio para contribuyentes.' });
    if (!c.nrc)
      ctx.addIssue({ code: 'custom', path: ['nrc'], message: 'Obligatorio para contribuyentes.' });
    if (!c.giro)
      ctx.addIssue({ code: 'custom', path: ['giro'], message: 'Obligatorio para contribuyentes.' });
  });
type Form = z.infer<typeof schema>;

/** Registrar / editar cliente. El NRC se valida contra el padrón al salir del campo y en el servidor. */
export function ClienteForm({
  cliente,
  onClose,
  onSaved,
  submitLabel = 'Guardar',
}: {
  cliente?: Cliente | null;
  onClose: () => void;
  onSaved: (c: Cliente) => void;
  submitLabel?: string;
}) {
  const qc = useQueryClient();
  const [padron, setPadron] = useState<string | null>(null);
  const v = (x: string | null | undefined) => x ?? '';
  const { register, handleSubmit, watch, formState, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: cliente
      ? {
          tipo_contribuyente: cliente.tipo_contribuyente,
          razon_social: cliente.razon_social,
          nombre_comercial: v(cliente.nombre_comercial),
          nit: v(cliente.nit),
          nrc: v(cliente.nrc),
          dui: v(cliente.dui),
          giro: v(cliente.giro),
          departamento: v(cliente.departamento),
          municipio: v(cliente.municipio),
          direccion: v(cliente.direccion),
          telefono: v(cliente.telefono),
          correo: v(cliente.correo),
          activo: cliente.activo,
        }
      : { tipo_contribuyente: 'NORMAL', activo: true },
  });
  const tipo = watch('tipo_contribuyente');
  const contribuyente = tipo !== 'CONSUMIDOR_FINAL';

  const save = useMutation({
    mutationFn: async (f: Form) => {
      if (cliente) {
        await api(`/clientes/${cliente.id}`, { method: 'PUT', body: f });
        return { ...cliente, ...f } as Cliente;
      }
      return api<Cliente>('/clientes', { body: f });
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['cliente'] });
      onSaved(c);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.field) setError(e.field as keyof Form, { message: e.message });
    },
  });

  const nrcReg = register('nrc');
  const checkNrc = async (nrc: string) => {
    setPadron(null);
    if (!/^\d{1,7}-\d$/.test(nrc)) return;
    const r = await api<{ registrado: boolean; razon_social?: string }>(
      `/padron/nrc/${encodeURIComponent(nrc)}`,
    );
    if (!r.registrado) setError('nrc', { message: MSG_NRC });
    else setPadron(r.razon_social ?? '');
  };

  return (
    <Modal
      open
      width="max-w-2xl"
      title={cliente ? 'Editar cliente' : 'Registrar cliente'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((f) => save.mutate(f))} disabled={save.isPending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-2 gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <Select label="Tipo de receptor" {...register('tipo_contribuyente')}>
          <option value="NORMAL">Contribuyente</option>
          <option value="GRANDE">Gran contribuyente</option>
          <option value="CONSUMIDOR_FINAL">Consumidor final</option>
        </Select>
        <Input
          label={contribuyente ? 'Razón social' : 'Nombre'}
          {...register('razon_social')}
          error={formState.errors.razon_social?.message}
        />
        {contribuyente && (
          <>
            <Input
              label="NIT"
              mono
              placeholder="0614-030417-103-8"
              {...register('nit')}
              error={formState.errors.nit?.message}
            />
            <Input
              label="NRC"
              mono
              placeholder="189234-5"
              {...nrcReg}
              onBlur={(e) => {
                nrcReg.onBlur(e);
                void checkNrc(e.target.value.trim());
              }}
              error={formState.errors.nrc?.message}
              hint={
                padron !== null
                  ? `Registrado en el padrón: ${padron}`
                  : 'Se verifica contra el padrón (simulado).'
              }
            />
            <Input label="Giro" {...register('giro')} error={formState.errors.giro?.message} />
            <Input label="Nombre comercial" {...register('nombre_comercial')} />
          </>
        )}
        <Input
          label="DUI"
          mono
          placeholder="04521987-3"
          {...register('dui')}
          error={formState.errors.dui?.message}
        />
        <Input
          label="Correo"
          type="email"
          {...register('correo')}
          error={formState.errors.correo?.message}
        />
        <Input label="Teléfono" mono {...register('telefono')} />
        <Input label="Departamento" {...register('departamento')} />
        <Input label="Municipio" {...register('municipio')} />
        <Input label="Dirección" {...register('direccion')} />
        {cliente && (
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('activo')} /> Cliente activo
          </label>
        )}
      </form>
    </Modal>
  );
}
