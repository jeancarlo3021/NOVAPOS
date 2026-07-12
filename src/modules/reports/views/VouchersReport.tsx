'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Ban, CreditCard, Banknote, Smartphone, Download, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatWallClock } from '@/utils/datetime';

interface Row {
  id: string;
  invoice_number: string;
  customer_name?: string | null;
  total: number;
  payment_method: string;
  payments?: { method: string; amount: number; voucher_number?: string }[] | null;
  voucher_number?: string | null;
  currency?: string | null;
  exchange_rate?: number | null;
  status: string;
  fe_clave?: string | null;
  fe_nc_clave?: string | null;
  cashier_name?: string | null;
  issued_at: string;
}
interface Data {
  payments: Row[];
  voids: Row[];
  summary: {
    payments_count: number; payments_total: number;
    voids_count: number; voids_total: number;
    by_method: Record<string, number>;
  };
}

const PM_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE', credit: 'Crédito' };
const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

interface Props { tenantId: string | null; from: string; to: string; }

export const VouchersReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'payments' | 'voids'>('payments');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const d = await apiFetch<Data>(`/reports/vouchers?from=${from}&to=${to}`);
      setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId, from, to]);

  const rows = view === 'payments' ? (data?.payments ?? []) : (data?.voids ?? []);

  const paymentLabel = (r: Row): string => {
    if (r.payments && r.payments.length > 1) {
      return r.payments.map(p => `${PM_LABEL[p.method] ?? p.method} ${fmt(p.amount)}${p.voucher_number ? ` #${p.voucher_number}` : ''}`).join(' · ');
    }
    const v = r.voucher_number ? ` #${r.voucher_number}` : '';
    return `${PM_LABEL[r.payment_method] ?? r.payment_method}${v}`;
  };

  const exportCSV = () => {
    const head = ['Factura', 'Fecha', 'Cliente', 'Cajero', 'Metodo/Comprobante', 'Moneda', 'Total', view === 'voids' ? 'Clave NC' : 'Clave FE'];
    const lines = rows.map(r => [
      r.invoice_number,
      formatWallClock(r.issued_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      (r.customer_name ?? '').replace(/;/g, ','),
      (r.cashier_name ?? '').replace(/;/g, ','),
      paymentLabel(r).replace(/;/g, ','),
      r.currency ?? 'CRC',
      String(r.total ?? 0),
      (view === 'voids' ? r.fe_nc_clave : r.fe_clave) ?? '',
    ].join(';'));
    const csv = '﻿' + [head.join(';'), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `comprobantes-${view}-${from}_a_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const methodCards = useMemo(() => Object.entries(data?.summary.by_method ?? {}), [data]);

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 gap-2"><RefreshCw size={18} className="animate-spin" /> Cargando…</div>;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-400 uppercase">Pagos</p>
          <p className="text-2xl font-black text-gray-900">{data?.summary.payments_count ?? 0}</p>
          <p className="text-sm font-bold text-emerald-600">{fmt(data?.summary.payments_total ?? 0)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-bold text-gray-400 uppercase">Anulaciones</p>
          <p className="text-2xl font-black text-gray-900">{data?.summary.voids_count ?? 0}</p>
          <p className="text-sm font-bold text-red-600">{fmt(data?.summary.voids_total ?? 0)}</p>
        </div>
        {methodCards.slice(0, 2).map(([m, v]) => (
          <div key={m} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
              {m === 'cash' ? <Banknote size={12} /> : m === 'card' ? <CreditCard size={12} /> : <Smartphone size={12} />}
              {PM_LABEL[m] ?? m}
            </p>
            <p className="text-lg font-black text-gray-900">{fmt(v)}</p>
          </div>
        ))}
      </div>

      {/* Toggle Pagos / Anulaciones + export */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button onClick={() => setView('payments')}
            className={`px-4 py-2 rounded-lg text-sm font-black flex items-center gap-1.5 ${view === 'payments' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>
            <Receipt size={14} /> Pagos ({data?.summary.payments_count ?? 0})
          </button>
          <button onClick={() => setView('voids')}
            className={`px-4 py-2 rounded-lg text-sm font-black flex items-center gap-1.5 ${view === 'voids' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500'}`}>
            <Ban size={14} /> Anulaciones ({data?.summary.voids_count ?? 0})
          </button>
        </div>
        <div className="flex-1" />
        <button onClick={exportCSV} disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
          <Download size={14} /> CSV
        </button>
        <button onClick={load} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50"><RefreshCw size={14} /></button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Factura</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Cliente / Cajero</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">{view === 'voids' ? 'Nota de Crédito' : 'Método · Comprobante'}</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Sin registros en el rango.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-mono font-black text-gray-900">{r.invoice_number}</p>
                    {r.fe_clave && <p className="text-[10px] text-gray-400 font-mono truncate max-w-40" title={r.fe_clave}>FE {r.fe_clave.slice(-8)}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{formatWallClock(r.issued_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800">{r.customer_name || 'Cliente General'}</p>
                    {r.cashier_name && <p className="text-[11px] text-gray-400">{r.cashier_name}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {view === 'voids' ? (
                      r.fe_nc_clave
                        ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><Ban size={12} /> NC {String(r.fe_nc_clave).slice(-8)}</span>
                        : <span className="text-xs text-gray-400">Anulada (sin NC)</span>
                    ) : (
                      <span className="text-gray-700 text-xs">{paymentLabel(r)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {r.currency === 'USD' && r.exchange_rate ? <span className="text-[10px] text-gray-400 mr-1">${(r.total / r.exchange_rate).toFixed(2)}</span> : null}
                    <span className={view === 'voids' ? 'text-red-600' : 'text-gray-900'}>{fmt(r.total)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VouchersReport;
