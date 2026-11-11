import { describe, expect, it } from 'vitest';
import { qrPng, urlConsultaPublica } from '../../lib/qr.js';

const BASE = 'http://localhost:4100/mh-sim/consultaPublica';
const COD = 'A1B2C3D4-0000-4000-8000-1234567890AB';

describe('urlConsultaPublica (ZG-22)', () => {
  it('arma la URL con ambiente, codGen y fechaEmi', () => {
    const u = new URL(
      urlConsultaPublica(
        { ambiente: '00', codigoGeneracion: COD, fechaEmision: '2026-11-11' },
        BASE,
      ),
    );
    expect(u.origin + u.pathname).toBe(BASE);
    expect(u.searchParams.get('ambiente')).toBe('00');
    expect(u.searchParams.get('codGen')).toBe(COD);
    expect(u.searchParams.get('fechaEmi')).toBe('2026-11-11');
  });

  it('usa la zona de El Salvador al recibir una fecha', () => {
    // 2026-11-12 03:00 UTC es todavía el 11 de noviembre en El Salvador (UTC−6).
    const url = urlConsultaPublica(
      { ambiente: '00', codigoGeneracion: COD, fechaEmision: new Date('2026-11-12T03:00:00Z') },
      BASE,
    );
    expect(new URL(url).searchParams.get('fechaEmi')).toBe('2026-11-11');
  });

  it('codifica los valores', () => {
    const url = urlConsultaPublica(
      { ambiente: '0 0&x=1', codigoGeneracion: 'a/b?c', fechaEmision: '2026-01-02' },
      BASE,
    );
    expect(url).toContain('ambiente=0+0%26x%3D1');
    expect(url).toContain('codGen=a%2Fb%3Fc');
    expect(new URL(url).searchParams.get('x')).toBeNull();
  });

  it('conserva parámetros de la base y rechaza fechas mal formadas', () => {
    const url = urlConsultaPublica(
      { ambiente: '00', codigoGeneracion: COD, fechaEmision: '2026-11-11' },
      `${BASE}?origen=demo`,
    );
    expect(new URL(url).searchParams.get('origen')).toBe('demo');
    expect(() =>
      urlConsultaPublica(
        { ambiente: '00', codigoGeneracion: COD, fechaEmision: '11/11/2026' },
        BASE,
      ),
    ).toThrow();
  });
});

describe('qrPng', () => {
  it('devuelve un PNG válido', async () => {
    const png = await qrPng('http://localhost/x?a=1', 200);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    // IHDR: ancho y alto en los bytes 16–23
    expect(png.readUInt32BE(16)).toBe(200);
    expect(png.readUInt32BE(20)).toBe(200);
  });
});
