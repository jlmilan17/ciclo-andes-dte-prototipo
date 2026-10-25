import { dateTime, money } from '@/lib/format';

export type CorteZ = {
  turnoId: string;
  caja: string;
  cajero: string;
  apertura: string;
  cierre: string | null;
  numero: number | null;
  fondoInicial: number;
  porMetodo: Record<'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA', { ventas: number; monto: number }>;
  totalVentas: number;
  ventasCount: number;
  dtePorTipo: Record<'01' | '03' | '05', { cantidad: number; monto: number }>;
  invalidados: { cantidad: number; monto: number; documentos: string[] };
  pendientesContingencia: number;
  rechazados: number;
  efectivoEsperado: number;
  efectivoContado: number | null;
  diferencia: number | null;
};

const METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
};

/** Vista previa térmica de 80 mm del Corte Z (RNF-CAJ-01). */
export function CorteTermico({ c }: { c: CorteZ }) {
  const Row = ({ l, r, b }: { l: string; r: string; b?: boolean }) => (
    <div className={`flex justify-between ${b ? 'font-medium' : ''}`}>
      <span>{l}</span>
      <span>{r}</span>
    </div>
  );
  const Sep = () => <p className="my-1 border-t border-dashed border-tinta-600" />;
  return (
    <div
      data-testid="corte-termico"
      className="num w-[302px] bg-white px-4 py-5 text-[11px] leading-snug text-tinta-900 shadow"
    >
      <p className="text-center font-medium">CICLO ANDES, S.A. DE C.V.</p>
      <p className="text-center">NIT 0614-120598-102-3 · NRC 245891-8</p>
      <Sep />
      <p className="text-center text-sm font-medium">
        {c.numero ? `CORTE Z #${String(c.numero).padStart(4, '0')}` : 'CORTE Z · VISTA PREVIA'}
      </p>
      <p className="text-center">
        {c.caja} · {c.cajero}
      </p>
      <p className="text-center">Apertura {dateTime(c.apertura)}</p>
      {c.cierre && <p className="text-center">Cierre {dateTime(c.cierre)}</p>}
      <Sep />
      <p className="text-center font-medium">INGRESOS POR MÉTODO DE PAGO</p>
      {Object.entries(c.porMetodo).map(([k, v]) => (
        <Row key={k} l={`${METODO[k]} (${v.ventas})`} r={money(v.monto)} />
      ))}
      <Row l={`TOTAL VENTAS (${c.ventasCount})`} r={money(c.totalVentas)} b />
      <Sep />
      <p className="text-center font-medium">DTE POR TIPO</p>
      <Row l={`FCFE 01 (${c.dtePorTipo['01'].cantidad})`} r={money(c.dtePorTipo['01'].monto)} />
      <Row l={`CCFE 03 (${c.dtePorTipo['03'].cantidad})`} r={money(c.dtePorTipo['03'].monto)} />
      <Row
        l={`NCE 05 (${c.dtePorTipo['05'].cantidad})`}
        r={`−${money(c.dtePorTipo['05'].monto)}`}
      />
      <Row l="Pendientes en contingencia" r={String(c.pendientesContingencia)} />
      <Row l="Rechazados" r={String(c.rechazados)} />
      <Sep />
      <p className="text-center font-medium">ANULADAS (EXCLUIDAS)</p>
      <Row l={`Invalidados (${c.invalidados.cantidad})`} r={money(c.invalidados.monto)} />
      {c.invalidados.documentos.map((n) => (
        <p key={n} className="text-center text-[10px]">
          {n}
        </p>
      ))}
      <Sep />
      <p className="text-center font-medium">EFECTIVO</p>
      <Row l="Fondo inicial" r={money(c.fondoInicial)} />
      <Row l="Ventas en efectivo" r={money(c.porMetodo.EFECTIVO.monto)} />
      <Row l="Esperado" r={money(c.efectivoEsperado)} b />
      <Row l="Contado" r={c.efectivoContado === null ? '—' : money(c.efectivoContado)} />
      <Row l="Diferencia" r={c.diferencia === null ? '—' : money(c.diferencia)} b />
      <Sep />
      <p className="text-center text-[10px]">Terminal bloqueada hasta nueva apertura.</p>
    </div>
  );
}
