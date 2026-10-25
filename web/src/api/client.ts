const TOKEN_KEY = 'ca.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

export const SESSION_EXPIRED_EVENT = 'ca:session-expired';

type Opts = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token && data?.code !== 'CREDENCIALES_INCORRECTAS') {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      res.status,
      data?.code ?? 'ERROR',
      data?.message ?? res.statusText,
      data?.field,
      data ?? undefined,
    );
  }
  return data as T;
}

/** URL autenticada para abrir archivos (PDF, JSON) en visores embebidos. */
export function fileUrl(path: string): string {
  const t = tokenStore.get();
  return `/api${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(t ?? '')}`;
}
