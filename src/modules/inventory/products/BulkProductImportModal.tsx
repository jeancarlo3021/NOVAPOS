import React, { useState, useRef } from 'react';
import {
  X, Upload, Download, AlertCircle, CheckCircle2, Loader2, FileSpreadsheet, Trash2,
} from 'lucide-react';
import { createProduct, categoriesService, unitTypesService } from '@/services/Inventory/InventoryProductsService';
import { apiFetch } from '@/lib/api';

interface Props {
  tenantId: string;
  onClose: () => void;
  onDone: (createdCount: number) => void;
  /** Modo panel admin: importa para OTRO tenant vía endpoint admin (server-side). */
  adminMode?: boolean;
}

interface ParsedRow {
  name: string;
  sku?: string;
  sku2?: string;
  description?: string;
  supplier?: string;     // nombre, se resuelve/crea en la tabla suppliers
  unit_price: number;
  cost_price?: number;
  tracks_stock?: boolean;
  stock_quantity?: number;
  min_stock_level?: number;
  max_stock_level?: number;
  cabys_code?: string;
  iva_rate?: number;
  category?: string;     // nombre, se resuelve a id
  unit_type?: string;    // nombre o abreviación, se resuelve a id
  _error?: string;
}

const HEADERS = [
  'name', 'sku', 'sku2', 'description', 'supplier', 'unit_price', 'cost_price',
  'stock_infinito', 'stock_quantity', 'min_stock_level', 'max_stock_level',
  'category', 'unit_type', 'cabys_code', 'iva_rate',
];

// Plantilla con ';' — así Excel en español la divide en columnas al abrirla.
const TEMPLATE_CSV =
  HEADERS.join(';') + '\n' +
  'Café Americano;CAFE001;7501001;Café tradicional 8oz;Proveedor ABC;1500;800;No;100;10;200;Bebidas;Unidad;;13\n' +
  'Pan Tostado;PAN001;;Pan artesanal;Panificadora XYZ;800;400;No;50;5;100;Panadería;Unidad;;13\n' +
  'Servicio de limpieza;SERV01;;Sin control de stock;;5000;0;Sí;0;0;0;Servicios;Unidad;;13\n';

// ── Parser CSV (simple — soporta valores con comillas y comas escapadas) ──
// delim: ',' o ';' (Excel en español usa ';'). Se auto-detecta antes de llamar.
function parseCSV(text: string, delim: string = ','): string[][] {
  const rows: string[][] = [];
  let cur = '', row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === delim && !inQuotes) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
      cur = ''; row = [];
      if (c === '\r' && next === '\n') i++;
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

function num(v: string | undefined, def?: number): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return def;
  let s = String(v).trim();
  // Formato CR/europeo: la coma es decimal. "1.325,39" → miles con punto, decimal coma;
  // "1325,39" → coma decimal. "1325.39" → punto decimal (se deja).
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  s = s.replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? def : n;
}

export const BulkProductImportModal: React.FC<Props> = ({ tenantId, onClose, onDone, adminMode }) => {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const blob = new Blob(['﻿' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-productos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setError(''); setRows([]); setFileName(file.name);
    if (!/\.csv$|\.txt$/i.test(file.name)) {
      // Excel directo: pedimos al usuario que lo guarde como CSV.
      // Soportar XLSX nativo requiere lib pesada (SheetJS).
      setError('Archivo no soportado. Guardá el Excel como CSV (Archivo → Guardar como → CSV UTF-8).');
      return;
    }
    try {
      const text = await file.text();
      // Auto-detectar delimitador según la primera línea: ';' (Excel ES), tab (pegado
      // desde Excel/Sheets) o ','. Elegimos el que más columnas produce.
      const firstLine = text.split(/\r?\n/)[0] ?? '';
      const counts: Array<[string, number]> = [
        [';', firstLine.split(';').length],
        ['\t', firstLine.split('\t').length],
        [',', firstLine.split(',').length],
      ];
      const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 1 ? counts[0][0] : ',';
      const grid = parseCSV(text, delim).filter(r => r.some(c => c.trim() !== ''));
      if (grid.length === 0) { setError('Archivo vacío'); return; }
      // Primera fila = headers
      const headerRow = grid[0].map(h => h.trim().toLowerCase());
      const dataRows = grid.slice(1);

      const idx = (h: string) => headerRow.indexOf(h);
      const required = ['name', 'unit_price'];
      const missing = required.filter(h => idx(h) === -1);
      if (missing.length > 0) {
        setError(`Faltan columnas obligatorias: ${missing.join(', ')}. Usá la plantilla.`);
        return;
      }

      const parsed: ParsedRow[] = dataRows.map((r, i) => {
        const name = (r[idx('name')] ?? '').trim();
        const price = num(r[idx('unit_price')]);
        // Stock infinito: "Sí"/"si"/"true"/"x" → NO rastrea stock (tracks_stock=false).
        const infRaw = (idx('stock_infinito') >= 0 ? (r[idx('stock_infinito')] ?? '') : '').trim().toLowerCase();
        const stockInfinito = ['si', 'sí', 'true', 'x', '1', 'yes'].includes(infRaw);
        const row: ParsedRow = {
          name,
          sku:              (r[idx('sku')] ?? '').trim() || undefined,
          sku2:             idx('sku2') >= 0 ? (r[idx('sku2')] ?? '').trim() || undefined : undefined,
          description:      (r[idx('description')] ?? '').trim() || undefined,
          supplier:         idx('supplier') >= 0 ? (r[idx('supplier')] ?? '').trim() || undefined : undefined,
          unit_price:       price ?? 0,
          cost_price:       num(r[idx('cost_price')]),
          tracks_stock:     !stockInfinito,
          stock_quantity:   num(r[idx('stock_quantity')]) ?? 0,
          min_stock_level:  num(r[idx('min_stock_level')]) ?? 0,
          max_stock_level:  num(r[idx('max_stock_level')]) ?? 100,
          category:         idx('category') >= 0 ? (r[idx('category')] ?? '').trim() || undefined : undefined,
          unit_type:        idx('unit_type') >= 0 ? (r[idx('unit_type')] ?? '').trim() || undefined : undefined,
          cabys_code:       (r[idx('cabys_code')] ?? '').trim() || undefined,
          iva_rate:         num(r[idx('iva_rate')]) ?? 13,
        };
        // Validaciones — se permite precio 0 o vacío (queda en 0).
        if (!row.name)                  row._error = `Fila ${i + 2}: nombre vacío`;
        else if (price !== undefined && price < 0) row._error = `Fila ${i + 2}: precio inválido`;
        return row;
      });
      setRows(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al leer archivo');
    }
  };

  const validRows = rows.filter(r => !r._error);
  const errorRows = rows.filter(r => r._error);

  const doImport = async () => {
    setImporting(true);
    setProgress({ done: 0, total: validRows.length, errors: 0 });

    // Modo admin: enviamos TODAS las filas al backend, que resuelve categorías/
    // unidades y crea los productos para el tenant destino (service-role).
    if (adminMode) {
      try {
        const payload = validRows.map(r => ({
          name: r.name, sku: r.sku ?? '', sku2: r.sku2 ?? null, description: r.description,
          supplier: r.supplier ?? null,
          unit_price: r.unit_price, cost_price: r.cost_price,
          stock_quantity: r.stock_quantity ?? 0, min_stock_level: r.min_stock_level ?? 0,
          max_stock_level: r.max_stock_level ?? 100, tracks_stock: r.tracks_stock !== false,
          category: r.category ?? null, unit_type: r.unit_type ?? null,
          cabys_code: r.cabys_code ?? null, iva_rate: r.iva_rate ?? 13,
        }));
        const res = await apiFetch<{ created: number; errors: number; error_detail?: string | null }>(`/admin/tenants/${tenantId}/products-import`, {
          method: 'POST', body: JSON.stringify({ rows: payload }),
        }, 180000);   // hasta 3 min: la importación puede ser de cientos de filas
        setProgress({ done: validRows.length, total: validRows.length, errors: res?.errors ?? 0 });
        setImporting(false);
        const detail = res?.error_detail ? ` Detalle: ${res.error_detail}` : '';
        const created = res?.created ?? 0;
        if (created === 0) {
          // Dejamos el modal ABIERTO con el error visible (no llamamos onDone,
          // que lo cerraría desde el panel admin).
          setError(`No se creó ningún producto (errores: ${res?.errors ?? '?'}).${detail}`);
        } else {
          if ((res?.errors ?? 0) > 0) setError(`Se importaron ${created}, pero ${res.errors} fila(s) fallaron.${detail}`);
          onDone(created);
        }
      } catch (e) {
        setImporting(false);
        setError(e instanceof Error ? e.message : 'No se pudo importar (¿backend sin desplegar?).');
        // No cerramos: el usuario necesita ver el error.
      }
      return;
    }

    // 1. Pre-cargar categorías y unidades existentes (cache por nombre normalizado)
    const norm = (s: string) => s.trim().toLowerCase();
    const catCache  = new Map<string, string>();   // nombre → id
    const unitCache = new Map<string, string>();   // nombre/abbr → id
    try {
      const cats = await categoriesService.getAllCategories(tenantId);
      for (const c of cats as any[]) catCache.set(norm(c.name), c.id);
      const units = await unitTypesService.getAllUnitTypes(tenantId);
      for (const u of units as any[]) {
        unitCache.set(norm(u.name), u.id);
        if (u.abbreviation) unitCache.set(norm(u.abbreviation), u.id);
      }
    } catch (e) {
      console.warn('[bulk-import] no se pudieron precargar categorías/unidades:', e);
    }

    // Helper: busca o crea on-demand
    const resolveCategory = async (raw?: string): Promise<string | undefined> => {
      if (!raw) return undefined;
      const key = norm(raw);
      if (catCache.has(key)) return catCache.get(key);
      try {
        const created = await categoriesService.createCategory(tenantId, { name: raw.trim() } as any);
        catCache.set(key, (created as any).id);
        return (created as any).id;
      } catch (e) {
        console.warn('[bulk-import] no se pudo crear categoría', raw, e);
        return undefined;
      }
    };
    const resolveUnit = async (raw?: string): Promise<string | undefined> => {
      if (!raw) return undefined;
      const key = norm(raw);
      if (unitCache.has(key)) return unitCache.get(key);
      try {
        const created = await unitTypesService.createUnitType(tenantId, {
          name: raw.trim(),
          abbreviation: raw.trim().slice(0, 4).toLowerCase(),
        } as any);
        unitCache.set(key, (created as any).id);
        return (created as any).id;
      } catch (e) {
        console.warn('[bulk-import] no se pudo crear unidad', raw, e);
        return undefined;
      }
    };

    // 2. Importar fila por fila resolviendo cat + unidad
    let okCount = 0, errCount = 0;
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        const [category_id, unit_type_id] = await Promise.all([
          resolveCategory(r.category),
          resolveUnit(r.unit_type),
        ]);
        await createProduct(tenantId, {
          name:            r.name,
          sku:             r.sku ?? '',
          sku2:            r.sku2 ?? null,
          description:     r.description,
          unit_price:      r.unit_price,
          cost_price:      r.cost_price,
          stock_quantity:  r.stock_quantity ?? 0,
          min_stock_level: r.min_stock_level ?? 0,
          max_stock_level: r.max_stock_level ?? 100,
          tracks_stock:    r.tracks_stock !== false,
          category_id,
          unit_type_id,
          cabys_code:      r.cabys_code ?? null,
          iva_rate:        r.iva_rate ?? 13,
        } as any);
        okCount++;
      } catch (e) {
        errCount++;
        console.warn('[bulk-import] fallo:', r.name, e);
      }
      setProgress({ done: okCount + errCount, total: validRows.length, errors: errCount });
    }
    setImporting(false);
    onDone(okCount);
  };

  const reset = () => {
    setRows([]); setFileName(''); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={22} className="text-emerald-600" />
            <div>
              <h2 className="text-lg font-black text-gray-900">Importar productos masivamente</h2>
              <p className="text-xs text-gray-500">Excel guardado como CSV (UTF-8)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Paso 1: plantilla */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Download size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-sm text-blue-900">1. Descargá la plantilla</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Llenala en Excel y al guardar elegí <strong>CSV UTF-8 (delimitado por comas)</strong>.
                  Columnas obligatorias: <code className="bg-blue-100 px-1 rounded">name</code>,{' '}
                  <code className="bg-blue-100 px-1 rounded">unit_price</code>.
                </p>
                <button onClick={downloadTemplate}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg">
                  <Download size={13} /> Descargar plantilla.csv
                </button>
              </div>
            </div>
          </div>

          {/* Paso 2: upload */}
          {rows.length === 0 && !importing && (
            <label className="block">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition">
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="font-bold text-gray-700">Subí el archivo CSV</p>
                <p className="text-xs text-gray-500 mt-1">o arrastralo acá</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
            </label>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-bold text-gray-900">{fileName}</span>
                  <span className="text-gray-400 ml-2">·</span>
                  <span className="text-emerald-600 font-bold ml-2">{validRows.length} válidos</span>
                  {errorRows.length > 0 && (
                    <span className="text-red-600 font-bold ml-2">· {errorRows.length} con errores</span>
                  )}
                </div>
                {!importing && (
                  <button onClick={reset}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-red-600">
                    <Trash2 size={12} /> Cambiar archivo
                  </button>
                )}
              </div>

              {/* Tabla preview (primeras 50) */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">#</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">Nombre</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">SKU</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">SKU2</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">Precio</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">Costo</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">Stock</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">Proveedor</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">Categoría</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">Unidad</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">CABYS</th>
                      <th className="px-3 py-2 text-right font-bold text-gray-600">IVA</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-600">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 100).map((r, i) => (
                      <tr key={i} className={r._error ? 'bg-red-50' : ''}>
                        <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-1.5 font-semibold text-gray-800 truncate max-w-48">{r.name || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-500">{r.sku || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-500">{r.sku2 || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">₡{r.unit_price?.toLocaleString('es-CR')}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{r.cost_price != null ? `₡${r.cost_price.toLocaleString('es-CR')}` : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.tracks_stock === false ? '∞' : (r.stock_quantity ?? 0)}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-32">{r.supplier ?? '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-32">{r.category ?? '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 truncate max-w-32">{r.unit_type ?? '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-500">{r.cabys_code || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.iva_rate ?? 13}%</td>
                        <td className="px-3 py-1.5">
                          {r._error ? (
                            <span className="text-red-600 text-[10px]">{r._error}</span>
                          ) : (
                            <CheckCircle2 size={12} className="text-emerald-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length > 100 && (
                      <tr><td colSpan={13} className="text-center text-gray-400 py-2 text-xs">
                        +{rows.length - 100} filas más (no mostradas)
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {importing && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 size={14} className="animate-spin text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-800">
                      Importando {progress.done} / {progress.total}…
                    </span>
                    {progress.errors > 0 && (
                      <span className="text-xs text-red-600 ml-auto">{progress.errors} fallos</span>
                    )}
                  </div>
                  <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} disabled={importing}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {importing ? 'Cancelar' : 'Cerrar'}
          </button>
          <button onClick={doImport}
            disabled={validRows.length === 0 || importing}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5">
            {importing ? (<><Loader2 size={14} className="animate-spin" /> Importando…</>) :
                         (<><Upload size={14} /> Importar {validRows.length} producto{validRows.length !== 1 ? 's' : ''}</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkProductImportModal;
