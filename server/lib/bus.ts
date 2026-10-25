import { EventEmitter } from 'node:events';

/** Bus en memoria para tiempo real (SSE): modo del MH, contador de cola y estados de DTE. */
export type BusEvent =
  | { type: 'mh'; online: boolean; modo: string | null; checkedAt: string }
  | { type: 'cola'; pendientes: number }
  | { type: 'dte'; id: string; estado: string; numeroControl?: string }
  | { type: 'lote'; id: string; procesados: number; rechazados: number }
  | { type: 'reset' };

const emitter = new EventEmitter();
emitter.setMaxListeners(200);

export const bus = {
  publish(e: BusEvent) {
    emitter.emit('event', e);
  },
  subscribe(fn: (e: BusEvent) => void) {
    emitter.on('event', fn);
    return () => emitter.off('event', fn);
  },
};
