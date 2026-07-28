/**
 * Exportación CSV que Excel abre EN COLUMNAS (no todo en una).
 *
 * Por qué antes salía en una sola columna:
 *  - El delimitador era coma, pero Excel en español/Latinoamérica espera ';'.
 *  - Los valores con `toLocaleString('es-CR')` traen comas (decimales, fechas),
 *    que partían las columnas incluso con coma.
 *
 * Solución: delimitador ';' + CADA campo entre comillas (escapando comillas
 * internas) + BOM UTF-8 (para que los acentos se vean bien).
 */

type Cell = string | number | null | undefined;

/** Escapa un valor como campo CSV entrecomillado. */
function cell(v: Cell): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Convierte filas (array de arrays) a texto CSV para Excel. */
export function toCsv(rows: Cell[][], delimiter = ';'): string {
  return rows.map(r => r.map(cell).join(delimiter)).join('\r\n');
}

/**
 * Descarga un CSV que Excel abre en columnas.
 * @param filename nombre del archivo (se agrega .csv si falta)
 * @param rows     filas incluyendo el encabezado, como array de arrays
 */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  const csv = '﻿' + toCsv(rows);   // BOM UTF-8 para acentos
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
