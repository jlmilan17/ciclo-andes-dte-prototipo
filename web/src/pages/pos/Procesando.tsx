import { cx } from '@/components/cx';

export type Paso = { paso: 'json' | 'firma' | 'transmision'; ms: number; resultado?: string };

const ETIQUETAS: Record<Paso['paso'], string> = {
  json: 'Generar JSON del DTE',
  firma: 'Firmar con JWS (certificado de pruebas)',
  transmision: 'Transmitir al MH (simulado)',
};

/** Procesando DTE: tres pasos reales con su duración medida en el servidor. */
export function Procesando({ pasos, error }: { pasos: Paso[] | null; error: string | null }) {
  const orden: Paso['paso'][] = ['json', 'firma', 'transmision'];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta-900/50"
      role="alertdialog"
      aria-label="Procesando DTE"
    >
      <div className="w-full max-w-md rounded-card bg-superficie p-6 shadow-2xl">
        <h2 className="mb-4 font-cond text-xl font-semibold">Procesando DTE</h2>
        <ol className="flex flex-col gap-3">
          {orden.map((k, i) => {
            const p = pasos?.find((x) => x.paso === k);
            const activo = !pasos && !error && i === 0;
            const encolado =
              k === 'transmision' && p && p.resultado !== 'OK' && p.resultado !== 'RECHAZO';
            return (
              <li key={k} className="flex items-center gap-3 text-sm">
                <span
                  className={cx(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-xs',
                    p
                      ? encolado
                        ? 'border-ambar-600 bg-ambar-100 text-ambar-600'
                        : 'border-sello-600 bg-sello-100 text-sello-600'
                      : 'border-borde text-pizarra-400',
                    activo && 'animate-pulse border-sello-600',
                  )}
                >
                  {p ? (encolado ? '!' : '✓') : i + 1}
                </span>
                <span className="flex-1">{ETIQUETAS[k]}</span>
                <span className="num text-xs text-tinta-600">
                  {p ? `${p.ms} ms${encolado ? ` · ${p.resultado}` : ''}` : activo ? '…' : ''}
                </span>
              </li>
            );
          })}
        </ol>
        {error && (
          <p className="mt-4 rounded-control bg-granate-100 px-3 py-2 text-sm text-granate-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
