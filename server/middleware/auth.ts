import type { RequestHandler } from 'express';
import { db } from '../db/database.js';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken, type Rol } from '../lib/jwt.js';

export type AuthUser = {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  cajaId: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** RNF-SEG-01: verifica JWT y estado del usuario en cada ruta protegida. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  // EventSource no permite cabeceras: el SSE acepta el token por query.
  const raw = header?.startsWith('Bearer ')
    ? header.slice(7)
    : typeof req.query.token === 'string'
      ? req.query.token
      : null;
  if (!raw) throw unauthorized();
  let claims;
  try {
    claims = await verifyToken(raw);
  } catch {
    throw new AppError(401, 'SESION_EXPIRADA', 'La sesión expiró. Vuelva a iniciar sesión.');
  }
  const u = await db
    .selectFrom('usuario')
    .selectAll()
    .where('id', '=', claims.sub)
    .executeTakeFirst();
  if (!u || !u.activo || u.bloqueado) throw unauthorized('La cuenta no está disponible.');
  if (u.token_version !== claims.tv)
    throw new AppError(401, 'SESION_EXPIRADA', 'La sesión expiró. Vuelva a iniciar sesión.');
  req.user = { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, cajaId: u.caja_id };
  next();
};

export const requireRole =
  (...roles: Rol[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.rol)) throw forbidden();
    next();
  };

export const requireAdmin = requireRole('ADMIN');
