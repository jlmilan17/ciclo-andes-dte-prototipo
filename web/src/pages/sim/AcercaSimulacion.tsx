import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, SectionTitle } from '@/components/Card';
import { useSimEstado } from '@/layout/ConexionMh';
import { usePublicConfig } from '@/pages/auth/Login';

type Cert = {
  sujeto: string;
  nit: string;
  emitido: string;
  vence: string;
  huella: string;
  nota: string;
};

const REAL = [
  'Autenticación con JWT y control de acceso por rol verificado en el servidor (401/403).',
  'Base de datos PostgreSQL persistente con bitácoras de solo inserción (triggers).',
  'Motor tributario (IVA 13 %, retención 1 %) en centavos enteros, con pruebas.',
  'Construcción del JSON del DTE y firma JWS (RS256) verificable.',
  'Máquina de estados del DTE con bitácora inmutable de cada transición.',
  'Cola de contingencia con worker en segundo plano y transmisión por lotes.',
  'Generación de PDF, tickets térmicos y Corte Z a partir de los datos reales.',
];

const SIMULADO = [
  [
    'Ministerio de Hacienda',
    'Servicio local (`mh-sim`) que imita su API: valida firma, esquema, duplicados, padrón, NCE y plazos, y devuelve un sello. No se conecta a ningún servicio gubernamental.',
  ],
  [
    'Certificado de firma',
    'Par de llaves RSA autogenerado de pruebas; no es un certificado emitido por el MH.',
  ],
  ['Padrón de NRC', 'Lista local de NRC. El NRC 999999-9 está documentado como inexistente.'],
  [
    'Esquema JSON del DTE',
    'Estructura de demostración (ZG-11); no se afirma conformidad con el esquema oficial.',
  ],
  ['Pagos con tarjeta', 'El POS bancario es externo; solo se registra el método de pago.'],
  ['Impresora térmica', 'Vista previa de 80 mm en pantalla y exportación a PDF.'],
  [
    'Correo electrónico',
    'Se guarda en una bandeja de salida local ("Correos enviados (simulado)").',
  ],
] as const;

/** PRT-SIM-08: qué es real y qué es simulado, con los parámetros vigentes. */
export function AcercaSimulacion() {
  const cfg = usePublicConfig();
  const sim = useSimEstado();
  const cert = useQuery({
    queryKey: ['certificado'],
    queryFn: () => api<Cert>('/sim/certificado'),
  });
  return (
    <div className="max-w-5xl p-6">
      <SectionTitle>Acerca de la simulación</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="mb-2 font-cond text-lg font-semibold text-sello-600">
            Funciona de verdad
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {REAL.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 font-cond text-lg font-semibold text-ambar-600">Simulado</h2>
          <dl className="space-y-2 text-sm">
            {SIMULADO.map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="text-tinta-600">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 font-cond text-lg font-semibold">Parámetros vigentes</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-borde">
            <Param k="Modo de conexión del simulador" v={sim.data?.sim?.modo ?? 'no disponible'} />
            <Param k="Latencia del modo Lenta" v={`${sim.data?.sim?.latencia_ms ?? '—'} ms`} />
            <Param
              k="Tiempo máximo de firma y envío (RNF-CCFE-01)"
              v="3 000 ms; al superarlo, el DTE entra en contingencia"
            />
            <Param
              k="Ciclo del monitor de conectividad (CONTINGENCY_POLL_SECONDS)"
              v={`${cfg.data?.contingencyPollSeconds ?? '—'} s`}
            />
            <Param
              k="Plazo de invalidación (INVALIDATION_WINDOW_HOURS)"
              v={`${cfg.data?.invalidationWindowHours ?? '—'} h — PENDIENTE DE VALIDAR CONTRA NORMATIVA (ZG-07)`}
            />
            <Param
              k="Límite de documentos por lote (BATCH_MAX_DOCUMENTS)"
              v={`${cfg.data?.batchMaxDocuments ?? '—'} — provisional (ZG-08)`}
            />
            <Param
              k="Retención 1 % aplica a (RETENTION_APPLIES_TO)"
              v={`${cfg.data?.retentionAppliesTo ?? '—'} Gran Contribuyente y gravado > $100.00 (ZG-06)`}
            />
          </tbody>
        </table>
      </Card>

      {cert.data && (
        <Card className="mt-4 p-5 text-sm">
          <h2 className="mb-3 font-cond text-lg font-semibold">Certificado de pruebas</h2>
          <p className="num">{cert.data.sujeto}</p>
          <p className="num text-tinta-600">
            NIT {cert.data.nit} · vigente hasta {cert.data.vence.slice(0, 10)} · huella{' '}
            {cert.data.huella}
          </p>
          <p className="mt-2 text-ambar-600">{cert.data.nota}</p>
        </Card>
      )}
      <p className="mt-4 text-xs text-pizarra-400">
        Los requerimientos PRT-* son propuestas del equipo para el prototipo, no requerimientos
        formales. Ver docs/ZONAS-GRISES.md.
      </p>
    </div>
  );
}

function Param({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="py-2 pr-4 text-tinta-600">{k}</td>
      <td className="num py-2">{v}</td>
    </tr>
  );
}
