import { randomBytes } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import { CODIGOS_RECHAZO, isCodigo } from './codigos.js';
import { simDb } from './db.js';
import { getEstado, setEstado } from './state.js';
import { anularDocumento, recibirDocumento, registrarRechazo, type Respuesta } from './validate.js';

/**
 * SIMULADOR del API del Ministerio de Hacienda (PRT-SIM-01). NO es el servicio real.
 * Plano de datos (/mh-sim/*): afectado por el modo de conexión.
 * Plano de control (/mh-sim/admin/*): lo usa el panel de simulación y nunca se "cae".
 */
const tokens = new Map<string, { nit: string; exp: number }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const windowHours = () => Number(process.env.INVALIDATION_WINDOW_HOURS ?? 24);

const conectividad: RequestHandler = async (req, res, next) => {
  const e = await getEstado();
  if (e.modo === 'SIN_CONEXION') {
    // Simula una caída de red: la conexión se corta sin respuesta HTTP.
    req.socket.destroy();
    return;
  }
  if (e.modo === 'LENTA') {
    await sleep(e.latencia_ms);
    // Si el cliente abandonó por timeout, no se procesa (como una respuesta perdida en la red).
    if (req.socket.destroyed || res.closed) return;
  }
  next();
};

const autenticado: RequestHandler = (req, res, next) => {
  const t = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const s = tokens.get(t);
  if (!s || s.exp < Date.now()) {
    res.status(401).json({
      estado: 'RECHAZADO',
      codigoMsg: 'RCH-008',
      descripcionMsg: CODIGOS_RECHAZO['RCH-008'].descripcion,
    });
    return;
  }
  next();
};

export function createSimApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // ---- Plano de control (herramientas de demostración) ----
  const admin = express.Router();
  admin.get('/estado', async (_req, res) => {
    res.json(await getEstado());
  });
  admin.post('/estado', async (req, res) => {
    const { modo, latencia_ms } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (['EN_LINEA', 'SIN_CONEXION', 'LENTA'].includes(modo)) patch.modo = modo;
    if (Number.isInteger(latencia_ms) && latencia_ms >= 0 && latencia_ms <= 30000)
      patch.latencia_ms = latencia_ms;
    res.json(await setEstado(patch));
  });
  admin.post('/rechazar-proximo', async (req, res) => {
    const codigo = req.body?.codigo ?? null;
    if (codigo !== null && !isCodigo(codigo)) {
      res.status(422).json({ message: 'Código de rechazo desconocido.' });
      return;
    }
    res.json(await setEstado({ rechazar_proximo: codigo }));
  });
  admin.get('/codigos', (_req, res) => {
    res.json(Object.entries(CODIGOS_RECHAZO).map(([codigo, v]) => ({ codigo, ...v })));
  });
  admin.get('/documentos', async (_req, res) => {
    res.json(
      await simDb
        .selectFrom('documento')
        .select([
          'codigo_generacion',
          'tipo_dte',
          'numero_control',
          'estado',
          'sello_recepcion',
          'fh_procesamiento',
        ])
        .orderBy('fh_procesamiento', 'desc')
        .limit(100)
        .execute(),
    );
  });
  app.use('/mh-sim/admin', admin);

  // ---- Plano de datos (simula el API del MH) ----
  const api = express.Router();
  api.use(conectividad);
  api.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'Simulador MH (demostración)' });
  });
  api.post('/auth', async (req, res) => {
    const { user, pwd } = req.body ?? {};
    const e = await simDb
      .selectFrom('emisor')
      .select(['nit', 'clave_api'])
      .where('nit', '=', String(user ?? ''))
      .executeTakeFirst();
    if (!e || e.clave_api !== pwd) {
      res.status(401).json({ status: 'ERROR', message: 'Usuario o clave del API inválidos.' });
      return;
    }
    const token = randomBytes(24).toString('base64url');
    tokens.set(token, { nit: e.nit, exp: Date.now() + 24 * 3_600_000 });
    res.json({
      status: 'OK',
      body: { user: e.nit, token: `Bearer ${token}`, tokenType: 'Bearer' },
    });
  });
  api.post('/recepcion', autenticado, async (req, res) => {
    const r = await recibirDocumento(req.body ?? {});
    await registrarRechazo(r);
    res.status(r.estado === 'PROCESADO' ? 200 : 400).json(r);
  });
  // PRT-SIM-07: modo lote, respuesta por documento.
  api.post('/recepcionlote', autenticado, async (req, res) => {
    const docs: Array<{ tipoDte: string; codigoGeneracion: string; documento: string }> =
      req.body?.documentos ?? [];
    const respuestas: Respuesta[] = [];
    let first = true;
    for (const d of docs) {
      const r = await recibirDocumento(d, { forzar: first });
      first = false;
      await registrarRechazo(r);
      respuestas.push(r);
    }
    res.json({
      idEnvio: req.body?.idEnvio ?? null,
      estado: 'PROCESADO',
      fhProcesamiento: new Date().toISOString(),
      procesados: respuestas.filter((r) => r.estado === 'PROCESADO'),
      rechazados: respuestas.filter((r) => r.estado === 'RECHAZADO'),
    });
  });
  api.post('/anulardte', autenticado, async (req, res) => {
    const r = await anularDocumento(req.body ?? {}, windowHours());
    await registrarRechazo(r);
    res.status(r.estado === 'PROCESADO' ? 200 : 400).json(r);
  });
  app.use('/mh-sim', api);

  return app;
}
