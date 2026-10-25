import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/database.js';
import { app, bearer, login, resetDb } from './helpers.js';

let admin: string;
let cajero: string;
let seed: Awaited<ReturnType<typeof resetDb>>;

beforeAll(async () => {
  seed = await resetDb({ minimal: false, dtes: false });
  admin = await login('admin');
  cajero = await login('cajero');
});

describe('catálogo', () => {
  it('paginación de 25 en servidor con total real', async () => {
    const r = await request(app).get('/api/productos?page=2').set(bearer(admin));
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(25);
    expect(r.body.total).toBe(214);
    expect(r.body.items[0].precio).toBeTypeOf('number');
  });

  it('filtra por estado de stock', async () => {
    const r = await request(app).get('/api/productos?estado=SIN_STOCK').set(bearer(admin));
    expect(r.body.items.map((p: { sku: string }) => p.sku)).toContain('POR-ALU-0032');
    const b = await request(app)
      .get('/api/productos?estado=BAJO_STOCK&q=CAD-9V')
      .set(bearer(admin));
    expect(b.body.items[0].estado).toBe('BAJO_STOCK');
  });

  it('el Cajero recibe 403 en el catálogo pero puede buscar en el POS', async () => {
    expect((await request(app).get('/api/productos').set(bearer(cajero))).status).toBe(403);
    expect((await request(app).post('/api/productos').set(bearer(cajero)).send({})).status).toBe(
      403,
    );
    const s = await request(app).get('/api/productos/buscar?q=bic-urb-0260').set(bearer(cajero));
    expect(s.body.exact.sku).toBe('BIC-URB-0260');
    const bc = await request(app).get('/api/productos/buscar?q=7421000550551').set(bearer(cajero));
    expect(bc.body.exact.sku).toBe('LUZ-LED-0055');
  });

  it('SKU duplicado se rechaza con mensaje claro (también en alta concurrente)', async () => {
    const body = {
      sku: 'TST-DUP-0001',
      nombre: 'Producto de prueba',
      categoria: 'Accesorios',
      precio: 1000,
    };
    const rs = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/productos').set(bearer(admin)).send(body)),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    const dup = rs.find((r) => r.status === 409)!;
    expect(dup.body).toMatchObject({ code: 'SKU_DUPLICADO', field: 'sku' });
  });

  it('deshabilitar es borrado lógico y lo saca del POS', async () => {
    const id = seed.productoIdBySku['CAM-MTB-0029'];
    await request(app)
      .patch(`/api/productos/${id}/estado`)
      .set(bearer(admin))
      .send({ activo: false })
      .expect(200);
    const s = await request(app).get('/api/productos/buscar?q=CAM-MTB-0029').set(bearer(cajero));
    expect(s.body.items).toHaveLength(0);
    expect(
      await db.selectFrom('producto').select('id').where('id', '=', id).executeTakeFirst(),
    ).toBeTruthy();
    await request(app)
      .patch(`/api/productos/${id}/estado`)
      .set(bearer(admin))
      .send({ activo: true })
      .expect(200);
  });
});

describe('ingreso de lote', () => {
  it('18 u a $148.00 + 10 u a $162.00 → 28 u a $153.00, con movimiento y comprobante', async () => {
    const id = seed.productoIdBySku['BIC-URB-0260'];
    const r = await request(app).post('/api/lotes').set(bearer(admin)).send({
      producto_id: id,
      proveedor_id: seed.proveedorId,
      cantidad: 10,
      costo_unitario: 16200,
      factura_proveedor: 'F-001-2026',
      fecha_recepcion: '2026-10-20',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ costo_promedio: 15300, stock: 28 });
    const p = await request(app).get(`/api/productos/${id}`).set(bearer(admin));
    expect(p.body).toMatchObject({ stock: 28, costo_promedio: 15300 });
    const m = await request(app).get(`/api/productos/${id}/movimientos`).set(bearer(admin));
    expect(m.body.items[0]).toMatchObject({
      tipo: 'INGRESO',
      cantidad: 10,
      saldo_resultante: 28,
      factura_proveedor: 'F-001-2026',
    });
    const c = await request(app).get(`/api/lotes/${r.body.id}`).set(bearer(admin));
    expect(c.body).toMatchObject({
      proveedor: 'Importadora Ciclos del Istmo',
      costo_promedio_anterior: 14800,
      costo_promedio_nuevo: 15300,
    });
  });

  it('un servicio no admite ingresos de lote', async () => {
    const r = await request(app).post('/api/lotes').set(bearer(admin)).send({
      producto_id: seed.productoIdBySku['SER-MAN-0001'],
      proveedor_id: seed.proveedorId,
      cantidad: 1,
      costo_unitario: 100,
      factura_proveedor: 'X',
      fecha_recepcion: '2026-10-20',
    });
    expect(r.status).toBe(422);
  });
});
