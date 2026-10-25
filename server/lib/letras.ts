const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES = [
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
];
const VEINTES = [
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function menorMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(CENTENAS[c]!);
  if (r >= 30) {
    const u = r % 10;
    parts.push(
      u ? `${DECENAS[Math.floor(r / 10)]} Y ${UNIDADES[u]}` : DECENAS[Math.floor(r / 10)]!,
    );
  } else if (r >= 20) parts.push(VEINTES[r - 20]!);
  else if (r >= 10) parts.push(ESPECIALES[r - 10]!);
  else if (r > 0) parts.push(UNIDADES[r]!);
  return parts.join(' ');
}

function entero(n: number): string {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const parts: string[] = [];
  if (millones) parts.push(millones === 1 ? 'UN MILLÓN' : `${menorMil(millones)} MILLONES`);
  if (miles) parts.push(miles === 1 ? 'MIL' : `${menorMil(miles)} MIL`);
  if (resto) parts.push(menorMil(resto));
  return parts
    .join(' ')
    .replace(/UNO MIL/g, 'UN MIL')
    .replace(/UNO MILLONES/g, 'UN MILLONES');
}

/** 64736 → "SEISCIENTOS CUARENTA Y SIETE 36/100 USD" (campo totalLetras). */
export function montoEnLetras(cents: number): string {
  return `${entero(Math.floor(cents / 100))} ${String(cents % 100).padStart(2, '0')}/100 USD`;
}
