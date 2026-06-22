import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, HandCoins, AlertTriangle, Users } from 'lucide-react';
import { accountsReceivableService, type Receivable, type ReceivableSummary } from '@/services/accountsReceivable/accountsReceivableService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  partial: { label: 'Abonada',   cls: 'bg-blue-100 text-blue-700' },
  paid:    { label: 'Pagada',    cls: 'bg-emerald-100 text-emerald-700' },
  overdue: { label: 'Vencida',   cls: 'bg-red-100 text-red-700' },
};
const SOURCE: Record<string, string> = { pos: 'POS', manual: 'Manual', distribution: 'Distribución' };

export const ReceivablesReport: React.FC = () => {
  const [rows, setRows] = useState<Receivable[]>([]);
  const [summary, setSummary] = useState<ReceivableSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        accountsReceivableService.list().catch(() => []),
        accountsReceivableService.summary().catch(() => null),
      ]);
      setRows(r ?? []); setSummary(s);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;

  const byCustomer = summary?.by_customer ?? [];
  const pending = rows.filter(r => r.status !== 'paid');

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Saldo por cobrar</p>
          <p className="text-xl font-black text-emerald-600">{fmt(summary?.outstanding ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 flex items-center gap-1"><AlertTriangle size={12} className="text-red-500" /> Vencido</p>
          <p className="text-xl font-black text-red-600">{fmt(summary?.overdue_amount ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Cuentas vencidas</p>
          <p className="text-xl font-black text-gray-900">{summary?.overdue_count ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Pendientes</p>
          <p className="text-xl font-black text-gray-900">{summary?.pending_count ?? 0}</p>
        </div>
      </div>

      {/* Saldo por cliente */}
      <div>
        <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><Users size={16} className="text-emerald-600" /> Saldo por cliente</h3>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr><th className="text-left px-4 py-2 font-bold">Cliente</th><th className="text-right px-4 py-2 font-bold">Cuentas</th><th className="text-right px-4 py-2 font-bold">Saldo</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {byCustomer.map((c, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-semibold text-gray-800">{c.customer_name}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{c.count}</td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-600">{fmt(c.balance)}</td>
                </tr>
              ))}
              {byCustomer.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-6">Sin saldos pendientes</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle */}
      <div>
        <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><HandCoins size={16} className="text-emerald-600" /> Cuentas pendientes</h3>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Cliente</th>
                <th className="text-left px-4 py-2 font-bold">Factura</th>
                <th className="text-left px-4 py-2 font-bold">Origen</th>
                <th className="text-left px-4 py-2 font-bold">Vence</th>
                <th className="text-right px-4 py-2 font-bold">Total</th>
                <th className="text-right px-4 py-2 font-bold">Abonado</th>
                <th className="text-right px-4 py-2 font-bold">Saldo</th>
                <th className="text-left px-4 py-2 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pending.map(r => {
                const st = STATUS[r.status] ?? STATUS.pending;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-semibold text-gray-800">{r.customer_name ?? 'Sin cliente'}</td>
                    <td className="px-4 py-2 text-gray-500">{r.invoice_number ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{SOURCE[r.source] ?? r.source}</td>
                    <td className="px-4 py-2 text-gray-500">{r.due_date ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{fmt(r.total_amount)}</td>
                    <td className="px-4 py-2 text-right text-blue-600">{fmt(r.paid_amount)}</td>
                    <td className="px-4 py-2 text-right font-bold text-gray-900">{fmt(Number(r.total_amount) - Number(r.paid_amount))}</td>
                    <td className="px-4 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
              {pending.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-6">Nada pendiente</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReceivablesReport;
