import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/database.js';
import { resetDb } from './helpers.js';

let dteId: string;

beforeAll(async () => {
  const { adminId } = await resetDb();
  await db.insertInto('audit_log').values({ usuario_id: adminId, accion: 'PRUEBA' }).execute();
  const d = await db
    .insertInto('dte')
    .values({
      tipo: '01',
      numero_control: 'DTE-01-M001P001-000000000000001',
      codigo_generacion: 'A1F3C8D2-5B47-4E19-9C06-3D82F1E70B45',
      estado: 'BORRADOR',
      receptor: JSON.stringify({ nombre: 'Consumidor final' }),
      gravado: '1.00',
      iva: '0.13',
      retencion: '0.00',
      total: '1.13',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  dteId = d.id;
  await db
    .insertInto('dte_event')
    .values({ dte_id: dteId, estado_destino: 'BORRADOR', actor: 'test' })
    .execute();
});

describe('bitácoras de solo inserción', () => {
  it('dte_event rechaza UPDATE y DELETE', async () => {
    await expect(sql`UPDATE dte_event SET actor = 'x'`.execute(db)).rejects.toThrow(
      /solo inserción/,
    );
    await expect(sql`DELETE FROM dte_event`.execute(db)).rejects.toThrow(/solo inserción/);
  });
  it('audit_log rechaza UPDATE y DELETE', async () => {
    await expect(sql`UPDATE audit_log SET accion = 'x'`.execute(db)).rejects.toThrow(
      /solo inserción/,
    );
    await expect(sql`DELETE FROM audit_log`.execute(db)).rejects.toThrow(/solo inserción/);
  });
  it('referenced_dte_id no se puede cambiar', async () => {
    await expect(
      sql`UPDATE dte SET referenced_dte_id = id WHERE id = ${dteId}`.execute(db),
    ).rejects.toThrow(/inmutable/);
  });
  it('numero_control es único', async () => {
    await expect(
      db
        .insertInto('dte')
        .values({
          tipo: '01',
          numero_control: 'DTE-01-M001P001-000000000000001',
          codigo_generacion: 'B1F3C8D2-5B47-4E19-9C06-3D82F1E70B45',
          estado: 'BORRADOR',
          receptor: '{}',
          gravado: '1.00',
          iva: '0.13',
          retencion: '0.00',
          total: '1.13',
        })
        .execute(),
    ).rejects.toThrow(/duplicate key/);
  });
});
