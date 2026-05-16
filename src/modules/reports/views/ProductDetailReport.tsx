import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, TrendingUp, ShoppingBag, Hash,
  Truck, ShoppingCart,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { KPICard } from '../components/KPICard';
import { SaleProductRow, SaleGroup, SaleLine } from '../components/SaleProductRow';
import { PurchaseProductRow, PurchaseGroup, PurchaseLine } from '../components/PurchaseProductRow';
import { TableHeader } from '../components/TableHeader';
import { EmptyState } from '../components/EmptyState';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { dateStyle: 'short' });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE',
  check: 'Cheque', transfer: 'Transferencia',
};
const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', received: 'Recibida', cancelled: 'Cancelada',
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchSalesData(tenantId: string, from: string, to: string): Promise<SaleGroup[]> {
  return apiFetch<SaleGroup[]>(`/reports/products/sales?from=${from}&to=${to}`);
}

async function fetchPurchasesData(tenantId: string, from: string, to: string): Promise<PurchaseGroup[]> {
  return apiFetch<PurchaseGroup[]>(`/reports/products/purchases?from=${from}&to=${to}`);
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function exportSalesCSV(groups: SaleGroup[]) {
  const rows = ['Producto,Factura,Fecha,Cliente,Cantidad,Precio Unitario,Subtotal,Método'];
  groups.forEach((g) => g.lines.forEach((l) => rows.push(
    [`"${g.product_name}"`, l.invoice_number, fmtDateTime(l.issued_at),
     `"${l.customer_name ?? ''}"`, l.quantity, l.unit_price, l.subtotal,
     PAYMENT_LABELS[l.payment_method] ?? l.payment_method].join(',')
  )));
  downloadCSV(rows, `ventas_productos`);
}

function exportPurchasesCSV(groups: PurchaseGroup[]) {
  const rows = ['Producto,Orden Compra,Fecha,Proveedor,Estado,Cantidad,Precio Unitario,Subtotal'];
  groups.forEach((g) => g.lines.forEach((l) => rows.push(
    [`"${g.product_name}"`, l.purchase_number, fmtDate(l.purchase_date),
     `"${l.supplier_name}"`, PURCHASE_STATUS_LABELS[l.status] ?? l.status,
     l.quantity, l.unit_price, l.subtotal].join(',')
  )));
  downloadCSV(rows, `compras_productos`);
}

function downloadCSV(rows: string[], name: string) {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

type ViewMode = 'sales' | 'purchases';

interface Props { tenantId: string | null; from: string; to: string }

export const ProductDetailReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [mode, setMode]           = useState<ViewMode>('sales');
  const [sales, setSales]         = useState<SaleGroup[]>([]);
  const [purchases, setPurchases] = useState<PurchaseGroup[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const [s, p] = await Promise.all([
        fetchSalesData(tenantId, from, to),
        fetchPurchasesData(tenantId, from, to),
      ]);
      setSales(s);
      setPurchases(p);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  const filteredSales = search.trim()
    ? sales.filter(g => g.product_name.toLowerCase().includes(search.toLowerCase()))
    : sales;

  const filteredPurchases = search.trim()
    ? purchases.filter(g => g.product_name.toLowerCase().includes(search.toLowerCase()))
    : purchases;

  const totalSalesRevenue  = sales.reduce((s, g) => s + g.total_revenue, 0);
  const totalSalesQty      = sales.reduce((s, g) => s + g.total_qty, 0);
  const totalPurchaseCost  = purchases.reduce((s, g) => s + g.total_cost, 0);
  const totalPurchaseQty   = purchases.reduce((s, g) => s + g.total_qty, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
        <RefreshCw size={18} className="animate-spin" /> Cargando desglose de productos...
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('sales')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${
            mode === 'sales' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-emerald-300'
          }`}
        >
          <ShoppingBag size={15} /> Ventas a clientes
        </button>
        <button
          onClick={() => setMode('purchases')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${
            mode === 'purchases' ? 'bg-blue-500 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
          }`}
        >
          <Truck size={15} /> Compras a proveedores
        </button>
      </div>

      {/* ── VENTAS ── */}
      {mode === 'sales' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard icon={TrendingUp}  label="Ingresos totales"  value={fmt(totalSalesRevenue)} color="bg-emerald-500" />
            <KPICard icon={ShoppingBag} label="Unidades vendidas"  value={String(totalSalesQty)} sub={`${sales.length} producto${sales.length !== 1 ? 's' : ''}`} color="bg-blue-500" />
            <KPICard icon={Hash}        label="Líneas de venta"    value={String(sales.reduce((s, g) => s + g.sales_count, 0))} color="bg-violet-500" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <TableHeader
              title="Ventas por producto"
              count={filteredSales.length}
              search={search}
              onSearch={setSearch}
              onExport={() => exportSalesCSV(filteredSales)}
              disabled={!filteredSales.length}
              accentColor="emerald"
            />
            {filteredSales.length === 0 ? <EmptyState icon={ShoppingBag} text="Sin ventas en el período" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Producto / Detalle</th>
                      <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Unidades</th>
                      <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Ventas</th>
                      <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((g, i) => <SaleProductRow key={g.product_id} group={g} rank={i + 1} />)}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td className="px-5 py-3 font-black text-gray-700 text-sm">Total</td>
                      <td className="px-5 py-3 text-center font-black text-gray-700 text-sm">{totalSalesQty}</td>
                      <td className="px-5 py-3 text-center font-black text-gray-700 text-sm">{sales.reduce((s, g) => s + g.sales_count, 0)}</td>
                      <td className="px-5 py-3 text-right font-black text-emerald-600">{fmt(totalSalesRevenue)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── COMPRAS ── */}
      {mode === 'purchases' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard icon={TrendingUp}  label="Costo total comprado" value={fmt(totalPurchaseCost)} color="bg-blue-500" />
            <KPICard icon={Truck}       label="Unidades compradas"   value={String(totalPurchaseQty)} sub={`${purchases.length} producto${purchases.length !== 1 ? 's' : ''}`} color="bg-violet-500" />
            <KPICard icon={ShoppingCart} label="Órdenes de compra"   value={String(purchases.reduce((s, g) => s + g.purchase_count, 0))} color="bg-amber-500" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <TableHeader
              title="Compras por producto"
              count={filteredPurchases.length}
              search={search}
              onSearch={setSearch}
              onExport={() => exportPurchasesCSV(filteredPurchases)}
              disabled={!filteredPurchases.length}
              accentColor="blue"
            />
            {filteredPurchases.length === 0 ? <EmptyState icon={ShoppingCart} text="Sin compras en el período" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Producto / Proveedor</th>
                      <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Unidades</th>
                      <th className="text-center px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">P. Unitario</th>
                      <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Costo</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPurchases.map((g, i) => <PurchaseProductRow key={g.product_id} group={g} rank={i + 1} />)}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td className="px-5 py-3 font-black text-gray-700 text-sm">Total</td>
                      <td className="px-5 py-3 text-center font-black text-gray-700 text-sm">{totalPurchaseQty}</td>
                      <td className="px-5 py-3 text-center" />
                      <td className="px-5 py-3 text-right font-black text-blue-600">{fmt(totalPurchaseCost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 text-center">
        Toca cualquier fila para ver el detalle de cada {mode === 'sales' ? 'venta' : 'compra'}
      </p>
    </div>
  );
};
