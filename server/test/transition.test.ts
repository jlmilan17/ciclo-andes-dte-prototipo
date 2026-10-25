import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/database.js';
import { nextNumeroControl } from '../dte/numeracion.js';
import { InvalidTransitionError, recordCreation, transition } from '../dte/stateMachine.js';
import { newCodigoGeneracion } from '../domain/numbering.js';
import { resetDb } from './helpers.js';

async function nuevoDte() {
  return db.transaction().execute(async (trx) => {
    const d = await trx
      .insertInto('dte')
      .values({
        tipo: '01',
        numero_control: await nextNumeroControl(trx, '01'),
        codigo_generacion: newCodigoGeneracion(),
        estado: 'BORRADOR',
        receptor: '{}',
        gravado: '10.00',
        iva: '1.30',
        retencion: '0.00',
        total: '11.30',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await recordCreation(trx, d.id, 'test');
    return d.id as string;
  });
}

beforeEach(async () => {
  await resetDb();
});

describe('transition() persistente', () => {
  it('recorre el ciclo completo y deja bitácora ordenada', async () => {
    const id = await nuevoDte();
    for (const to of ['FIRMADO', 'ENCOLADO', 'TRANSMITIDO', 'PROCESADO', 'INVALIDADO'] as const) {
      await db
        .transaction()
        .execute((trx) => transition(trx, { dteId: id, to, actor: 'test', payload: { to } }));
    }
    const ev = await db
      .selectFrom('dte_event')
      .selectAll()
      .where('dte_id', '=', id)
      .orderBy('id')
      .execute();
    expect(ev.map((e) => e.estado_destino)).toEqual([
      'BORRADOR',
      'FIRMADO',
      'ENCOLADO',
      'TRANSMITIDO',
      'PROCESADO',
      'INVALIDADO',
    ]);
    expect(ev[2]!.estado_origen).toBe('FIRMADO');
  });

  it('rechaza transiciones prohibidas sin escribir nada', async () => {
    const id = await nuevoDte();
    await expect(
      db
        .transaction()
        .execute((trx) => transition(trx, { dteId: id, to: 'PROCESADO', actor: 'test' })),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    const d = await db
      .selectFrom('dte')
      .select('estado')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(d.estado).toBe('BORRADOR');
    const n = await db
      .selectFrom('dte_event')
      .select(db.fn.countAll().as('n'))
      .where('dte_id', '=', id)
      .executeTakeFirstOrThrow();
    expect(Number(n.n)).toBe(1);
  });
});

describe('numeración bajo concurrencia', () => {
  it('20 transacciones concurrentes obtienen números únicos y consecutivos', async () => {
    const nums = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.transaction().execute((trx) => nextNumeroControl(trx, '03')),
      ),
    );
    expect(new Set(nums).size).toBe(20);
    const seqs = nums.map((n) => Number(n.slice(-15))).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
