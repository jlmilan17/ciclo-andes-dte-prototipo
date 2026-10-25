import { Router } from 'express';
import { bus } from '../lib/bus.js';
import { requireAuth } from '../middleware/auth.js';
import { colaPendiente, mhStatus } from '../mh/status.js';

export const eventsRouter = Router();

/** SSE: cambios de conexión del MH, contador de cola y estados de DTE (PRT-SIM-02). */
eventsRouter.get('/events', requireAuth, async (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'mh', ...mhStatus });
  send({ type: 'cola', pendientes: await colaPendiente() });
  const off = bus.subscribe(send);
  const hb = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    off();
    clearInterval(hb);
  });
});
