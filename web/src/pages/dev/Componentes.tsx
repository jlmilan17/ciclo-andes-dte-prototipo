import { useState } from 'react';
import { BandaSello } from '@/components/BandaSello';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { EstadoDte, type Estado } from '@/components/EstadoDte';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { SupuestoDemo } from '@/components/SupuestoDemo';
import { Table, Td, Tr } from '@/components/Table';
import { useToast } from '@/components/Toast';
import { money } from '@/lib/format';

const estados: Estado[] = [
  'BORRADOR',
  'FIRMADO',
  'ENCOLADO',
  'TRANSMITIDO',
  'PROCESADO',
  'RECHAZADO',
  'INVALIDADO',
];

export function Componentes() {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
      <SectionTitle>Sistema de diseño · componentes</SectionTitle>

      <Card className="flex flex-wrap gap-3 p-5">
        <Button>Primario</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="ghost">Fantasma</Button>
        <Button variant="danger">Destructivo</Button>
        <Button disabled>Deshabilitado</Button>
        <Button size="lg" kbd="F9">
          Cobrar
        </Button>
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5">
        <Input label="SKU" placeholder="BIC-MTB-0290" mono />
        <Input
          label="NRC"
          defaultValue="999999-9"
          mono
          error="El NRC no está registrado en el padrón del Ministerio de Hacienda."
        />
      </Card>

      <Card className="flex flex-wrap gap-2 p-5">
        {estados.map((e) => (
          <EstadoDte key={e} estado={e} />
        ))}
      </Card>

      <Table head={['SKU', 'Producto', 'Precio', 'Estado']}>
        <Tr onClick={() => toast('Fila seleccionada')}>
          <Td className="num">BIC-URB-0260</Td>
          <Td>Bicicleta urbana Sendero 26"</Td>
          <Td num>{money(23500)}</Td>
          <Td>
            <EstadoDte estado="PROCESADO" />
          </Td>
        </Tr>
      </Table>

      <div className="grid grid-cols-2 gap-4">
        <BandaSello
          numeroControl="DTE-03-M001P001-000000000000247"
          codigoGeneracion="A1F3C8D2-5B47-4E19-9C06-3D82F1E70B45"
          selloRecepcion="2026B7F4E1C9A03D5E8F2A61C4B7D90E3F1A"
        />
        <BandaSello
          numeroControl="DTE-01-M001P001-000000000000248"
          codigoGeneracion="0C2B9E71-44D3-4A8F-B5E6-12F09D3C7A58"
          contingencia
        />
      </div>

      <Card className="flex items-end justify-between p-5">
        <span className="text-tinta-600">Total</span>
        <span className="num text-total font-medium">{money(64736)}</span>
      </Card>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Abrir modal
        </Button>
        <Button variant="secondary" onClick={() => toast('Venta en contingencia', 'aviso')}>
          Toast aviso
        </Button>
        <Button variant="secondary" onClick={() => toast('DTE procesado', 'exito')}>
          Toast éxito
        </Button>
      </div>
      <SupuestoDemo zg="ZG-11">estructura de demostración del JSON del MH.</SupuestoDemo>

      <Modal
        open={open}
        title="Modal de ejemplo"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setOpen(false)}>Aceptar</Button>
          </>
        }
      >
        Se cierra con X, Cancelar, Esc o clic en el fondo.
      </Modal>
    </div>
  );
}
