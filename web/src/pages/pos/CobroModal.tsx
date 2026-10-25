import { useEffect, useState } from 'react';
import { Button, Kbd } from '@/components/Button';
import { cx } from '@/components/cx';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { SupuestoDemo } from '@/components/SupuestoDemo';
import { money } from '@/lib/format';
import { parseMoney } from '@/lib/moneyInput';

export type Metodo = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';
export type CobroData = { metodo: Metodo; efectivoRecibido: number | null; tipo: '01' | '03' };

const METODOS: Array<[Metodo, string]> = [
  ['EFECTIVO', 'Efectivo'],
  ['TARJETA', 'Tarjeta'],
  ['TRANSFERENCIA', 'Transferencia'],
];

/** PRT-POS-06: método de pago, efectivo recibido y vuelto; tipo de documento modificable si aplica. */
export function CobroModal({
  total,
  tipo,
  contribuyente,
  onTipo,
  onClose,
  onConfirm,
}: {
  total: number;
  tipo: '01' | '03';
  contribuyente: boolean;
  onTipo: (t: '01' | '03') => void;
  onClose: () => void;
  onConfirm: (d: CobroData) => void;
}) {
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO');
  const [recibido, setRecibido] = useState((total / 100).toFixed(2));
  const rc = parseMoney(recibido);
  const vuelto = rc !== null ? rc - total : null;
  const valido = metodo !== 'EFECTIVO' || (vuelto !== null && vuelto >= 0);
  const confirm = () =>
    valido && onConfirm({ metodo, efectivoRecibido: metodo === 'EFECTIVO' ? rc : null, tipo });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <Modal
      open
      title="Cobro"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="lg" disabled={!valido} onClick={confirm} data-testid="confirmar-emitir">
            Confirmar y emitir <Kbd inverse>F9</Kbd>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-end justify-between">
          <span className="text-tinta-600">Total a cobrar</span>
          <span className="num text-2xl font-medium" data-testid="cobro-total">
            {money(total)}
          </span>
        </div>
        {contribuyente && (
          <div>
            <p className="mb-1 text-sm font-medium text-tinta-600">Documento</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['03', 'Crédito fiscal (CCFE · 03)'],
                  ['01', 'Factura (FCFE · 01)'],
                ] as const
              ).map(([t, l]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTipo(t)}
                  className={cx(
                    'h-11 rounded-control border text-sm',
                    tipo === t ? 'border-sello-600 bg-sello-100 text-sello-600' : 'border-borde',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-medium text-tinta-600">Método de pago</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {METODOS.map(([m, l]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={metodo === m}
                onClick={() => setMetodo(m)}
                className={cx(
                  'h-11 rounded-control border text-sm',
                  metodo === m ? 'border-sello-600 bg-sello-100 text-sello-600' : 'border-borde',
                )}
              >
                {l}
              </button>
            ))}
          </div>
          {metodo === 'TARJETA' && (
            <p className="mt-2 text-xs text-pizarra-400">
              El cobro se realiza en el POS bancario externo; aquí solo se registra el método
              (simulado).
            </p>
          )}
        </div>
        {metodo === 'EFECTIVO' && (
          <div className="grid grid-cols-2 items-end gap-4">
            <Input
              label="Efectivo recibido"
              mono
              inputMode="decimal"
              autoFocus
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
            />
            <div className="pb-2 text-right">
              <span className="block text-xs text-tinta-600">Vuelto</span>
              <span
                className={cx('num text-xl', vuelto !== null && vuelto < 0 && 'text-granate-600')}
              >
                {vuelto === null ? '—' : money(Math.max(vuelto, 0))}
              </span>
            </div>
          </div>
        )}
        {tipo === '01' && (
          <SupuestoDemo zg="ZG-02">
            la FCFE usa precios netos con IVA 13 % desglosado, sin retención.
          </SupuestoDemo>
        )}
      </div>
    </Modal>
  );
}
