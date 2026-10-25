import bcrypt from 'bcryptjs';
import { config } from '../../config.js';
import type { AnyDb } from '../types.js';

export const DEMO_PASSWORD = 'Demo2026!';

export const USUARIOS = {
  admin: { nombre: 'Daniela Reina', correo: 'daniela.reina@cicloandes.test', rol: 'ADMIN' },
  cajero: {
    nombre: 'José Luis Hernández',
    correo: 'jose.hernandez@cicloandes.test',
    rol: 'CAJERO',
  },
  cajeroPrueba: { nombre: 'Marta López', correo: 'marta.lopez@cicloandes.test', rol: 'CAJERO' },
} as const;

export async function seedBase(db: AnyDb) {
  await db
    .insertInto('config')
    .values([
      { clave: 'RETENTION_APPLIES_TO', valor: config.RETENTION_APPLIES_TO },
      { clave: 'INVALIDATION_WINDOW_HOURS', valor: String(config.INVALIDATION_WINDOW_HOURS) },
      { clave: 'BATCH_MAX_DOCUMENTS', valor: String(config.BATCH_MAX_DOCUMENTS) },
    ])
    .execute();

  const cajas = await db
    .insertInto('caja')
    .values([
      { codigo: 'CAJA 01', nombre: 'Caja 01 · Mostrador' },
      { codigo: 'CAJA 02', nombre: 'Caja 02 · Taller' },
    ])
    .returning(['id', 'codigo'])
    .execute();
  const caja1 = cajas.find((c) => c.codigo === 'CAJA 01')!.id;
  const caja2 = cajas.find((c) => c.codigo === 'CAJA 02')!.id;

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = await db
    .insertInto('usuario')
    .values([
      { ...USUARIOS.admin, password_hash: hash, caja_id: null },
      { ...USUARIOS.cajero, password_hash: hash, caja_id: caja1 },
      { ...USUARIOS.cajeroPrueba, password_hash: hash, caja_id: caja2 },
    ])
    .returning(['id', 'correo'])
    .execute();

  await db
    .insertInto('motivo_invalidacion')
    .values([
      {
        id: 1,
        descripcion: 'Error en la información del documento',
        requiere_observaciones: false,
      },
      { id: 2, descripcion: 'Rescindir la operación realizada', requiere_observaciones: false },
      { id: 3, descripcion: 'Otro', requiere_observaciones: true },
    ])
    .execute();

  const byCorreo = (c: string) => users.find((u) => u.correo === c)!.id;
  return {
    caja1,
    caja2,
    adminId: byCorreo(USUARIOS.admin.correo),
    cajeroId: byCorreo(USUARIOS.cajero.correo),
    cajeroPruebaId: byCorreo(USUARIOS.cajeroPrueba.correo),
  };
}
