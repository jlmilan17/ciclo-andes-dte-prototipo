import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/** Error de negocio con formato uniforme { code, message, field? }. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const unauthorized = (message = 'Autenticación requerida.') =>
  new AppError(401, 'NO_AUTENTICADO', message);
export const forbidden = (message = 'No tiene permiso para esta acción.') =>
  new AppError(403, 'ACCESO_DENEGADO', message);
export const notFound = (what = 'Recurso') =>
  new AppError(404, 'NO_ENCONTRADO', `${what} no encontrado.`);
export const conflict = (code: string, message: string, field?: string) =>
  new AppError(409, code, message, field);
export const unprocessable = (code: string, message: string, field?: string) =>
  new AppError(422, code, message, field);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ code: err.code, message: err.message, field: err.field, ...err.extra });
    return;
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    res.status(422).json({
      code: 'VALIDACION',
      message: issue?.message ?? 'Datos inválidos.',
      field: issue?.path.join('.'),
    });
    return;
  }
  // Violaciones de unicidad de PostgreSQL
  if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
    res.status(409).json({
      code: 'DUPLICADO',
      message: 'El registro ya existe.',
      field: (err as { constraint?: string }).constraint,
    });
    return;
  }
  console.error(err);
  res.status(500).json({ code: 'ERROR_INTERNO', message: 'Error interno del servidor.' });
};
