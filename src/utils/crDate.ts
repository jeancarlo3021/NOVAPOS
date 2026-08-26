/**
 * Fechas del servidor en hora de Costa Rica.
 *
 * Varias columnas (cash_sessions.opening_date / closing_date, entre otras) son
 * `timestamp WITHOUT time zone` y el backend guarda ahí el UTC del momento. El
 * texto llega sin marca de zona —"2026-08-25 21:03:01.945"— y JavaScript, ante
 * un string así, lo interpreta como hora LOCAL. Resultado: todo se veía 6 horas
 * adelantado y los cierres cruzaban de día (una apertura de las 15:03 aparecía
 * a las 21:03, y un cierre pasada la medianoche caía en la fecha siguiente).
 *
 * `parseServerDate` marca esos textos como UTC, que es lo que realmente son, y
 * los formateadores muestran siempre en America/Costa_Rica.
 */
const CR = 'America/Costa_Rica';

/** Convierte lo que venga del servidor en un Date correcto. */
export function parseServerDate(value?: string | number | Date | null): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);

  const raw = String(value).trim();
  // Sin zona horaria (ni 'Z' ni ±HH:MM) → es UTC guardado en una columna naive.
  const tieneZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const iso = tieneZona ? raw : `${raw.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Fecha y hora en hora tica: "25/08/2026, 3:03 p. m." */
export function fmtCRDateTime(value?: string | number | Date | null, fallback = '—'): string {
  const d = parseServerDate(value);
  return d
    ? d.toLocaleString('es-CR', { timeZone: CR, dateStyle: 'short', timeStyle: 'short' })
    : fallback;
}

/** Solo la fecha, en hora tica. */
export function fmtCRDate(value?: string | number | Date | null, fallback = '—'): string {
  const d = parseServerDate(value);
  return d ? d.toLocaleDateString('es-CR', { timeZone: CR }) : fallback;
}

/** Solo la hora, en hora tica: "3:03 p. m." */
export function fmtCRTime(value?: string | number | Date | null, fallback = '—'): string {
  const d = parseServerDate(value);
  return d
    ? d.toLocaleTimeString('es-CR', { timeZone: CR, hour: '2-digit', minute: '2-digit' })
    : fallback;
}

/** El día (YYYY-MM-DD) al que pertenece un momento, en hora tica. */
export function crDayOf(value?: string | number | Date | null): string | null {
  const d = parseServerDate(value);
  return d ? d.toLocaleDateString('en-CA', { timeZone: CR }) : null;
}

/** Hoy en Costa Rica (YYYY-MM-DD). */
export const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: CR });
