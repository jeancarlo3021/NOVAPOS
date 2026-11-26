import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, HandCoins, AlertTriangle, Users, Download, ArrowDownToLine } from 'lucide-react';
import { accountsReceivableService, type Receivable, type ReceivableSummary, type AbonoCobrado } from '@/services/accountsReceivable/accountsReceivableService';
import { AbonosModal } from '@/modules/accountsReceivable/AbonosDeCuenta';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  partial: { label: 'Abonada',   cls: 'bg-blue-100 text-blue-700' },
  paid:    { label: 'Pagada',    cls: 'bg-emerald-100 text-emerald-700' },
  overdue: { label: 'Vencida',   cls: 'bg-red-100 text-red-700' },
};
const SOURCE: Record<string, string> = { pos: 'POS', manual: 'Manual', distribution: 'Distribución' };

const METHOD: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE', transfer: 'Transferencia',
  bank_transfer: 'Transferencia', check: 'Cheque',
};

/**
 * `from`/`to` son el rango del panel de reportes.
 *
 * Los saldos son una foto de HOY y no dependen del rango; los abonos sí: son el
 * dinero que de verdad entró en esas fechas.
 */
export const ReceivablesReport: React.FC<{ from?: string; to?: string }> = ({ from, to }) => {
  const [rows, setRows] = useState<Receivable[]>([]);
  const [summary, setSummary] = useState<ReceivableSummary | null>(null);
  const [abonos, setAbonos] = useState<AbonoCobrado[]>([]);
  const [abonosErr, setAbonosErr] = useState(false);
  const [loading, setLoading] = useState(true);
  /**
   * LA CUENTA DEL ABONO QUE SE ESTÁ REVISANDO.
   *
   * Este reporte es donde alguien repasa la plata que entró, así que es donde
   * se descubre el abono mal puesto. Antes había que salir a buscar la cuenta
   * del cliente a mano —y si el abono la había cancelado, no aparecía en la
   * lista de pendientes—.
   */
  const [cuentaAbonos, setCuentaAbonos] = useState<Receivable | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const verAbonos = async (receivableId: string) => {
    setAbriendo(receivableId);
    try { setCuentaAbonos(await accountsReceivableService.get(receivableId)); }
    catch { /* la cuenta pudo haberse borrado: no se abre nada */ }
    finally { setAbriendo(null); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s, a] = await Promise.all([
        accountsReceivableService.list().catch(() => []),
        accountsReceivableService.summary().catch(() => null),
        // El cobro de un crédito es ENTRADA DE DINERO, no una venta nueva: la
        // venta se facturó el día del despacho. Por eso va en su propio bloque
        // y nunca se suma a las ventas del período.
        (from && to)
          ? accountsReceivableService.paymentsByDate(from, to).catch(() => null)
          : Promise.resolve([] as AbonoCobrado[]),
      ]);
      setRows(r ?? []); setSummary(s);
      setAbonos(a ?? []); setAbonosErr(a === null);
    } finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;

  const byCustomer = summary?.by_customer ?? [];
  const pending = rows.filter(r => r.status !== 'paid');

  const cobrado = abonos.reduce((t, a) => t + Number(a.amount || 0), 0);
  const porMetodo = abonos.reduce<Record<string, number>>((acc, a) => {
    const k = a.method || 'cash';
    acc[k] = (acc[k] ?? 0) + Number(a.amount || 0);
    return acc;
  }, {});

  const bajarCSV = () => {
    const filas = [
      ['Fecha', 'Cliente', 'Factura', 'Origen', 'Método', 'Monto'],
      ...abonos.map(a => [
        String(a.created_at ?? '').slice(0, 16).replace('T', ' '),
        a.cliente ?? '', a.factura ?? '', a.origen ?? '',
        METHOD[a.method] ?? a.method, String(a.amount),
      ]),
      ['', '', '', '', 'Total', String(cobrado)],
    ];
    const csv = filas
      .map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    // BOM: sin él Excel en Windows parte los acentos de los nombres.
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `abonos-cobrados-${from ?? ''}-${to ?? ''}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

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
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
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

      {/* ── Abonos cobrados: el dinero que ENTRÓ en el período ──
          Lo que faltaba. El reporte solo mostraba saldos, así que el cobro de
          una cuenta no aparecía en ninguna parte como ingreso: el único rastro
          era que el saldo del cliente bajaba. No se suma a las ventas porque la
          venta a crédito ya se facturó el día que se despachó; sumarla acá
          contaría el mismo ingreso dos veces. */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <ArrowDownToLine size={16} className="text-violet-600" /> Abonos cobrados
            {(from && to) && <span className="text-xs font-normal text-gray-400">{from} → {to}</span>}
          </h3>
          {abonos.length > 0 && (
            <button onClick={bajarCSV}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
              <Download size={13} /> Excel (CSV)
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-gray-400">Entró en el período</p>
              <p className="text-xl font-black text-violet-600">{fmt(cobrado)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Abonos</p>
              <p className="text-xl font-black text-gray-900">{abonos.length}</p>
            </div>
            {Object.entries(porMetodo).map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-gray-400">{METHOD[k] ?? k}</p>
                <p className="text-base font-black text-gray-700">{fmt(v)}</p>
              </div>
            ))}
          </div>
          {/* No se calla el fallo: un total en cero por error de red se lee
              igual que «no cobramos nada», y son cosas muy distintas. */}
          {abonosErr && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              No se pudieron cargar los abonos del período. El total de arriba no es confiable.
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-3">
            No se suma a las ventas: la venta a crédito ya se facturó el día del despacho.
          </p>
        </div>

        {abonos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-bold">Fecha</th>
                  <th className="text-left px-4 py-2 font-bold">Cliente</th>
                  <th className="text-left px-4 py-2 font-bold">Factura</th>
                  <th className="text-left px-4 py-2 font-bold">Método</th>
                  <th className="text-right px-4 py-2 font-bold">Monto</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {abonos.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-gray-500">{String(a.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-4 py-2 font-semibold text-gray-800">{a.cliente ?? 'Sin cliente'}</td>
                    <td className="px-4 py-2 text-gray-500">{a.factura ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{METHOD[a.method] ?? a.method}</td>
                    <td className="px-4 py-2 text-right font-bold text-violet-600">{fmt(a.amount)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => void verAbonos(a.receivable_id)} disabled={abriendo === a.receivable_id}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 disabled:text-gray-300">
                        {abriendo === a.receivable_id ? 'Abriendo…' : 'Ver / anular'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cuentaAbonos && (
          <AbonosModal ar={cuentaAbonos} onClose={() => setCuentaAbonos(null)}
            onChanged={() => { void load(); }} />
        )}
        {abonos.length === 0 && !abonosErr && (
          <p className="text-center text-gray-400 py-4 text-sm bg-white rounded-xl border border-gray-100">
            Sin abonos cobrados en el período
          </p>
        )}
      </div>

      {/* Detalle */}
      <div>
        <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-2"><HandCoins size={16} className="text-emerald-600" /> Cuentas pendientes</h3>
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
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
