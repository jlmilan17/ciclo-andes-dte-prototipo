import { cx } from './cx';

type Props = {
  numeroControl: string;
  codigoGeneracion: string;
  selloRecepcion?: string | null;
  contingencia?: boolean;
};

/** Elemento firma: banda monoespaciada tipo ticket con los tres identificadores del DTE. */
export function BandaSello({
  numeroControl,
  codigoGeneracion,
  selloRecepcion,
  contingencia,
}: Props) {
  const pendiente = contingencia || !selloRecepcion;
  return (
    <div
      data-testid="banda-sello"
      className={cx(
        'num rounded-card border-2 border-dashed px-5 py-4 text-sm',
        pendiente ? 'border-ambar-600 bg-ambar-100/60' : 'border-sello-600 bg-sello-100/50',
      )}
    >
      <Row label="Número de control" value={numeroControl} />
      <Row label="Código de generación" value={codigoGeneracion} />
      <Row
        label="Sello de recepción"
        value={pendiente ? 'Pendiente · se asignará al transmitir el lote' : selloRecepcion!}
        tone={pendiente ? 'text-ambar-600' : 'text-sello-600 font-medium'}
      />
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-1">
      <span className="text-xs uppercase tracking-wide text-tinta-600">{label}</span>
      <span className={cx('break-all text-right', tone)}>{value}</span>
    </div>
  );
}
