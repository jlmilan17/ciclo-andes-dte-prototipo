import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './cx';

type Tone = 'info' | 'exito' | 'aviso' | 'error';
type ToastItem = { id: number; tone: Tone; text: string };

const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});

const tones: Record<Tone, string> = {
  info: 'border-borde bg-superficie text-tinta-900',
  exito: 'border-sello-600 bg-sello-100 text-sello-600',
  aviso: 'border-ambar-600 bg-ambar-100 text-ambar-600',
  error: 'border-granate-600 bg-granate-100 text-granate-600',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-96 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx('rounded-control border px-4 py-3 text-sm shadow-lg', tones[t.tone])}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
