import { Router } from 'express';
import { config } from '../config.js';

export const publicConfigRouter = Router();

/** Parámetros no sensibles que la UI necesita antes de iniciar sesión. */
publicConfigRouter.get('/config/public', (_req, res) => {
  res.json({
    demoMode: config.DEMO_MODE,
    invalidationWindowHours: config.INVALIDATION_WINDOW_HOURS,
    batchMaxDocuments: config.BATCH_MAX_DOCUMENTS,
    retentionAppliesTo: config.RETENTION_APPLIES_TO,
    contingencyPollSeconds: config.CONTINGENCY_POLL_SECONDS,
  });
});
