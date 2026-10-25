const tz = 'America/El_Salvador';

/** Centavos enteros → "$1,234.56". */
export function money(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${whole}.${String(abs % 100).padStart(2, '0')}`;
}

export function dateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString('es-SV', {
    timeZone: tz,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function time(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('es-SV', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
}
