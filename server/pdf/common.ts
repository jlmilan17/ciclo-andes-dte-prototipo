import PDFDocument from 'pdfkit';

export function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export const money = (c: number | null | undefined) => {
  const v = c ?? 0;
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  return `${sign}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
};

export const fecha = (d: Date | string | null) =>
  d
    ? new Date(d).toLocaleString('es-SV', {
        timeZone: 'America/El_Salvador',
        dateStyle: 'short',
        timeStyle: 'medium',
      })
    : '—';

export const TIPO_NOMBRE: Record<string, string> = {
  '01': 'FACTURA DE CONSUMIDOR FINAL ELECTRÓNICA',
  '03': 'COMPROBANTE DE CRÉDITO FISCAL ELECTRÓNICO',
  '05': 'NOTA DE CRÉDITO ELECTRÓNICA',
};

export { PDFDocument };
