import express from 'express';
import { errorHandler } from './lib/errors.js';
import { auditoriaRouter } from './routes/auditoria.js';
import { authRouter } from './routes/auth.js';
import { cajaRouter } from './routes/caja.js';
import { clientesRouter } from './routes/clientes.js';
import { dteRouter } from './routes/dte.js';
import { eventsRouter } from './routes/events.js';
import { productosRouter } from './routes/productos.js';
import { publicConfigRouter } from './routes/publicConfig.js';
import { simRouter } from './routes/sim.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(publicConfigRouter);
  api.use(authRouter);
  api.use(auditoriaRouter);
  api.use(productosRouter);
  api.use(clientesRouter);
  api.use(cajaRouter);
  api.use(dteRouter);
  api.use(simRouter);
  api.use(eventsRouter);
  app.use('/api', api);

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NO_ENCONTRADO', message: 'Ruta no encontrada.' });
  });
  app.use(errorHandler);
  return app;
}
