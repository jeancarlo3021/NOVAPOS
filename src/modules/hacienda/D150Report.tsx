import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Trash2, Download, RefreshCw, Loader2, Receipt } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface Withholding {
  id: string;
  period_year: number;
  concept: string;
  beneficiary_id_type?: string | null;
  beneficiary_id?: string | null;
  beneficiary_name: string;
  base_amount: number;
  withheld_amount: number;
  paid_at?: string | null;
  note?: string | null;
}
interface D150Summary {
  year: number;
  by_beneficiary: Array<{ beneficiary_id_type?: string | null; beneficiary_id?: string | null; beneficiary_name: string; base: number; withheld: number; count: number }>;
  by_concept: Array<{ concept: string; base: number; withheld: number; count: number }>;
  totals: { base: number; withheld: number; count: number };
}

// Conceptos de retención más comunes del D-150 (editable en el campo).
const CONCEPTS = [
  'Salarios (trabajo dependiente)',
  'Dietas y gratificaciones',
  'Servicios profesionales',
  'Alquileres',
  'Rentas de capital',
  'Comisiones',
  'Otros',
];
const ID_TYPES = [
  { v: '01', l: 'Física' }, { v: '02', l: 'Jurídica' }, { v: '03', l: 'DIMEX' }, { v: '04', l: 'NITE' },
];

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const D150Report: React.FC = () => {
  const { user } = useAuth();
  const canEdit = ['owner', 'admin', 'gerente', 'contador'].includes(user?.role ?? '');
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Withholding[]>([]);
  const [summary, setSummary] = useState<D150Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [f, setF] = useState({
    concept: CONCEPTS[2], beneficiary_id_type: '02', beneficiary_id: '', beneficiary_name: '',
    base_amount: '', withheld_amount: '', paid_at: new Date().toISOString().slice(0, 10), note: '',
  });
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [list, sum] = await Promise.all([
        apiFetch<Withholding[]>(`/tax-withholdings?year=${year}`),
        apiFetch<D150Summary>(`/tax-withholdings/d150?year=${year}`),
      ]);
      setRows(list ?? []); setSummary(sum ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!f.beneficiary_name.trim()) { setErr('Nombre del beneficiario requerido'); return; }
    setSaving(true); setErr('');
    try {
      await apiFetch('/tax-withholdings', {
        method: 'POST',
        body: JSON.stringify({
          period_year: year, concept: f.concept,
          beneficiary_id_type: f.beneficiary_id_type, beneficiary_id: f.beneficiary_id.trim() || null,
          beneficiary_name: f.beneficiary_name.trim(),
          base_amount: Number(f.base_amount) || 0, withheld_amount: Number(f.withheld_amount) || 0,
          paid_at: f.paid_at || null, note: f.note.trim() || null,
        }),
      });
      setF(p => ({ ...p, beneficiary_id: '', beneficiary_name: '', base_amount: '', withheld_amount: '', note: '' }));
      setShowForm(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta retención?')) return;
    try { await apiFetch(`/tax-withholdings/${id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo eliminar'); }
  };

  const exportCsv = () => {
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = ['Tipo ID,Cédula,Beneficiario,Concepto,Fecha,Base (renta),Retenido'];
    for (const r of rows) {
      lines.push([r.beneficiary_id_type ?? '', r.beneficiary_id ?? '', esc(r.beneficiary_name), esc(r.concept),
        (r.paid_at ?? '').slice(0, 10), Number(r.base_amount).toFixed(2), Number(r.withheld_amount).toFixed(2)].join(','));
    }
    if (summary) {
      lines.push('');
      lines.push(`TOTAL,,,,,${summary.totals.base.toFixed(2)},${summary.totals.withheld.toFixed(2)}`);
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `D150_${year}.csv`; a.click();
  };

  const years = useMemo(() => { const y = new Date().getFullYear(); return [y, y - 1, y - 2, y - 3]; }, []);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="bg-linear-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><FileText size={22} /></div>
            <div>
              <h1 className="text-xl font-black">D-150 · Resumen Anual de Retenciones</h1>
              <p className="text-white/80 text-sm">Retenciones hechas a proveedores/empleados para la declaración de Hacienda</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="bg-white/15 text-white font-bold rounded-xl px-3 py-2 text-sm">
              {years.map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
            </select>
            <button onClick={load} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><RefreshCw size={16} /></button>
            {canEdit && (
              <button onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 bg-white text-indigo-700 font-black px-4 py-2 rounded-xl text-sm hover:bg-indigo-50">
                <Plus size={16} /> Retención
              </button>
            )}
          </div>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">{err}</div>}

      {/* KPIs del resumen */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"><p className="text-gray-500 text-xs font-bold uppercase">Beneficiarios</p><p className="text-2xl font-black text-gray-900">{summary.by_beneficiary.length}</p></div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"><p className="text-gray-500 text-xs font-bold uppercase">Base (renta)</p><p className="text-2xl font-black text-gray-900">{fmt(summary.totals.base)}</p></div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"><p className="text-gray-500 text-xs font-bold uppercase">Total retenido</p><p className="text-2xl font-black text-violet-700">{fmt(summary.totals.withheld)}</p></div>
        </div>
      )}

      {/* Form de registro */}
      {showForm && canEdit && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-black text-gray-800">Nueva retención · {year}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Concepto</label>
              <input list="d150-concepts" value={f.concept} onChange={e => set('concept', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <datalist id="d150-concepts">{CONCEPTS.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Beneficiario</label>
              <input value={f.beneficiary_name} onChange={e => set('beneficiary_name', e.target.value)}
                placeholder="Nombre / razón social" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Tipo ID</label>
                <select value={f.beneficiary_id_type} onChange={e => set('beneficiary_id_type', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                  {ID_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 mb-1">Cédula</label>
                <input value={f.beneficiary_id} onChange={e => set('beneficiary_id', e.target.value.replace(/\D/g, ''))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Fecha</label>
              <input type="date" value={f.paid_at} onChange={e => set('paid_at', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Base (renta bruta)</label>
              <input type="number" inputMode="decimal" value={f.base_amount} onChange={e => set('base_amount', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Monto retenido</label>
              <input type="number" inputMode="decimal" value={f.withheld_amount} onChange={e => set('withheld_amount', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button onClick={add} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar retención'}
            </button>
          </div>
        </div>
      )}

      {/* Detalle */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900 flex items-center gap-1.5"><Receipt size={16} /> Retenciones {year}</h2>
          <button onClick={exportCsv} disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 rounded-lg px-3 py-1.5">
            <Download size={13} /> CSV
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">Sin retenciones registradas en {year}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-bold">Beneficiario</th>
                  <th className="text-left px-4 py-2.5 font-bold">Cédula</th>
                  <th className="text-left px-4 py-2.5 font-bold">Concepto</th>
                  <th className="text-right px-4 py-2.5 font-bold">Base</th>
                  <th className="text-right px-4 py-2.5 font-bold">Retenido</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800 font-bold">{r.beneficiary_name}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{r.beneficiary_id || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{r.concept}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmt(Number(r.base_amount))}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-violet-700">{fmt(Number(r.withheld_amount))}</td>
                    <td className="px-2 py-2 text-right">
                      {canEdit && <button onClick={() => del(r.id)} className="text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {summary && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-black">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={3}>TOTAL {year}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(summary.totals.base)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-violet-700">{fmt(summary.totals.withheld)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Este resumen es para llenar el <b>D-150</b> en el portal <b>ATV</b> de Hacienda. Registrá cada retención hecha a proveedores/empleados; el total retenido es lo que se declara.
      </p>
    </div>
  );
};

export default D150Report;
