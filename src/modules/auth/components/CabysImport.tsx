import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Loader2, CheckCircle2, Trash2, X } from 'lucide-react';
import { cabysService } from '@/services/cabys/cabysService';

/** Normaliza un encabezado: minúsculas, sin tildes, espacios→_. */
const norm = (s: any) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Convierte una hoja a objetos con claves normalizadas, detectando la fila de
 * encabezado real (el Excel de Hacienda tiene filas de título arriba) y leyendo
 * los códigos como TEXTO (para no perder ceros a la izquierda).
 */
function sheetToObjects(sheet: XLSX.WorkSheet): any[] {
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
  let hIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    const cells = (aoa[i] ?? []).map(norm);
    if (cells.some(c => /categoria|codigo_cabys|^cabys|descripcion|impuesto/.test(c))) { hIdx = i; break; }
  }
  if (hIdx < 0) return [];
  const headers = (aoa[hIdx] ?? []).map(norm);
  return aoa.slice(hIdx + 1).map(arr => {
    const o: Record<string, any> = {};
    headers.forEach((h, ci) => { if (h) o[h] = arr[ci]; });
    return o;
  });
}

/** "13 %" → 13, "1 %" → 1, "exento"/"" → 0. */
function parseIva(v: any): number {
  const s = String(v ?? '').toLowerCase();
  if (!s || s.includes('exent') || s.includes('exon')) return 0;
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : 13;
}

type Row = { code: string; description: string; iva_rate: number; sheet: string };

/** Extrae las filas útiles de una hoja ya convertida a objetos normalizados. */
function rowsFromSheet(raw: any[], sheetName: string): Row[] {
  const out: Row[] = [];
  const isEscolar = sheetName.includes('escolar');
  const isModif = sheetName.includes('modific');

  for (const r0 of raw) {
    const r: Record<string, any> = {};
    for (const k of Object.keys(r0)) r[norm(k)] = r0[k];

    if (isModif) {
      // Hoja de modificaciones: solo nos interesa el IVA actual por código.
      const code = String(r['codigo_cabys'] ?? r['codigo'] ?? '').trim();
      if (!code) continue;
      const variable = norm(r['variable_modificada']);
      if (variable && !variable.includes('iva')) continue;
      out.push({ code, description: '', iva_rate: parseIva(r['variable_actual']), sheet: 'modificacion' });
      continue;
    }

    // Catálogo / útiles escolares: tomar el código y descripción MÁS profundos.
    let code = '', desc = '';
    for (let n = 9; n >= 1; n--) {
      const cv = String(r[`categoria_${n}`] ?? '').trim();
      if (cv) { code = cv; desc = String(r[`descripcion_categoria_${n}`] ?? '').trim(); break; }
    }
    // Fallback: columnas sueltas de código/descripción (hoja de útiles escolares).
    if (!code) code = String(r['codigo_cabys'] ?? r['codigo'] ?? r['cabys'] ?? '').trim();
    if (!desc) desc = String(r['descripcion'] ?? r['descripcion_del_bien_o_servicio'] ?? r['detalle'] ?? '').trim();

    if (!code || !desc) continue;
    out.push({ code, description: desc, iva_rate: parseIva(r['impuesto'] ?? r['iva']), sheet: isEscolar ? 'utiles_escolares' : 'catalogo' });
  }
  return out;
}

export function CabysImport({ onClose }: { onClose: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loadCount = () => cabysService.count().then(r => setCount(r.count)).catch(() => setCount(null));
  useEffect(() => { loadCount(); }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(''); setDone(null); setProgress('Leyendo Excel…');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });

      // Reunir filas de todas las hojas.
      const catalog = new Map<string, Row>();       // code → row (catálogo/escolar)
      const ivaOverride = new Map<string, number>(); // code → IVA (modificaciones)
      for (const name of wb.SheetNames) {
        const raw = sheetToObjects(wb.Sheets[name]);
        const rows = rowsFromSheet(raw, norm(name));
        for (const row of rows) {
          if (row.sheet === 'modificacion') ivaOverride.set(row.code, row.iva_rate);
          else if (row.description) catalog.set(row.code, row);
        }
      }
      // Aplicar IVA actualizado de la hoja de modificaciones.
      for (const [code, iva] of ivaOverride) {
        const row = catalog.get(code);
        if (row) row.iva_rate = iva;
      }

      const all = [...catalog.values()];
      if (all.length === 0) {
        // Diagnóstico: mostrar columnas detectadas de la primera hoja.
        const first = sheetToObjects(wb.Sheets[wb.SheetNames[0]]);
        const cols = first[0] ? Object.keys(first[0]).slice(0, 12).join(', ') : '(ninguna)';
        setError(`No se encontraron códigos válidos. Hojas: ${wb.SheetNames.join(', ')}. Columnas detectadas: ${cols}`);
        setBusy(false); return;
      }

      // Subir en lotes de 1000.
      const CHUNK = 1000;
      let sent = 0;
      for (let i = 0; i < all.length; i += CHUNK) {
        const chunk = all.slice(i, i + CHUNK);
        await cabysService.bulk(chunk);
        sent += chunk.length;
        setProgress(`Subiendo… ${sent.toLocaleString('es-CR')} / ${all.length.toLocaleString('es-CR')}`);
      }
      setDone(all.length);
      await loadCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar');
    } finally { setBusy(false); e.target.value = ''; }
  };

  const handleClear = async () => {
    if (!confirm('¿Vaciar TODO el catálogo CABYS?')) return;
    setBusy(true); setError('');
    try { await cabysService.clear(); await loadCount(); setDone(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={!busy ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Catálogo CABYS (global)</h2>
          <button onClick={onClose} disabled={busy} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Cargá el Excel oficial de Hacienda (catálogo + modificaciones + útiles escolares).
            Se comparte con <strong>todos los negocios</strong>. Vuelve a subirlo para actualizar.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm">
            Códigos cargados: <strong>{count == null ? '…' : count.toLocaleString('es-CR')}</strong>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          {done != null && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2"><CheckCircle2 size={15} /> Cargados {done.toLocaleString('es-CR')} códigos.</div>}
          {busy && progress && <div className="text-sm text-gray-600 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> {progress}</div>}

          <label className={`w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 cursor-pointer transition ${busy ? 'opacity-50 pointer-events-none border-gray-200' : 'border-blue-300 hover:bg-blue-50'}`}>
            <UploadCloud size={28} className="text-blue-500" />
            <span className="text-sm font-bold text-blue-700">Seleccionar Excel (.xlsx)</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={busy} />
          </label>

          <button onClick={handleClear} disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 text-red-600 border border-red-200 hover:bg-red-50 text-sm font-bold py-2 rounded-lg disabled:opacity-50">
            <Trash2 size={14} /> Vaciar catálogo
          </button>
        </div>
      </div>
    </div>
  );
}

export default CabysImport;
