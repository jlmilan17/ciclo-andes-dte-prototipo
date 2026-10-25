import { useState } from 'react';
import { Button } from './Button';

/** Visor de JSON formateado con copiar. */
export function JsonViewer({
  value,
  maxHeight = 'max-h-[60vh]',
  testId,
}: {
  value: unknown;
  maxHeight?: string;
  testId?: string;
}) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="secondary"
        className="absolute right-2 top-2 h-7 px-2 text-xs"
        onClick={async () => {
          await navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
      <pre
        data-testid={testId}
        className={`num overflow-auto rounded-card border border-borde bg-papel-50 p-4 text-xs leading-relaxed ${maxHeight}`}
      >
        {text}
      </pre>
    </div>
  );
}
