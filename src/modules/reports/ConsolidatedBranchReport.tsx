import { useEffect, useState } from 'react';
import { Building2, FileText, TrendingUp, TrendingDown, Receipt, Loader2, RefreshCw, FileCheck, FileSpreadsheet } from 'lucide-react';
import { tenantGroupsService, type BranchReportRow, type BranchReportTotals } from '@/services/admin/tenantGroupsService';

const fmt = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

// Rango por defecto: mes en curso
function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export function ConsolidatedBranchReport() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [rows, setRows] = useState<BranchReportRow[]>([]);
  const [totals, setTotals] = useState<BranchReportTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const r = await tenantGroupsService.myBranchesReport(
        from ? `${from}T00:00:00` : undefined,
        to ? `${to}T23:59:59` : undefined,
      );
      setRows(r.rows ?? []);
      setTotals(r.totals ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el reporte');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Filtro de fechas */}
      <div className="flex items-end gap-3 flex-wrap bg-white border border-gray-100 rounded-xl p-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* KPIs del grupo */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={Receipt}      color="bg-blue-500"    label="Facturas"      value={String(totals.invoices)} />
          <Kpi icon={TrendingUp}   color="bg-emerald-500" label="Ventas totales" value={fmt(totals.sales_total)} />
          <Kpi icon={FileText}     color="bg-violet-500"  label="IVA"           value={fmt(totals.tax_total)} />
          <Kpi icon={TrendingDown} color="bg-amber-500"   label="Ganancia bruta" value={fmt(totals.gross_profit)} sub="ventas netas − gastos" />
        </div>
      )}

      {/* Recuento por tipo de documento (grupo) */}
      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Kpi icon={Receipt}         color="bg-slate-500"  label="Tiquetes corrientes"  value={String(totals.doc_ticket)} />
          <Kpi icon={FileCheck}       color="bg-cyan-500"   label="Tiquetes electrónicos" value={String(totals.doc_tiquete_electronico)} />
          <Kpi icon={FileSpreadsheet} color="bg-blue-600"   label="Facturas electrónicas" value={String(totals.doc_factura_electronica)} />
        </div>
      )}

      {/* Tabla por sucursal */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Building2 size={16} className="text-emerald-600" />
          <h3 className="font-black text-gray-900">Desglose por sucursal</h3>
          <span className="text-xs text-gray-400">({rows.length})</span>
        </div>
        {loading && rows.length === 0 ? (
          <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-gray-400">Sin datos en el período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-bold text-gray-600">Sucursal</th>
                  <th className="px-4 py-2 text-right font-bold text-gray-600" title="Tiquete corriente">T. Corr.</th>
                  <th className="px-4 py-2 text-right font-bold text-gray-600" title="Tiquete electrónico">T. Elec.</th>
                  <th className="px-4 py-2 text-right font-bold text-gray-600" title="Factura electrónica">F. Elec.</th>
                  <th className="px-4 py-2 text-right font-bold text-gray-600">Ventas</th>
                  <th className="px-4 py-2 text-right font-bold text-gray-600">Ticket prom.</th>
                  <th className="px-4 py-2 text-right font-bold text-gray-600">Gastos</th>
                  <th className="px-4 py-2 text-right font-bold text-gray-600">Ganancia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.tenant_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-bold text-gray-800">
                      {r.tenant_name}
                      {r.is_demo && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">DEMO</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.doc_ticket}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-cyan-700">{r.doc_tiquete_electronico}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">{r.doc_factura_electronica}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-700">{fmt(r.sales_total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.avg_ticket)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-600">{fmt(r.expenses)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900">{fmt(r.gross_profit)}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot className="bg-gray-900 text-white">
                  <tr>
                    <td className="px-4 py-3 font-black">TOTAL GRUPO</td>
                    <td className="px-4 py-3 text-right tabular-nums font-black">{totals.doc_ticket}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-black">{totals.doc_tiquete_electronico}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-black">{totals.doc_factura_electronica}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-black">{fmt(totals.sales_total)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">—</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.expenses)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-black">{fmt(totals.gross_profit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, color, label, value, sub }: {
  icon: any; color: string; label: string; value: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide">{label}</p>
        <p className="text-gray-900 font-black text-lg leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export default ConsolidatedBranchReport;
