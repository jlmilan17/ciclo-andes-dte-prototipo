import { cx } from './cx';

export type Estado =
  'BORRADOR' | 'FIRMADO' | 'ENCOLADO' | 'TRANSMITIDO' | 'PROCESADO' | 'RECHAZADO' | 'INVALIDADO';

const styles: Record<Estado, string> = {
  BORRADOR: 'bg-papel-50 text-tinta-600 border-borde',
  FIRMADO: 'bg-tinta-600/10 text-tinta-900 border-tinta-600/30',
  ENCOLADO: 'bg-ambar-100 text-ambar-600 border-ambar-600/40',
  TRANSMITIDO: 'bg-pizarra-400/15 text-tinta-600 border-pizarra-400/40',
  PROCESADO: 'bg-sello-100 text-sello-600 border-sello-600/40',
  RECHAZADO: 'bg-granate-100 text-granate-600 border-granate-600/40',
  INVALIDADO: 'bg-granate-100 text-granate-600 border-granate-600/40 line-through decoration-1',
};

/** Único chip de estado del DTE en toda la aplicación. */
export function EstadoDte({ estado }: { estado: Estado }) {
  return (
    <span
      data-estado={estado}
      className={cx(
        'num inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium',
        styles[estado],
      )}
    >
      {estado}
    </span>
  );
}
