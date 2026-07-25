'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Plus, RefreshCw, Pencil, Trash2, Check, RotateCcw, X,
  AlertTriangle, CalendarClock, CircleDollarSign, Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface VP {
  id: string;
  vendor: string;
  concept: string | null;
  amount: number;
  currency: 'CRC' | 'USD';
  due_date: string | null;
  paid: boolean;
  paid_date: string | null;
  recurring: 'monthly' | 'yearly' | null;
  notes: string | null;
}

type Filter = 'all' | 'pending' | 'overdue' | 'paid';

const todayStr = () => new Date().toISOString().slice(0, 10);
const money = (n: number, cur: string) => `${cur === 'USD' ? '$' : '₡'}${Number(n || 0).toLocaleString('es-CR')}`;
const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const daysUntil = (d: string | null): number | null => {
  if (!d) return null;
  const ms = new Date(d + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000);
};

const empty: Partial<VP> = { vendor: '', concept: '', amount: 0, currency: 'CRC', due_date: '', recurring: null, notes: '', paid: false };

export const VendorPaymentsView: React.FC = () => {
  const [rows, setRows] = useState<VP[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [editing, setEditing] = useState<Partial<VP> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try { setRows(await apiFetch<VP[]>('/admin/vendor-payments')); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error al cargar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // ── KPIs (por moneda) ──────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const pend = rows.filter(r => !r.paid);
    const sum = (list: VP[], cur: string) => list.filter(r => r.currency === cur).reduce((s, r) => s + Number(r.amount || 0), 0);
    const overdue = pend.filter(r => (daysUntil(r.due_date) ?? 999) < 0);
    const soon = pend.filter(r => { const d = daysUntil(r.due_date); return d !== null && d >= 0 && d <= 7; });
    const thisMonth = rows.filter(r => r.paid && r.paid_date && r.paid_date.slice(0, 7) === todayStr().slice(0, 7));
    return {
      pendCRC: sum(pend, 'CRC'), pendUSD: sum(pend, 'USD'),
      overdueN: overdue.length, overdueCRC: sum(overdue, 'CRC'), overdueUSD: sum(overdue, 'USD'),
      soonN: soon.length,
      paidMonthCRC: sum(thisMonth, 'CRC'), paidMonthUSD: sum(thisMonth, 'USD'),
    };
  }, [rows]);

  const visible = useMemo(() => rows.filter(r => {
    if (filter === 'paid') return r.paid;
    if (filter === 'pending') return !r.paid;
    if (filter === 'overdue') return !r.paid && (daysUntil(r.due_date) ?? 999) < 0;
    return true;
  }), [rows, filter]);

  const save = async () => {
    if (!editing?.vendor?.trim()) { setErr('El proveedor es obligatorio'); return; }
    setSaving(true); setErr('');
    try {
      if (editing.id) await apiFetch(`/admin/vendor-payments/${editing.id}`, { method: 'PUT', body: JSON.stringify(editing) });
      else await apiFetch('/admin/vendor-payments', { method: 'POST', body: JSON.stringify(editing) });
      setEditing(null); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  const togglePaid = async (r: VP) => {
    try { await apiFetch(`/admin/vendor-payments/${r.id}/${r.paid ? 'unpay' : 'pay'}`, { method: 'POST' }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  };
  const remove = async (r: VP) => {
    if (!confirm(`¿Eliminar el pago a "${r.vendor}"?`)) return;
    try { await apiFetch(`/admin/vendor-payments/${r.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="animate-spin mr-2" size={20} /> Cargando…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500 flex items-center justify-center"><Wallet size={22} className="text-white" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-900">Pagos a proveedores</h2>
            <p className="text-sm text-gray-500">Proveedores y servicios de ColónClick, con sus fechas de vencimiento.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Refrescar"><RefreshCw size={16} /></button>
          <button onClick={() => { setErr(''); setEditing({ ...empty, due_date: todayStr() }); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">
            <Plus size={16} /> Nuevo
          </button>
        </div>
      </div>

      {err && !editing && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">{err}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-xs font-bold text-gray-400 flex items-center gap-1"><CircleDollarSign size={13} /> Pendiente</p>
          <p className="text-xl font-black text-gray-900">{money(kpi.pendCRC, 'CRC')}</p>
          {kpi.pendUSD > 0 && <p className="text-sm font-bold text-gray-500">{money(kpi.pendUSD, 'USD')}</p>}
        </div>
        <div className={`rounded-2xl border p-4 ${kpi.overdueN ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <p className="text-xs font-bold text-red-500 flex items-center gap-1"><AlertTriangle size={13} /> Vencidos ({kpi.overdueN})</p>
          <p className="text-xl font-black text-red-700">{money(kpi.overdueCRC, 'CRC')}</p>
          {kpi.overdueUSD > 0 && <p className="text-sm font-bold text-red-500">{money(kpi.overdueUSD, 'USD')}</p>}
        </div>
        <div className={`rounded-2xl border p-4 ${kpi.soonN ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
          <p className="text-xs font-bold text-amber-600 flex items-center gap-1"><CalendarClock size={13} /> Vencen ≤7 días</p>
          <p className="text-xl font-black text-amber-700">{kpi.soonN}</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
          <p className="text-xs font-bold text-emerald-600">Pagado este mes</p>
          <p className="text-xl font-black text-emerald-700">{money(kpi.paidMonthCRC, 'CRC')}</p>
          {kpi.paidMonthUSD > 0 && <p className="text-sm font-bold text-emerald-500">{money(kpi.paidMonthUSD, 'USD')}</p>}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {([['pending', 'Pendientes'], ['overdue', 'Vencidos'], ['paid', 'Pagados'], ['all', 'Todos']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition ${filter === f ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {visible.length === 0 ? (
          <p className="text-center py-12 text-gray-400 text-sm">Sin registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Proveedor</th>
                  <th className="text-left px-4 py-3">Concepto</th>
                  <th className="text-right px-4 py-3">Monto</th>
                  <th className="text-left px-4 py-3">Vence</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const d = daysUntil(r.due_date);
                  const overdue = !r.paid && d !== null && d < 0;
                  const soon = !r.paid && d !== null && d >= 0 && d <= 7;
                  return (
                    <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-bold text-gray-800">
                        {r.vendor}
                        {r.recurring && <span className="ml-2 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{r.recurring === 'monthly' ? 'MENSUAL' : 'ANUAL'}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-52 truncate">{r.concept || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-black text-gray-900 tabular-nums">{money(r.amount, r.currency)}</td>
                      <td className={`px-4 py-2.5 ${overdue ? 'text-red-600 font-bold' : soon ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                        {fmtDate(r.due_date)}
                        {overdue && <span className="block text-[11px]">vencido hace {Math.abs(d!)}d</span>}
                        {soon && <span className="block text-[11px]">en {d}d</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.paid
                          ? <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-bold"><Check size={12} /> Pagado</span>
                          : overdue
                            ? <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-xs font-bold">Vencido</span>
                            : <span className="inline-flex items-center gap-1 text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full text-xs font-bold">Pendiente</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => togglePaid(r)} title={r.paid ? 'Marcar pendiente' : 'Marcar pagado'}
                            className={`p-1.5 rounded-lg ${r.paid ? 'text-gray-400 hover:bg-gray-100' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                            {r.paid ? <RotateCcw size={15} /> : <Check size={15} />}
                          </button>
                          <button onClick={() => { setErr(''); setEditing({ ...r }); }} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Pencil size={15} /></button>
                          <button onClick={() => remove(r)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal alta/edición */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-gray-900">{editing.id ? 'Editar pago' : 'Nuevo pago a proveedor'}</h3>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{err}</div>}
              <div>
                <label className="text-xs font-bold text-gray-500">Proveedor *</label>
                <input value={editing.vendor ?? ''} onChange={e => setEditing({ ...editing, vendor: e.target.value })}
                  placeholder="Ej. Vercel, Alanube, Supabase…" className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Concepto</label>
                <input value={editing.concept ?? ''} onChange={e => setEditing({ ...editing, concept: e.target.value })}
                  placeholder="Ej. Hosting mensual" className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500">Monto</label>
                  <input type="number" value={editing.amount ?? 0} onChange={e => setEditing({ ...editing, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm text-right focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500">Moneda</label>
                  <select value={editing.currency ?? 'CRC'} onChange={e => setEditing({ ...editing, currency: e.target.value as 'CRC' | 'USD' })}
                    className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="CRC">Colones (₡)</option>
                    <option value="USD">Dólares ($)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500">Vence</label>
                  <input type="date" value={editing.due_date ?? ''} onChange={e => setEditing({ ...editing, due_date: e.target.value })}
                    className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500">Recurrencia</label>
                  <select value={editing.recurring ?? ''} onChange={e => setEditing({ ...editing, recurring: (e.target.value || null) as any })}
                    className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Sin recurrencia</option>
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Notas</label>
                <textarea value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={2}
                  className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={!!editing.paid} onChange={e => setEditing({ ...editing, paid: e.target.checked })} />
                Ya está pagado
              </label>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setEditing(null)} className="flex-1 h-11 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm disabled:bg-gray-300 flex items-center justify-center gap-2">
                {saving && <Loader2 className="animate-spin" size={15} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorPaymentsView;
