'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Search, X, MailCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface FeRow {
  id: string;
  tenant_id: string;
  business_name: string;
  invoice_number: string;
  customer_name: string | null;
  total: number;
  issued_at: string | null;
  created_at: string;
  document_type: string | null;
  fe_clave: string | null;
  fe_consecutivo: string | null;
  fe_status: string | null;
  fe_error: string | null;
  fe_emailed?: boolean | null;
  fe_request?: any;
  fe_response?: any;
}
interface FeLogResp { count: number; errors: number; rows: FeRow[]; }

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// El consecutivo REAL (20 díg) va dentro de la clave de 50 díg. `fe_consecutivo`
// a veces guarda el ID interno de Alanube (ULID), así que lo derivamos de la clave.
const consecutivoOf = (r: FeRow): string => {
  const clave = String(r.fe_clave ?? '');
  if (/^\d{50}$/.test(clave)) return clave.slice(21, 41);
  const cons = String(r.fe_consecutivo ?? '');
  if (/^\d{20}$/.test(cons)) return cons;         // consecutivo válido
  return r.invoice_number || cons || '—';         // fallback (evita mostrar el ULID)
};
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Costa_Rica' }) : '—');
const docLabel = (t?: string | null) => {
  switch (String(t ?? '')) {
    case 'factura_electronica': return 'Factura';
    case 'tiquete_electronico': return 'Tiquete';
    case 'nota_credito': return 'N. Crédito';
    case 'nota_debito': return 'N. Débito';
    default: return t || '—';
  }
};

// Semáforo del estado FE.
function statusBadge(s?: string | null) {
  const t = String(s ?? '').toLowerCase();
  if (t === 'error' || t === 'rejected' || t.includes('rechaz'))
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><AlertTriangle size={11} /> {s}</span>;
  if (t === 'accepted' || t === 'aceptado' || t === '1')
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Aceptado</span>;
  return <span className="inline-flex items-center text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{s || 'Enviado'}</span>;
}

interface Props { owners: Array<{ id: string; name: string }>; }

export const FeLogView: React.FC<Props> = ({ owners }) => {
  const [data, setData] = useState<FeLogResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const p = new URLSearchParams();
      if (tenantId) p.set('tenant_id', tenantId);
      if (search) p.set('search', search);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (onlyErrors) p.set('status', 'error');
      const qs = p.toString();
      setData(await apiFetch<FeLogResp>(`/admin/fe-log${qs ? '?' + qs : ''}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar la bitácora');
    } finally { setLoading(false); }
  }, [tenantId, search, from, to, onlyErrors]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const errorCount = useMemo(() => rows.filter(r => String(r.fe_status).toLowerCase() === 'error').length, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <FileText size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-gray-900">Bitácora de Facturas Electrónicas</h2>
          <p className="text-sm text-gray-500">Todas las emisiones FE de las empresas. Filtrá por empresa, cliente o fecha para encontrar y resolver errores rápido.</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Actualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4"><p className="text-xs font-bold text-gray-400">Comprobantes</p><p className="text-2xl font-black text-gray-900">{data?.count ?? 0}</p></div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4"><p className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertTriangle size={13} /> Con error</p><p className="text-2xl font-black text-red-700">{errorCount}</p></div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4"><p className="text-xs font-bold text-emerald-600">OK</p><p className="text-2xl font-black text-emerald-700">{(data?.count ?? 0) - errorCount}</p></div>
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
        <div className="lg:col-span-2">
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Cliente / consecutivo / clave</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }}
              placeholder="Buscar cliente…" className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-500 uppercase mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={onlyErrors} onChange={e => setOnlyErrors(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm font-bold text-red-600">Solo errores</span>
        </label>
        {(search || from || to || tenantId || onlyErrors) && (
          <button onClick={() => { setSearch(''); setFrom(''); setTo(''); setTenantId(''); setOnlyErrors(false); }}
            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"><X size={12} /> Limpiar</button>
        )}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{err}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 text-gray-400">
          <FileText size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="font-semibold">Sin comprobantes con esos filtros.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Empresa</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Consecutivo</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isErr = String(r.fe_status).toLowerCase() === 'error';
                  const open = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`border-t border-gray-50 cursor-pointer ${isErr ? 'bg-red-50/40' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpanded(open ? null : r.id)}>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{dt(r.created_at ?? r.issued_at)}</td>
                        <td className="px-4 py-2.5 font-bold text-gray-800 max-w-45 truncate">{r.business_name}</td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-40 truncate">{r.customer_name ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{consecutivoOf(r)}</td>
                        <td className="px-4 py-2.5 text-xs">{docLabel(r.document_type)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt(r.total)}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1">
                            {statusBadge(r.fe_status)}
                            {r.fe_emailed && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full" title="Comprobante enviado por correo al cliente">
                                <MailCheck size={11} /> Correo
                              </span>
                            )}
                            <span className="ml-0.5 text-[10px] text-gray-400">{open ? '▾' : '▸'}</span>
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className={isErr ? 'bg-red-50/60' : 'bg-gray-50/60'}>
                          <td colSpan={7} className="px-6 py-3 space-y-3">
                            {isErr && (
                              <div>
                                <p className="text-[11px] font-black text-red-600 uppercase mb-1">Error de Hacienda / FE</p>
                                <p className="text-sm text-red-700 whitespace-pre-wrap wrap-break-word">{r.fe_error || 'Sin detalle'}</p>
                              </div>
                            )}
                            {r.fe_clave && <p className="text-[10px] text-gray-400 font-mono">Clave: {r.fe_clave}</p>}
                            {r.fe_request && (
                              <details open={isErr}>
                                <summary className="text-[11px] font-black text-blue-600 uppercase cursor-pointer">JSON enviado a Hacienda</summary>
                                <pre className="mt-1 text-[11px] bg-gray-900 text-emerald-200 rounded-lg p-3 overflow-x-auto max-h-96">{JSON.stringify(r.fe_request, null, 2)}</pre>
                              </details>
                            )}
                            {r.fe_response && (
                              <details>
                                <summary className="text-[11px] font-black text-violet-600 uppercase cursor-pointer">Respuesta</summary>
                                <pre className="mt-1 text-[11px] bg-gray-900 text-sky-200 rounded-lg p-3 overflow-x-auto max-h-96">{JSON.stringify(r.fe_response, null, 2)}</pre>
                              </details>
                            )}
                            {!r.fe_request && !r.fe_response && !isErr && (
                              <p className="text-xs text-gray-400">Sin JSON guardado (se guarda al emitir después del deploy).</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeLogView;
