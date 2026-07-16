'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Search, X, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface RecRow {
  id: string;
  tenant_id: string;
  business_name: string;
  clave: string | null;
  issuer_name: string | null;
  issuer_id: string | null;
  document_type: string | null;
  doc_date: string | null;
  total: number;
  tax: number;
  ack_status: string | null;
  source: string | null;
  purchase_id: string | null;
  created_at: string;
}
interface RecLogResp { count: number; accepted: number; rejected: number; pending: number; rows: RecRow[]; }

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const docLabel = (t?: string | null) => {
  switch (String(t ?? '')) {
    case '01': return 'Factura';
    case '02': return 'Nota débito';
    case '03': return 'Nota crédito';
    case '04': return 'Tiquete';
    default: return t || '—';
  }
};

function ackBadge(s?: string | null) {
  const t = String(s ?? '').toLowerCase();
  if (t.includes('accept') || t === '1')
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Aceptado</span>;
  if (t.includes('reject') || t === '3' || t.includes('error'))
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><AlertTriangle size={11} /> Rechazado</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><Clock size={11} /> Pendiente</span>;
}

interface Props { owners: Array<{ id: string; name: string }>; }

export const ReceptionLogView: React.FC<Props> = ({ owners }) => {
  const [data, setData] = useState<RecLogResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statusF, setStatusF] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const p = new URLSearchParams();
      if (tenantId) p.set('tenant_id', tenantId);
      if (search) p.set('search', search);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (statusF) p.set('status', statusF);
      const qs = p.toString();
      setData(await apiFetch<RecLogResp>(`/admin/reception-log${qs ? '?' + qs : ''}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar la bitácora');
    } finally { setLoading(false); }
  }, [tenantId, search, from, to, statusF]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center"><Inbox size={20} className="text-white" /></div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-gray-900">Bitácora de Recepción</h2>
          <p className="text-sm text-gray-500">Comprobantes recibidos de proveedores y su estado de aceptación ante Hacienda.</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-400">Recibidos</p><p className="text-2xl font-black text-gray-900">{data?.count ?? 0}</p></div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4"><p className="text-xs font-bold text-emerald-600">Aceptados</p><p className="text-2xl font-black text-emerald-700">{data?.accepted ?? 0}</p></div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4"><p className="text-xs font-bold text-red-600">Rechazados</p><p className="text-2xl font-black text-red-700">{data?.rejected ?? 0}</p></div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4"><p className="text-xs font-bold text-amber-600">Pendientes</p><p className="text-2xl font-black text-amber-700">{data?.pending ?? 0}</p></div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Empresa</label>
          <select value={tenantId} onChange={e => setTenantId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">Todas</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Proveedor / clave</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }}
              placeholder="Buscar proveedor…" className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Estado</label>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">Todos</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
            <option value="pending">Pendiente</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
        </div>
        {(search || from || to || tenantId || statusF) && (
          <button onClick={() => { setSearch(''); setFrom(''); setTo(''); setTenantId(''); setStatusF(''); }}
            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"><X size={12} /> Limpiar</button>
        )}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 text-gray-400">
          <Inbox size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="font-semibold">Sin comprobantes recibidos con esos filtros.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Empresa</th>
                  <th className="text-left px-4 py-3">Proveedor</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Origen</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{dt(r.created_at ?? r.doc_date)}</td>
                    <td className="px-4 py-2.5 font-bold text-gray-800 max-w-45 truncate">{r.business_name}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-52 truncate">{r.issuer_name ?? r.issuer_id ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs">{docLabel(r.document_type)}</td>
                    <td className="px-4 py-2.5 text-xs">{r.source === 'email' ? '📧 correo' : r.source ?? 'manual'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                    <td className="px-4 py-2.5">{ackBadge(r.ack_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceptionLogView;
