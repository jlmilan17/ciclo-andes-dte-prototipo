import express from 'express';

// Simulador del API del Ministerio de Hacienda. NO es el servicio real.
export function createSimApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/mh-sim/health', (_req, res) => {
    res.json({ ok: true, servicio: 'Simulador MH (demostración)' });
  });

  return app;
}
