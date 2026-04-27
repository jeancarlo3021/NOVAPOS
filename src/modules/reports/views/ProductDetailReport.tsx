import React, { useEffect, useState, useCallback } from 'react';
import {
  Package, ChevronDown, ChevronRight, Search,
  Download, RefreshCw, TrendingUp, ShoppingBag, Hash,
  Truck, ShoppingCart,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SaleLine {
  invoice_number: string;
  issued_at: string;
  customer_name: string | null;
  payment_method: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface SaleGroup {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_revenue: number;
  sales_count: number;
  lines: SaleLine[];
}

interface PurchaseLine {
  purchase_number: string;
  purchase_date: string;
  supplier_name: string;
  status: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface PurchaseGroup {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_cost: number;
  purchase_count: number;
  lines: PurchaseLine[];
}

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
const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981', card: '#3b82f6', sinpe: '#8b5cf6',
  check: '#f59e0b', transfer: '#6b7280',
};
const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', received: 'Recibida', cancelled: 'Cancelada',
};
const PURCHASE_STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', received: '#10b981', cancelled: '#ef4444',
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchSalesData(tenantId: string, from: string, to: string): Promise<SaleGroup[]> {
  const { data, error } = await supabase
    .from('invoice_items')
    .select(`
      product_id,
      quantity,
      unit_price,
      subtotal,
      products(name),
      invoices!inner(
        invoice_number,
        issued_at,
        customer_name,
        payment_method,
        tenant_id,
        status
      )
    `)
    .eq('invoices.tenant_id', tenantId)
    .eq('invoices.status', 'completed')
    .gte('invoices.issued_at', `${from}T00:00:00`)
    .lte('invoices.issued_at', `${to}T23:59:59`);

  if (error) throw error;

  const map = new Map<string, SaleGroup>();
  (data ?? []).forEach((row: any) => {
    const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
    if (!inv) return;
    const pid   = row.product_id as string;
    const pname = row.products?.name ?? pid;
    if (!map.has(pid)) {
      map.set(pid, { product_id: pid, product_name: pname, total_qty: 0, total_revenue: 0, sales_count: 0, lines: [] });
    }
    const g = map.get(pid)!;
    g.total_qty     += Number(row.quantity);
    g.total_revenue += Number(row.subtotal);
    g.sales_count   += 1;
    g.lines.push({
      invoice_number: inv.invoice_number,
      issued_at:      inv.issued_at,
      customer_name:  inv.customer_name ?? null,
      payment_method: inv.payment_method,
      quantity:       Number(row.quantity),
      unit_price:     Number(row.unit_price),
      subtotal:       Number(row.subtotal),
    });
  });
  map.forEach((g) => g.lines.sort((a, b) => b.issued_at.localeCompare(a.issued_at)));
  return Array.from(map.values()).sort((a, b) => b.total_revenue - a.total_revenue);
}

async function fetchPurchasesData(tenantId: string, from: string, to: string): Promise<PurchaseGroup[]> {
  const { data, error } = await supabase
    .from('purchase_items')
    .select(`
      product_id,
      quantity,
      unit_price,
      subtotal,
      products(name),
      purchases!inner(
        purchase_number,
        purchase_date,
        status,
        tenant_id,
        suppliers(name)
      )
    `)
    .eq('purchases.tenant_id', tenantId)
    .gte('purchases.purchase_date', from)
    .lte('purchases.purchase_date', to);

  if (error) throw error;

  const map = new Map<string, PurchaseGroup>();
  (data ?? []).forEach((row: any) => {
    const pur = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases;
    if (!pur) return;
    const pid          = row.product_id as string;
    const pname        = row.products?.name ?? pid;
    const supplierRaw  = Array.isArray(pur.suppliers) ? pur.suppliers[0] : pur.suppliers;
    const supplierName = supplierRaw?.name ?? 'Sin proveedor';

    if (!map.has(pid)) {
      map.set(pid, { product_id: pid, product_name: pname, total_qty: 0, total_cost: 0, purchase_count: 0, lines: [] });
    }
    const g = map.get(pid)!;
    g.total_qty      += Number(row.quantity);
    g.total_cost     += Number(row.subtotal ?? (row.quantity * row.unit_price));
    g.purchase_count += 1;
    g.lines.push({
      purchase_number: pur.purchase_number,
      purchase_date:   pur.purchase_date,
      supplier_name:   supplierName,
      status:          pur.status,
      quantity:        Number(row.quantity),
      unit_price:      Number(row.unit_price ?? 0),
      subtotal:        Number(row.subtotal ?? 0),
    });
  });
  map.forEach((g) => g.lines.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)));
  return Array.from(map.values()).sort((a, b) => b.total_cost - a.total_cost);
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

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
        {sub && <p className="text-gray-400 text-xs">{sub}</p>}
      </div>
    </div>
  );
}

// ── Sales expandable row ──────────────────────────────────────────────────────

function SaleProductRow({ group, rank }: { group: SaleGroup; rank: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer transition border-b border-gray-100" onClick={() => setOpen(o => !o)}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${rank <= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{rank}</span>
            <span className="font-semibold text-gray-900 text-sm">{group.product_name}</span>
          </div>
        </td>
        <td className="px-5 py-3 text-center text-sm font-semibold text-gray-600">{group.total_qty}</td>
        <td className="px-5 py-3 text-center text-sm text-gray-500">{group.sales_count}</td>
        <td className="px-5 py-3 text-right font-black text-emerald-600 text-sm">{fmt(group.total_revenue)}</td>
        <td className="px-5 py-3 text-right text-gray-400">{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</td>
      </tr>
      {open && group.lines.map((line, i) => (
        <tr key={i} className="bg-emerald-50/30 border-b border-emerald-100/50">
          <td className="pl-14 pr-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-emerald-700 font-bold">{line.invoice_number}</span>
              <span className="text-xs text-gray-400">{fmtDateTime(line.issued_at)}</span>
            </div>
            <p className="text-xs mt-0.5">
              {line.customer_name
                ? <span className="font-medium text-gray-700">{line.customer_name}</span>
                : <span className="italic text-gray-400">Cliente anónimo</span>}
            </p>
          </td>
          <td className="px-5 py-2.5 text-center text-sm text-gray-700 font-semibold">{line.quantity}</td>
          <td className="px-5 py-2.5 text-center">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: (PAYMENT_COLORS[line.payment_method] ?? '#94a3b8') + '22', color: PAYMENT_COLORS[line.payment_method] ?? '#6b7280' }}>
              {PAYMENT_LABELS[line.payment_method] ?? line.payment_method}
            </span>
          </td>
          <td className="px-5 py-2.5 text-right">
            <p className="text-xs text-gray-400">{fmt(line.unit_price)} c/u</p>
            <p className="font-bold text-gray-800 text-sm">{fmt(line.subtotal)}</p>
          </td>
          <td />
        </tr>
      ))}
    </>
  );
}

// ── Purchases expandable row ──────────────────────────────────────────────────

function PurchaseProductRow({ group, rank }: { group: PurchaseGroup; rank: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer transition border-b border-gray-100" onClick={() => setOpen(o => !o)}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${rank <= 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{rank}</span>
            <span className="font-semibold text-gray-900 text-sm">{group.product_name}</span>
          </div>
        </td>
        <td className="px-5 py-3 text-center text-sm font-semibold text-gray-600">{group.total_qty}</td>
        <td className="px-5 py-3 text-center text-sm text-gray-500">{group.purchase_count}</td>
        <td className="px-5 py-3 text-right font-black text-blue-600 text-sm">{fmt(group.total_cost)}</td>
        <td className="px-5 py-3 text-right text-gray-400">{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</td>
      </tr>
      {open && group.lines.map((line, i) => (
        <tr key={i} className="bg-blue-50/30 border-b border-blue-100/50">
          <td className="pl-14 pr-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-blue-700 font-bold">{line.purchase_number}</span>
              <span className="text-xs text-gray-400">{fmtDate(line.purchase_date)}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Truck size={11} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-700">{line.supplier_name}</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: (PURCHASE_STATUS_COLORS[line.status] ?? '#94a3b8') + '22', color: PURCHASE_STATUS_COLORS[line.status] ?? '#6b7280' }}
              >
                {PURCHASE_STATUS_LABELS[line.status] ?? line.status}
              </span>
            </div>
          </td>
          <td className="px-5 py-2.5 text-center text-sm text-gray-700 font-semibold">{line.quantity}</td>
          <td className="px-5 py-2.5 text-center text-xs text-gray-400">{fmt(line.unit_price)} c/u</td>
          <td className="px-5 py-2.5 text-right font-bold text-gray-800 text-sm">{fmt(line.subtotal)}</td>
          <td />
        </tr>
      ))}
    </>
  );
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
            <KPI icon={TrendingUp}  label="Ingresos totales"  value={fmt(totalSalesRevenue)} color="bg-emerald-500" />
            <KPI icon={ShoppingBag} label="Unidades vendidas"  value={String(totalSalesQty)} sub={`${sales.length} producto${sales.length !== 1 ? 's' : ''}`} color="bg-blue-500" />
            <KPI icon={Hash}        label="Líneas de venta"    value={String(sales.reduce((s, g) => s + g.sales_count, 0))} color="bg-violet-500" />
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
            <KPI icon={TrendingUp} label="Costo total comprado" value={fmt(totalPurchaseCost)} color="bg-blue-500" />
            <KPI icon={Package}    label="Unidades compradas"   value={String(totalPurchaseQty)} sub={`${purchases.length} producto${purchases.length !== 1 ? 's' : ''}`} color="bg-violet-500" />
            <KPI icon={Truck}      label="Órdenes de compra"    value={String(purchases.reduce((s, g) => s + g.purchase_count, 0))} color="bg-amber-500" />
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

// ── Shared sub-components ─────────────────────────────────────────────────────

function TableHeader({ title, count, search, onSearch, onExport, disabled, accentColor }: {
  title: string; count: number; search: string;
  onSearch: (v: string) => void; onExport: () => void;
  disabled: boolean; accentColor: 'emerald' | 'blue';
}) {
  const btnClass = accentColor === 'emerald'
    ? 'bg-emerald-500 hover:bg-emerald-600'
    : 'bg-blue-500 hover:bg-blue-600';
  return (
    <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-1 min-w-52">
        <Package size={18} className={accentColor === 'emerald' ? 'text-emerald-500' : 'text-blue-500'} />
        <h2 className="font-black text-gray-900">{title}</h2>
        <span className="text-xs text-gray-400">{count} productos</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
        </div>
        <button
          onClick={onExport}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 ${btnClass} disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-lg transition`}
        >
          <Download size={14} /> CSV
        </button>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <Icon size={36} className="text-gray-200" />
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  );
}
