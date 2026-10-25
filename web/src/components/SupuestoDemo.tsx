import type { ReactNode } from 'react';

/** Nota discreta para supuestos provisionales (docs/ZONAS-GRISES.md). */
export function SupuestoDemo({ zg, children }: { zg: string; children: ReactNode }) {
  return (
    <p className="text-xs text-pizarra-400" title={`Ver docs/ZONAS-GRISES.md (${zg})`}>
      <span className="font-medium">Supuesto de demostración · {zg}:</span> {children}
    </p>
  );
}
