import request from 'supertest';
import { extractText, getDocumentProxy } from 'unpdf';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app, bearer, login, resetDb, simModo, startSim } from './helpers.js';

let stopSim: () => Promise<void>;
let cajero: string;
let seed: Awaited<ReturnType<typeof resetDb>>;

const binario = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function pdf(ruta: string) {
  const r = await request(app).get(`/api${ruta}`).set(bearer(cajero)).buffer(true).parse(binario);
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toBe('application/pdf');
  const buf = r.body as Buffer;
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), {
    mergePages: true,
  });
  // pdfkit escribe los diccionarios sin comprimir: así se detecta la imagen del QR.
  return { text: text.replace(/\s+/g, ' '), conImagen: buf.includes('/Subtype /Image') };
}

async function vender(clienteNombre: string | null) {
  const r = await request(app)
    .post('/api/ventas')
    .set(bearer(cajero))
    .send({
      cliente_id: clienteNombre ? seed.clienteIdByNombre[clienteNombre] : null,
      lineas: [{ producto_id: seed.productoIdBySku['CAS-URB-0114'], cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
      efectivo_recibido: 100000,
    });
  expect(r.status).toBe(201);
  const json = (await request(app).get(`/api/dte/${r.body.dte.id}/json`).set(bearer(cajero)))
    .body as {
    resumen: { totalLetras: string };
    identificacion: { fecEmi: string };
    receptor: { nit?: string; nrc?: string };
  };
  return { id: r.body.dte.id as string, estado: r.body.dte.estado as string, json };
}

beforeAll(async () => {
  stopSim = await startSim();
});
afterAll(async () => {
  await stopSim();
});
beforeEach(async () => {
  seed = await resetDb();
  cajero = await login('cajero');
  await simModo(cajero, 'EN_LINEA');
  await request(app).post('/api/caja/abrir').set(bearer(cajero)).send({ fondo_inicial: 0 });
});

describe('representación gráfica con QR (ZG-22)', () => {
  it('DTE sellado: PDF carta y ticket con ambiente, total en letras, transmisión normal y QR', async () => {
    const v = await vender('Rutas del Pacífico, S.A. de C.V.');
    expect(v.estado).toBe('PROCESADO');

    const carta = await pdf(`/dte/${v.id}/pdf`);
    expect(carta.conImagen).toBe(true);
    expect(carta.text).toContain('Ambiente: 00 · Pruebas');
    expect(carta.text).toContain('Versión del esquema: 3');
    expect(carta.text).toContain('Modelo de facturación: 1 · Previo');
    expect(carta.text).toContain('Tipo de transmisión: Normal');
    expect(carta.text).toContain('Condición de la operación: 1 · Contado');
    expect(carta.text).toContain(v.json.identificacion.fecEmi);
    expect(carta.text).toContain(`Total en letras: ${v.json.resumen.totalLetras}`);
    expect(carta.text).toContain('Unidad');
    expect(carta.text).toContain('Consulta pública (simulada)');

    const ticket = await pdf(`/dte/${v.id}/ticket.pdf`);
    expect(ticket.conImagen).toBe(true);
    expect(ticket.text).toContain('Ambiente: 00 · Pruebas');
    expect(ticket.text).toContain('Transmision: Normal');
    expect(ticket.text).toContain(v.json.resumen.totalLetras);
    expect(ticket.text).toContain(`NIT ${v.json.receptor.nit} NRC ${v.json.receptor.nrc}`);
  });

  it('DTE ENCOLADO: los PDF se generan con QR y tipo de transmisión contingencia', async () => {
    await simModo(cajero, 'SIN_CONEXION');
    const v = await vender(null);
    expect(v.estado).toBe('ENCOLADO');

    const carta = await pdf(`/dte/${v.id}/pdf`);
    expect(carta.conImagen).toBe(true);
    expect(carta.text).toContain('Ambiente: 00 · Pruebas');
    expect(carta.text).toContain('Tipo de transmisión: Contingencia');
    expect(carta.text).toContain(`Total en letras: ${v.json.resumen.totalLetras}`);
    expect(carta.text).toContain('pendiente de sello');

    const ticket = await pdf(`/dte/${v.id}/ticket.pdf`);
    expect(ticket.conImagen).toBe(true);
    expect(ticket.text).toContain('Transmision: Contingencia');
    expect(ticket.text).toContain('Pendiente de procesamiento');
    expect(ticket.text).toContain(v.json.resumen.totalLetras);
    // consumidor final: sin NIT/NRC del receptor entre «Cliente:» y el separador
    expect(ticket.text).toMatch(/Cliente: Consumidor final -{10}/);
  });
});
