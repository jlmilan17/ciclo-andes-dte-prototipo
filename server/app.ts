import express from 'express';
import { errorHandler } from './lib/errors.js';
import { auditoriaRouter } from './routes/auditoria.js';
import { authRouter } from './routes/auth.js';
import { publicConfigRouter } from './routes/publicConfig.js';

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
  app.use('/api', api);

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NO_ENCONTRADO', message: 'Ruta no encontrada.' });
  });
  app.use(errorHandler);
  return app;
}
