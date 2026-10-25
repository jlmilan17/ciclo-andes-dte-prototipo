import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fileUrl } from '@/api/client';
import { Card, SectionTitle } from '@/components/Card';
import { cx } from '@/components/cx';
import { dateTime } from '@/lib/format';

type Correo = {
  id: string;
  dte_id: string | null;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  adjuntos: Array<{ nombre: string; tipo: string; ruta: string }>;
  created_at: string;
  enviado_por: string | null;
};

/** Bandeja de salida simulada (sección 7). */
export function Correos() {
  const { data } = useQuery({
    queryKey: ['correos'],
    queryFn: () => api<{ items: Correo[] }>('/correos'),
  });
  const [sel, setSel] = useState<string | null>(null);
  const c = data?.items.find((x) => x.id === sel) ?? data?.items[0];
  return (
    <div className="p-6">
      <SectionTitle>Correos enviados (simulado)</SectionTitle>
      <p className="mb-4 text-sm text-tinta-600">
        Ningún correo sale de esta máquina: los mensajes quedan en esta bandeja con sus adjuntos.
      </p>
      <div className="grid grid-cols-[360px_1fr] gap-4">
        <Card className="divide-y divide-borde">
          {data?.items.map((x) => (
            <button
              key={x.id}
              onClick={() => setSel(x.id)}
              className={cx(
                'block w-full px-4 py-3 text-left text-sm hover:bg-papel-50',
                c?.id === x.id && 'bg-sello-100',
              )}
            >
              <span className="block truncate font-medium">{x.asunto}</span>
              <span className="block truncate text-xs text-tinta-600">
                {x.destinatario} · {dateTime(x.created_at)}
              </span>
            </button>
          ))}
          {data?.items.length === 0 && <p className="p-4 text-sm text-tinta-600">Bandeja vacía.</p>}
        </Card>
        {c && (
          <Card className="p-5 text-sm">
            <p className="font-medium">{c.asunto}</p>
            <p className="text-xs text-tinta-600">
              Para: {c.destinatario} · Enviado por {c.enviado_por} · {dateTime(c.created_at)}
            </p>
            <pre className="mt-4 whitespace-pre-wrap font-sans">{c.cuerpo}</pre>
            <div className="mt-4 flex flex-wrap gap-2">
              {c.adjuntos.map((a) => (
                <a
                  key={a.nombre}
                  href={fileUrl(a.ruta)}
                  target="_blank"
                  rel="noreferrer"
                  className="num rounded-control border border-borde px-3 py-1.5 text-xs hover:bg-papel-50"
                >
                  📎 {a.nombre}
                </a>
              ))}
            </div>
            {c.dte_id && (
              <Link to={`/dte/${c.dte_id}`} className="mt-3 inline-block text-sello-600 underline">
                Ver DTE
              </Link>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
