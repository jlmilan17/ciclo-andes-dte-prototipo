import { config } from '../config.js';
import { db } from '../db/database.js';
import { EMISOR, MH_API_KEY } from '../dte/emisor.js';

/** RNF-CCFE-01: firma y envío en ≤ 3 s. Pasado el tiempo, entra la política de contingencia. */
export const MH_TIMEOUT_MS = 3000;

export type MhResult =
  | { kind: 'ok' | 'rechazo'; status: number; data: Record<string, unknown>; latencia: number }
  | { kind: 'sin_conexion' | 'timeout'; latencia: number; error: string };

type CallOpts = {
  dteId?: string | null;
  loteId?: string | null;
  timeoutMs?: number;
  log?: boolean;
};

let token: string | null = null;

async function rawPost(path: string, body: unknown, timeoutMs: number, auth: boolean) {
  const res = await fetch(`${config.MH_SIM_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth && token ? { authorization: token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : {} };
}

async function ensureToken(timeoutMs: number) {
  if (token) return;
  const r = await rawPost('/auth', { user: EMISOR.nit, pwd: MH_API_KEY }, timeoutMs, false);
  if (r.status !== 200) throw new Error('Autenticación con el MH (simulado) rechazada.');
  token = r.data.body.token;
}

function classify(e: unknown): 'timeout' | 'sin_conexion' {
  const name = (e as { name?: string })?.name;
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'sin_conexion';
}

/**
 * Llamada al MH (simulado) tratado como servicio externo. Cada intercambio queda en
 * mh_exchange, que alimenta la Consola del MH (PRT-SIM-04).
 */
export async function callMh(path: string, body: unknown, opts: CallOpts = {}): Promise<MhResult> {
  const timeoutMs = opts.timeoutMs ?? MH_TIMEOUT_MS;
  const t0 = performance.now();
  let result: MhResult;
  try {
    await ensureToken(timeoutMs);
    let r = await rawPost(
      path,
      body,
      Math.max(200, Math.round(timeoutMs - (performance.now() - t0))),
      true,
    );
    if (r.status === 401) {
      token = null;
      await ensureToken(timeoutMs);
      r = await rawPost(
        path,
        body,
        Math.max(200, Math.round(timeoutMs - (performance.now() - t0))),
        true,
      );
    }
    const latencia = Math.round(performance.now() - t0);
    const rechazado = r.status >= 400 || r.data?.estado === 'RECHAZADO';
    result = { kind: rechazado ? 'rechazo' : 'ok', status: r.status, data: r.data, latencia };
  } catch (e) {
    const latencia = Math.round(performance.now() - t0);
    result = { kind: classify(e), latencia, error: (e as Error).message };
  }
  if (opts.log !== false) {
    await db
      .insertInto('mh_exchange')
      .values({
        endpoint: path,
        dte_id: opts.dteId ?? null,
        lote_id: opts.loteId ?? null,
        request: JSON.stringify(body),
        response:
          'data' in result ? JSON.stringify(result.data) : JSON.stringify({ error: result.error }),
        http_status: 'status' in result ? result.status : null,
        resultado: result.kind.toUpperCase(),
        latencia_ms: result.latencia,
      })
      .execute();
  }
  return result;
}

/** Ping de conectividad (RF-LOT-01). No se registra en la consola para no saturarla. */
export async function pingMh(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(`${config.MH_SIM_URL}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Plano de control del simulador (panel de simulación). */
export async function simAdmin<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.MH_SIM_URL}/admin${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Simulador MH respondió ${res.status}`);
  return (await res.json()) as T;
}
