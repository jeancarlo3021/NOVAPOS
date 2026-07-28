import * as XLSX from 'xlsx';

type Cell = string | number | null | undefined;
export interface XlsxSheet { name: string; rows: Cell[][]; }

/**
 * Descarga un archivo .xlsx con una HOJA (página) por cada entrada.
 * Cada `rows` es un array de arrays; la primera fila es el encabezado.
 * Excel abre cada dato en su columna y cada tipo en su propia pestaña.
 */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.length ? s.rows : [['(sin datos)']]);
    // Nombre de hoja: Excel exige ≤31 chars, sin \ / ? * [ ] : y único.
    let name = (s.name || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Hoja';
    let n = name, i = 2;
    while (used.has(n.toLowerCase())) { n = `${name.slice(0, 28)} ${i++}`; }
    used.add(n.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, n);
  }
  const fn = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, fn);
}
