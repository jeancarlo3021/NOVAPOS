import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Loader2, AlertTriangle, FileText, Receipt, FileMinus, FilePlus, Inbox, ShoppingCart } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Reporte de emisiones de Alanube (conteo de comprobantes por tipo), a nivel de
// cuenta/token → devuelve todas las empresas (tenants) de la cuenta del ambiente.

interface CompanyRow {
  idCompany?: string;
  companyName?: string;
  companyEmail?: string;
  invoices?: number;
  exportInvoices?: number;
  purchaseInvoices?: number;
  creditNotes?: number;
  debitNotes?: number;
  receiverMessages?: number;
  tickets?: number;
  paymentReceipts?: number;
  total?: number;
}
interface UserRow {
  idUser?: string;
  userEmail?: string;
  invoices?: number;
  tickets?: number;
  creditNotes?: number;
  debitNotes?: number;
  receiverMessages?: number;
  total?: number;
}
interface ReportResp {
  env: string;
  from: string;
  until: string;
  per_company: CompanyRow[] | { error: string };
  by_user: UserRow[] | { error: string };
}

const n = (v: any) => Number(v || 0).toLocaleString('es-CR');

// Rango por defecto: mes actual.
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => new Date().toISOString().slice(0, 10);

const COLS: { key: keyof CompanyRow; label: string; Icon: any }[] = [
  { key: 'invoices',        label: 'Facturas',   Icon: FileText },
  { key: 'tickets',         label: 'Tiquetes',   Icon: Receipt },
  { key: 'creditNotes',     label: 'N. Créd.',   Icon: FileMinus },
  { key: 'debitNotes',      label: 'N. Déb.',    Icon: FilePlus },
  { key: 'purchaseInvoices',label: 'F. Compra',  Icon: ShoppingCart },
  { key: 'receiverMessages',label: 'Msj. Recep.',Icon: Inbox },
];

export const AlanubeReportsView: React.FC = () => {
  const [env, setEnv] = useState<'production' | 'sandbox'>('production');
  const [from, setFrom] = useState(monthStart());
  const [until, setUntil] = useState(today());
  const [legalStatus, setLegalStatus] = useState('');   // ''=todos, ACCEPTED, REJECTED
  const [data, setData] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ env, from, until });
      if (legalStatus) qs.set('legalStatus', legalStatus);
      setData(await apiFetch<ReportResp>(`/admin/alanube/reports/emissions?${qs.toString()}`));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte'); }
    finally { setLoading(false); }
  }, [env, from, until, legalStatus]);
  useEffect(() => { load(); }, [load]);

  const companies = Array.isArray(data?.per_company) ? data!.per_company as CompanyRow[] : [];
  const users = Array.isArray(data?.by_user) ? data!.by_user as UserRow[] : [];
  const companyErr = !Array.isArray(data?.per_company) ? (data?.per_company as any)?.error : null;

  // Totales agregados de todas las empresas.
  const totals = companies.reduce((acc, r) => {
    for (const c of COLS) acc[c.key] = (acc[c.key] ?? 0) + Number(r[c.key] || 0);
    acc.total = (acc.total ?? 0) + Number(r.total || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <BarChart3 size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900">Reportes Alanube</h2>
          <p className="text-sm text-gray-500">Comprobantes emitidos por empresa y por usuario.</p>
        </div>
        <button onClick={load} disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 text-sm font-bold disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Ambiente</label>
          <select value={env} onChange={e => setEnv(e.target.value as any)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="production">Producción</option>
            <option value="sandbox">QA / Pruebas</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} max={until || undefined}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Hasta</label>
          <input type="date" value={until} onChange={e => setUntil(e.target.value)} min={from || undefined}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Estado Hacienda</label>
          <select value={legalStatus} onChange={e => setLegalStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Todos</option>
            <option value="ACCEPTED">Aceptados</option>
            <option value="REJECTED">Rechazados</option>
          </select>
        </div>
        <span className="ml-auto text-xs text-gray-400 self-center">{companies.length} empresa(s)</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}
      {companyErr && <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3">Reporte por empresa no disponible: {companyErr}</div>}

      {/* Tarjetas resumen */}
      {!loading && companies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {COLS.map(c => (
            <div key={c.key} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-bold uppercase"><c.Icon size={13} /> {c.label}</div>
              <div className="text-xl font-black text-gray-900 tabular-nums">{n(totals[c.key])}</div>
            </div>
          ))}
          <div className="bg-indigo-600 rounded-xl px-3 py-2.5 text-white">
            <div className="text-[11px] font-bold uppercase opacity-80">Total</div>
            <div className="text-xl font-black tabular-nums">{n(totals.total)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando reporte…</div>
      ) : companies.length === 0 && !companyErr ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14 text-gray-400">Sin emisiones en el rango seleccionado</div>
      ) : companies.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-black text-gray-700">Por empresa</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Empresa</th>
                  {COLS.map(c => <th key={c.key} className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">{c.label}</th>)}
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold text-gray-700 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {companies.map((r, i) => (
                  <tr key={r.idCompany ?? i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-gray-800">{r.companyName ?? '—'}</div>
                      {r.companyEmail && <div className="text-[11px] text-gray-400">{r.companyEmail}</div>}
                    </td>
                    {COLS.map(c => <td key={c.key} className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(r[c.key])}</td>)}
                    <td className="px-4 py-2.5 text-right font-black tabular-nums text-gray-900">{n(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Por usuario */}
      {!loading && users.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-black text-gray-700">Por usuario</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Usuario</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">Facturas</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">Tiquetes</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">N. Créd.</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-gray-500 uppercase">N. Déb.</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold text-gray-700 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u, i) => (
                  <tr key={u.idUser ?? i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-bold text-gray-800">{u.userEmail ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.invoices)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.tickets)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.creditNotes)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(u.debitNotes)}</td>
                    <td className="px-4 py-2.5 text-right font-black tabular-nums text-gray-900">{n(u.total)}</td>
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

export default AlanubeReportsView;
