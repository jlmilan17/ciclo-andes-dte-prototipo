import { config } from '../config.js';
import { db } from '../db/database.js';
import { aplicarRespuesta } from '../dte/pipeline.js';
import { EMISOR } from '../dte/emisor.js';
import { transition } from '../dte/stateMachine.js';
import { bus } from '../lib/bus.js';
import { callMh } from '../mh/client.js';
import {
  checkConnectivity,
  colaPendiente,
  mhStatus,
  onConnectivityChange,
  publishCola,
  setOnline,
} from '../mh/status.js';

export type ResultadoLote = {
  loteId: string;
  documentos: number;
  procesados: number;
  rechazados: number;
  fallido: boolean;
};

/**
 * Toma hasta BATCH_MAX_DOCUMENTS DTE ENCOLADOS con FOR UPDATE SKIP LOCKED (dos ciclos nunca
 * envían el mismo DTE), arma el JSON de lote (RF-LOT-02), lo transmite y actualiza cada DTE
 * según la respuesta por documento (RF-LOT-03).
 */
export async function transmitirLote(
  origen: 'WORKER' | 'MANUAL',
  actor = 'worker de contingencia',
): Promise<ResultadoLote | null> {
  const reclamado = await db.transaction().execute(async (trx) => {
    const docs = await trx
      .selectFrom('dte')
      .select(['id', 'tipo', 'codigo_generacion', 'jws'])
      .where('estado', '=', 'ENCOLADO')
      .orderBy('emitido_at')
      .limit(config.BATCH_MAX_DOCUMENTS)
      .forUpdate()
      .skipLocked()
      .execute();
    if (docs.length === 0) return null;
    const lote = await trx
      .insertInto('lote_contingencia')
      .values({ estado: 'ENVIADO', documentos: docs.length, json: '{}', origen })
      .returning('id')
      .executeTakeFirstOrThrow();
    const payload = {
      idEnvio: String(lote.id).toUpperCase(),
      version: 3,
      ambiente: '00',
      nitEmisor: EMISOR.nit,
      documentos: docs.map((d) => ({
        tipoDte: d.tipo,
        codigoGeneracion: d.codigo_generacion,
        documento: d.jws,
      })),
    };
    await trx
      .updateTable('lote_contingencia')
      .set({ json: JSON.stringify(payload) })
      .where('id', '=', lote.id)
      .execute();
    for (const d of docs) {
      await trx
        .updateTable('dte')
        .set((eb) => ({
          lote_id: lote.id,
          intentos_transmision: eb('intentos_transmision', '+', 1),
        }))
        .where('id', '=', d.id)
        .execute();
      await transition(trx, {
        dteId: d.id,
        to: 'TRANSMITIDO',
        actor,
        motivo: `Transmitido en lote ${payload.idEnvio.slice(0, 8)}`,
      });
    }
    return { loteId: lote.id as string, docs, payload };
  });
  if (!reclamado) return null;

  const { loteId, docs, payload } = reclamado;
  const r = await callMh('/recepcionlote', payload, {
    loteId,
    timeoutMs: 10_000 + docs.length * 200,
  });

  if (r.kind === 'ok' || r.kind === 'rechazo') {
    const respuestas = [
      ...((r.data.procesados as unknown[]) ?? []),
      ...((r.data.rechazados as unknown[]) ?? []),
    ] as Array<Record<string, unknown>>;
    let procesados = 0;
    let rechazados = 0;
    for (const d of docs) {
      const resp = respuestas.find((x) => x.codigoGeneracion === d.codigo_generacion);
      if (!resp) continue;
      const estado = await aplicarRespuesta(d.id, resp);
      if (estado === 'PROCESADO') procesados++;
      else rechazados++;
      bus.publish({ type: 'dte', id: d.id, estado });
    }
    await db
      .updateTable('lote_contingencia')
      .set({ estado: 'PROCESADO', respuesta: JSON.stringify(r.data) })
      .where('id', '=', loteId)
      .execute();
    bus.publish({ type: 'lote', id: loteId, procesados, rechazados });
    await publishCola();
    return { loteId, documentos: docs.length, procesados, rechazados, fallido: false };
  }

  // Sin respuesta: los documentos vuelven a la cola para el siguiente ciclo.
  if (r.kind === 'sin_conexion') setOnline(false);
  await db.transaction().execute(async (trx) => {
    for (const d of docs) {
      await transition(trx, {
        dteId: d.id,
        to: 'ENCOLADO',
        actor: 'sistema',
        motivo: `Lote sin respuesta del MH (${r.kind}); se reintentará`,
        payload: { error: r.error },
      });
    }
    await trx
      .updateTable('lote_contingencia')
      .set({ estado: 'FALLIDO', respuesta: JSON.stringify({ error: r.error }) })
      .where('id', '=', loteId)
      .execute();
  });
  await publishCola();
  return { loteId, documentos: docs.length, procesados: 0, rechazados: 0, fallido: true };
}

let enCurso: Promise<ResultadoLote[]> | null = null;

/** Transmite toda la cola, partida en lotes de BATCH_MAX_DOCUMENTS (RNF-LOT-02). */
export function transmitirCola(
  origen: 'WORKER' | 'MANUAL',
  actor?: string,
): Promise<ResultadoLote[]> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const out: ResultadoLote[] = [];
    try {
      for (;;) {
        const r = await transmitirLote(origen, actor);
        if (!r) break;
        out.push(r);
        if (r.fallido) break;
      }
    } finally {
      enCurso = null;
    }
    return out;
  })();
  return enCurso;
}

/** Un ciclo del worker: verifica conectividad y, si hay conexión y cola, transmite. */
export async function cicloContingencia(): Promise<ResultadoLote[]> {
  const online = await checkConnectivity();
  if (!online || (await colaPendiente()) === 0) return [];
  return transmitirCola('WORKER');
}

/**
 * RNF-LOT-01: worker independiente del POS. Además del ciclo periódico, al detectarse el
 * regreso de la conexión transmite automáticamente, sin intervención manual.
 */
export function startContingencyWorker(): () => void {
  onConnectivityChange((online, prev) => {
    if (online && !prev) setTimeout(() => void cicloContingencia().catch(console.error), 1500);
  });
  void cicloContingencia().catch(console.error);
  const t = setInterval(
    () => void cicloContingencia().catch(console.error),
    config.CONTINGENCY_POLL_SECONDS * 1000,
  );
  return () => clearInterval(t);
}

export { mhStatus };
