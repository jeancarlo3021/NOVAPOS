/**
 * Interpreta un `issued_at` (u otra marca guardada como "wall clock") tomando
 * sus componentes LITERALES como hora local, ignorando cualquier zona.
 *
 * Motivo: las ventas guardan la hora local de la máquina sin zona
 * (`localNowISO` → "2026-07-01T21:32:05"), pero la columna es TIMESTAMPTZ, así
 * que la API la devuelve como "2026-07-01T21:32:05+00:00". Si se hace
 * `new Date(...)` el navegador la convierte a su zona (CR = -6h) y la hora sale
 * corrida. Tomando los dígitos tal cual se muestra la hora que vio el cajero,
 * sin importar si la API la devuelve con o sin offset.
 */
export function wallClockDate(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se ?? '0'));
}

/**
 * Convierte una marca UTC a hora de Costa Rica. Para columnas `timestamptz` que
 * la API devuelve SIN offset (ej. `created_at` = "2026-07-20T23:52:47"): al no
 * traer zona, `new Date()` la tomaría como local y saldría corrida +6h. Acá se
 * fuerza a UTC ('Z') y se formatea en la zona de Costa Rica.
 */
export function crDateTime(
  s?: string | null,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  if (!s) return '—';
  const str = String(s);
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(str) ? str : str + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CR', { ...opts, timeZone: 'America/Costa_Rica' });
}

/** Igual que wallClockDate pero con toLocaleString listo (es-CR por defecto). */
export function formatWallClock(
  s?: string | null,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
  locale = 'es-CR',
): string {
  const d = wallClockDate(s);
  return d ? d.toLocaleString(locale, opts) : '—';
}
