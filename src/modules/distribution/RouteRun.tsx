import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, ShoppingCart, X,
  CheckCircle2, Search, Loader2, PackageCheck, Truck, User, Scale,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { distributionService, type DeliveryRoute, type RouteStop } from '@/services/distribution/distributionService';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { unitTypesService } from '@/services/Inventory/unitTypesService';
import { PrintTicketModal } from './PrintTicketModal';
import { customerPricesService } from '@/services/customers/customerPricesService';
import { customersService, type Customer } from '@/services/customers/customersService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import type { Product } from '@/types/Types_POS';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const payLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : m === 'sinpe' ? 'SINPE' : 'Crédito';

// Imprime el ticket; en crédito saca doble factura (cliente + vendedor).
async function printTicket(data: any, tenantId: string, credit: boolean) {
  if (credit) {
    await posPrinterService.printAuto({ ...data, copyLabel: 'ORIGINAL - CLIENTE' }, tenantId);
    await posPrinterService.printAuto({ ...data, copyLabel: 'COPIA - VENDEDOR' }, tenantId);
  } else {
    await posPrinterService.printAuto(data, tenantId);
  }
}

export const RouteRun: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [route, setRoute] = useState<DeliveryRoute | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliverTarget, setDeliverTarget] = useState<any | null>(null);
  const [saleStop, setSaleStop] = useState<{ stop: RouteStop | null; mode: 'auto' | 'pre' } | null>(null);
  const [tab, setTab] = useState<'clients' | 'deliver'>('clients');
  const [printTicket_, setPrintTicket_] = useState<{ invoiceNumber?: string; total?: number; print: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [r, o] = await Promise.all([
        distributionService.get(id),
        distributionService.orders(id).catch(() => []),
      ]);
      setRoute(r); setOrders(o ?? []);
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const markNoSale = async (stop: RouteStop) => {
    const reason = window.prompt('Motivo (opcional):', '') ?? undefined;
    await distributionService.updateStop(stop.id, { status: 'no_sale', reason });
    await load();
  };

  const deliver = async (order: any, paymentMethod: 'cash' | 'card' | 'sinpe' | 'credit') => {
    const d = new Date(); const p = (x: number) => String(x).padStart(2, '0');
    const issued_at = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const inv: any = await distributionService.deliverOrder(order.id, { payment_method: paymentMethod, issued_at });
    const now = new Date();
    const data = {
      invoiceNumber: inv?.invoice_number ?? '',
      date: now.toLocaleDateString('es-CR'),
      time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
      items: (order.items ?? []).map((it: any) => ({ name: it.product_name, quantity: it.quantity, unitPrice: it.unit_price, subtotal: Math.round(it.unit_price * it.quantity) })),
      subtotal: Number(order.total ?? 0), tax: 0, total: Number(order.total ?? 0),
      paymentMethod: payLabel(paymentMethod),
      customerName: order.customer?.name ?? order.customer_name,
    };
    setDeliverTarget(null);
    setPrintTicket_({
      invoiceNumber: inv?.invoice_number, total: Number(order.total ?? 0),
      print: () => printTicket(data, tenantId ?? '', paymentMethod === 'credit'),
    });
    await load();
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando ruta…</div>;
  if (!route) return <div className="p-6 text-center text-gray-400">Ruta no encontrada</div>;

  const stops = route.stops ?? [];
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const modLabel = route.modality === 'autoventa' ? 'Autoventa' : route.modality === 'preventa' ? 'Preventa' : 'Auto + Preventa';

  return (
    <div className="min-h-screen bg-gray-50 pb-4">
      {/* Header con degradado */}
      <div className="bg-linear-to-r from-cyan-600 to-blue-600 text-white px-4 pt-3 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/distribution')} className="p-2 -ml-2 rounded-lg hover:bg-white/15"><ArrowLeft size={18} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-lg truncate flex items-center gap-2"><Truck size={18} /> {route.warehouse?.name ?? 'Ruta'}</h1>
            <p className="text-cyan-100 text-xs">{route.route_date} · {modLabel}</p>
          </div>
          <span className={`text-[10px] font-black px-2 py-1 rounded-full ${route.status === 'open' ? 'bg-emerald-400/90 text-emerald-950' : 'bg-white/20'}`}>
            {route.status === 'open' ? 'ABIERTA' : 'CERRADA'}
          </span>
        </div>

        {/* Acciones rápidas (mostrador) */}
        {route.status === 'open' && (
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => setSaleStop({ stop: null, mode: 'auto' })}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white text-emerald-700 font-black px-3 py-2.5 rounded-xl text-sm">
              <ShoppingCart size={16} /> Vender
            </button>
          </div>
        )}
      </div>

      {/* Por entregar */}
      {/* Tabs */}
      <div className="flex gap-2 px-4 pt-3">
        <button onClick={() => setTab('clients')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'clients' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Clientes ({stops.length})
        </button>
        <button onClick={() => setTab('deliver')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'deliver' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Por entregar ({pendingOrders.length})
        </button>
      </div>

      {/* Clientes de la ruta */}
      {tab === 'clients' && (
        <div className="p-4 space-y-3">
          {stops.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Sin clientes asignados. Vendé en mostrador con el botón “Vender”.</p>}
          {stops.map((s, i) => {
            const cust = (s as any).customer;
            const addr = cust?.address;
            const mapUrl = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;
            const accent = s.status === 'visited' ? 'border-l-emerald-400' : s.status === 'no_sale' ? 'border-l-amber-400' : 'border-l-cyan-400';
            return (
              <div key={s.id} className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${accent} shadow-sm p-4`}>
                <div className="flex items-start gap-3">
                  <span className={`w-8 h-8 rounded-full font-black text-sm flex items-center justify-center shrink-0 ${s.status === 'visited' ? 'bg-emerald-100 text-emerald-700' : s.status === 'no_sale' ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 truncate">{cust?.name ?? 'Cliente'}</p>
                    {addr && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} className="shrink-0" /> <span className="truncate">{addr}</span></p>}
                    {cust?.phone && <p className="text-xs text-gray-400">{cust.phone}</p>}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${s.status === 'visited' ? 'bg-emerald-100 text-emerald-700' : s.status === 'no_sale' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.status === 'visited' ? '✓ Vendido' : s.status === 'no_sale' ? 'No compró' : 'Pendiente'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {mapUrl && (
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">
                      <MapPin size={13} /> Cómo llegar
                    </a>
                  )}
                  <button onClick={() => setSaleStop({ stop: s, mode: 'auto' })}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">
                    <ShoppingCart size={13} /> Vender
                  </button>
                  <button onClick={() => markNoSale(s)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 text-xs font-bold">
                    No compró
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Por entregar */}
      {tab === 'deliver' && (
        <div className="p-4 space-y-3">
          {pendingOrders.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Nada por entregar</p>}
          {pendingOrders.map(o => (
            <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-black text-gray-900">{o.customer?.name ?? o.customer_name ?? 'Cliente'}</p>
                  {o.customer?.address && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} /> {o.customer.address}</p>}
                </div>
                <span className="font-black text-gray-900">{fmt(o.total)}</span>
              </div>
              <ul className="mt-2 text-sm text-gray-600 space-y-0.5">
                {(o.items ?? []).map((it: any, idx: number) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.quantity} × {it.product_name}</span>
                    <span className="text-gray-400">{fmt(Number(it.unit_price) * Number(it.quantity))}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => setDeliverTarget(o)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2 rounded-lg">
                <PackageCheck size={15} /> Entregar e imprimir
              </button>
            </div>
          ))}
        </div>
      )}

      {saleStop && tenantId && route && (
        <SaleModal
          tenantId={tenantId} route={route} stop={saleStop.stop} mode={saleStop.mode}
          onClose={() => setSaleStop(null)} onDone={async () => { setSaleStop(null); await load(); }}
          onPrint={(info) => setPrintTicket_(info)}
        />
      )}

      {deliverTarget && (
        <DeliverModal order={deliverTarget} onClose={() => setDeliverTarget(null)} onConfirm={deliver} />
      )}

      {printTicket_ && (
        <PrintTicketModal
          invoiceNumber={printTicket_.invoiceNumber}
          total={printTicket_.total}
          printFn={printTicket_.print}
          onClose={() => setPrintTicket_(null)}
        />
      )}
    </div>
  );
};

// ── Modal: entregar pedido (método de pago + imprime factura) ────────────────────
function DeliverModal({ order, onClose, onConfirm }: {
  order: any; onClose: () => void; onConfirm: (order: any, pm: 'cash' | 'card' | 'sinpe' | 'credit') => Promise<void>;
}) {
  const [pm, setPm] = useState<'cash' | 'card' | 'sinpe' | 'credit'>('cash');
  const [saving, setSaving] = useState(false);
  const go = async () => { setSaving(true); try { await onConfirm(order, pm); } finally { setSaving(false); } };
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900">Entregar pedido</h2>
            <p className="text-xs text-gray-400">{order.customer?.name ?? order.customer_name ?? 'Cliente'} · {fmt(order.total)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs font-bold text-gray-500">¿Con qué pagó el cliente?</p>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'card', 'sinpe', 'credit'] as const).map(m => (
              <button key={m} onClick={() => setPm(m)}
                className={`py-2.5 rounded-lg text-sm font-bold ${pm === m ? (m === 'credit' ? 'bg-amber-600 text-white' : 'bg-cyan-600 text-white') : 'bg-gray-100 text-gray-600'}`}>
                {m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : m === 'sinpe' ? 'SINPE' : 'Crédito'}
              </button>
            ))}
          </div>
          <button onClick={go} disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-3 rounded-xl text-sm">
            {saving ? 'Entregando…' : <><PackageCheck size={16} /> Entregar e imprimir</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de venta (autoventa) o pedido (preventa) ───────────────────────────────
function SaleModal({ tenantId, route, stop, mode, onClose, onDone, onPrint }: {
  tenantId: string; route: DeliveryRoute; stop: RouteStop | null; mode: 'auto' | 'pre';
  onClose: () => void; onDone: () => void;
  onPrint?: (info: { invoiceNumber?: string; total?: number; print: () => Promise<void> }) => void;
}) {
  const isAuto = mode === 'auto';
  // Cliente: si viene de una parada, fijo; si es mostrador, seleccionable/opcional.
  const stopCust = stop ? (stop as any).customer : null;
  const [customer, setCustomer] = useState<{ id?: string; name?: string } | null>(stopCust ?? null);
  const [pickOpen, setPickOpen] = useState(false);
  const [custList, setCustList] = useState<Customer[]>([]);
  const [custSearch, setCustSearch] = useState('');

  const [rows, setRows] = useState<Array<{ product_id: string; name: string; base: number; available: number }>>([]);
  const [unitMap, setUnitMap] = useState<Record<string, { name: string; abbreviation: string; requires_weight: boolean }>>({});
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'sinpe' | 'credit'>('cash');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [weightFor, setWeightFor] = useState<{ id: string; name: string; price: number; available: number; abbr: string } | null>(null);

  // Productos base (una sola vez): autoventa = stock del camión; preventa = catálogo.
  useEffect(() => {
    (async () => {
      if (isAuto) {
        const stock = await distributionService.truckStock(route.id).catch(() => []);
        setRows((stock ?? []).map((s: any) => ({
          product_id: s.product_id, name: s.product?.name ?? 'Producto',
          base: Number(s.product?.unit_price ?? 0), available: Number(s.quantity),
        })));
      } else {
        const prods: Product[] = await inventoryProductsService.getAllProducts(tenantId).catch(() => []);
        setRows((prods ?? []).map(p => ({ product_id: p.id, name: p.name, base: Number(p.unit_price ?? 0), available: Infinity })));
      }
    })();
  }, [isAuto, route.id, tenantId]);

  // Tipo de medida por producto (igual que el POS: peso vs unidad).
  useEffect(() => {
    (async () => {
      try {
        const [prods, units] = await Promise.all([
          inventoryProductsService.getAllProducts(tenantId).catch(() => []),
          unitTypesService.getAllUnitTypes(tenantId ?? '').catch(() => []),
        ]);
        const uById = new Map((units ?? []).map((u: any) => [u.id, u]));
        const WEIGHT = new Set(['kg', 'g', 'lb', 'lbs', 'oz', 'gr', 'kilo', 'kilos']);
        const map: Record<string, any> = {};
        for (const p of (prods ?? []) as any[]) {
          const ut = p.unit_type ?? (p.unit_type_id ? uById.get(p.unit_type_id) : null);
          if (ut) {
            const requires_weight = ut.requires_weight != null ? ut.requires_weight : WEIGHT.has((ut.abbreviation ?? '').toLowerCase());
            map[p.id] = { name: ut.name ?? 'unidad', abbreviation: ut.abbreviation ?? 'u', requires_weight };
          }
        }
        setUnitMap(map);
      } catch { /* ignore */ }
    })();
  }, [tenantId]);

  // Precios especiales según el cliente seleccionado (se recalcula al cambiar).
  useEffect(() => {
    (async () => {
      if (customer?.id) setPriceMap(await customerPricesService.mapForCustomer(customer.id).catch(() => ({})));
      else setPriceMap({});
    })();
  }, [customer?.id]);

  // Lista de clientes (activos) para el selector de mostrador.
  useEffect(() => {
    if (!pickOpen || custList.length > 0) return;
    customersService.list().then(cs => setCustList((cs ?? []).filter(c => c.is_active))).catch(() => {});
  }, [pickOpen, custList.length]);

  const priceOf = (pid: string, base: number) => priceMap[pid] ?? base;
  const filtered = rows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const lines = rows.map(r => ({ ...r, unit_price: priceOf(r.product_id, r.base), q: Number(qty[r.product_id] || 0) })).filter(l => l.q > 0);
  const total = lines.reduce((s, l) => s + l.q * l.unit_price, 0);

  const setQ = (id: string, v: number, available: number) => {
    let n = Math.max(0, Number(v) || 0);   // permite decimales (tipo de medida)
    if (isAuto && n > available) n = available;   // bloqueante: nunca más de lo cargado
    setQty(prev => ({ ...prev, [id]: n }));
  };

  const filteredCust = custList.filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()));

  const confirm = async () => {
    if (lines.length === 0) { setErr('Agregá productos'); return; }
    setSaving(true); setErr('');
    try {
      const items = lines.map(l => ({
        product_id: l.product_id, quantity: l.q, unit_price: l.unit_price,
        subtotal: Math.round(l.q * l.unit_price), discount_percent: 0, discount_amount: 0,
      }));
      const d = new Date(); const p = (x: number) => String(x).padStart(2, '0');
      const issued_at = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      if (isAuto) {
        const inv: any = await distributionService.sale(route.id, {
          stop_id: stop?.id, customer_id: customer?.id ?? null, customer_name: customer?.name, items,
          subtotal: total, tax_amount: 0, total, payment_method: paymentMethod, issued_at,
        });
        const now = new Date();
        const data = {
          invoiceNumber: inv?.invoice_number ?? '',
          date: now.toLocaleDateString('es-CR'),
          time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
          items: lines.map(l => ({ name: l.name, quantity: l.q, unitPrice: l.unit_price, subtotal: Math.round(l.q * l.unit_price) })),
          subtotal: total, tax: 0, total,
          paymentMethod: payLabel(paymentMethod),
          customerName: customer?.name,
        };
        onPrint?.({
          invoiceNumber: inv?.invoice_number, total,
          print: () => printTicket(data, tenantId, paymentMethod === 'credit'),
        });
      } else {
        if (!customer?.id) { setErr('La preventa necesita un cliente'); setSaving(false); return; }
        await distributionService.order(route.id, {
          stop_id: stop?.id, customer_id: customer.id, customer_name: customer.name, items, total,
        });
        // Imprimir comprobante del PEDIDO (no fiscal, para la entrega).
        try {
          const now = new Date();
          await posPrinterService.printAuto({
            invoiceNumber: 'PEDIDO',
            date: now.toLocaleDateString('es-CR'),
            time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
            items: lines.map(l => ({ name: l.name, quantity: l.q, unitPrice: l.unit_price, subtotal: Math.round(l.q * l.unit_price) })),
            subtotal: total, tax: 0, total,
            paymentMethod: 'PEDIDO (a entregar)',
            customerName: customer.name,
            footerMessage: 'Comprobante de pedido — no es factura',
          } as any, tenantId);
        } catch { /* impresora no disponible */ }
      }
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900">{isAuto ? 'Vender' : 'Tomar pedido'}</h2>
            <p className="text-xs text-gray-400">{customer?.name ?? 'Mostrador (sin cliente)'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        {/* Selector de cliente (cuando es mostrador, sin parada fija) */}
        {!stop && (
          <div className="px-4 py-2 border-b border-gray-100">
            <button onClick={() => setPickOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm">
              <span className="flex items-center gap-2 text-gray-700"><User size={14} className="text-gray-400" />{customer?.name ?? 'Cliente: mostrador'}</span>
              <span className="text-xs text-cyan-600 font-bold">{customer ? 'Cambiar' : 'Elegir'}</span>
            </button>
            {customer && <button onClick={() => setCustomer(null)} className="text-[11px] text-gray-400 mt-1">Quitar cliente (mostrador)</button>}
            {pickOpen && (
              <div className="mt-2 border border-gray-100 rounded-lg">
                <div className="relative p-2"><Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Buscar cliente…" className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" /></div>
                <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                  {filteredCust.map(c => (
                    <button key={c.id} onClick={() => { setCustomer({ id: c.id, name: c.name }); setPickOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-cyan-50">{c.name}</button>
                  ))}
                  {filteredCust.length === 0 && <p className="text-center text-gray-400 text-xs py-3">Sin clientes</p>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-2 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {err && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filtered.map(r => {
              const q = Number(qty[r.product_id] || 0);
              const special = priceMap[r.product_id] != null;
              const price = priceOf(r.product_id, r.base);
              const noStock = isAuto && r.available <= 0;
              const unit = unitMap[r.product_id];
              const byWeight = !!unit?.requires_weight;
              const accent = special ? 'from-violet-100 to-fuchsia-100 text-violet-700' : 'from-emerald-100 to-cyan-100 text-emerald-700';
              return (
                <div key={r.product_id} className={`rounded-xl border-2 p-2.5 flex flex-col transition ${q > 0 ? (special ? 'border-violet-400 bg-violet-50/60' : 'border-emerald-400 bg-emerald-50/50') : 'border-gray-100'} ${noStock ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className={`w-9 h-9 rounded-lg bg-linear-to-br ${accent} font-black flex items-center justify-center text-sm shrink-0`}>
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                    {q > 0 && <span className={`text-[10px] font-black text-white rounded-full px-1.5 py-0.5 ${special ? 'bg-violet-600' : 'bg-emerald-600'}`}>{q}</span>}
                  </div>
                  <p className="text-xs font-bold text-gray-800 leading-tight mt-1.5 line-clamp-2 min-h-8">{r.name}</p>
                  <div className="mt-0.5">
                    <span className={`text-[11px] font-black ${special ? 'text-violet-600' : 'text-gray-700'}`}>{fmt(price)}</span>
                    {unit && <span className="text-[10px] text-gray-400">/{unit.abbreviation}</span>}
                    {special && <span className="ml-1 text-[8px] font-black text-violet-600 bg-violet-100 px-1 rounded uppercase">cliente</span>}
                    {byWeight && <span className="ml-1 text-[8px] font-black text-amber-600 bg-amber-100 px-1 rounded uppercase">por {unit.name}</span>}
                    {isAuto && <p className={`text-[10px] font-bold ${r.available <= 0 ? 'text-red-500' : 'text-gray-400'}`}>camión: {r.available}{unit ? ` ${unit.abbreviation}` : ''}</p>}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button onClick={() => setQ(r.product_id, q - (byWeight ? 0.5 : 1), r.available)} disabled={q <= 0}
                      className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-black disabled:opacity-30">−</button>
                    <input type="number" inputMode="decimal" step={byWeight ? '0.01' : 'any'} value={qty[r.product_id] ?? ''} disabled={noStock}
                      onChange={e => setQ(r.product_id, parseFloat(e.target.value) || 0, r.available)} placeholder="0"
                      className="flex-1 w-full min-w-0 text-center border border-gray-200 rounded-lg py-1 text-sm disabled:bg-gray-100" />
                    <button onClick={() => setQ(r.product_id, q + (byWeight ? 0.5 : 1), r.available)} disabled={noStock || (isAuto && q >= r.available)}
                      className={`w-7 h-7 rounded-lg text-white font-black disabled:opacity-30 ${special ? 'bg-violet-500' : 'bg-emerald-500'}`}>+</button>
                  </div>
                  {byWeight && (
                    <button onClick={() => setWeightFor({ id: r.product_id, name: r.name, price, available: r.available, abbr: unit?.abbreviation ?? 'kg' })} disabled={noStock}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg py-1 disabled:opacity-40">
                      <Scale size={12} /> Peso / ₡
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-10">{isAuto ? 'El camión no tiene carga' : 'Sin productos'}</p>}
        </div>
        {isAuto && (
          <div className="px-4 py-2 border-t border-gray-100 flex gap-2">
            {(['cash', 'card', 'sinpe', ...(customer?.id ? ['credit'] as const : [])] as const).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${paymentMethod === m ? (m === 'credit' ? 'bg-amber-600 text-white' : 'bg-cyan-600 text-white') : 'bg-gray-100 text-gray-600'}`}>
                {payLabel(m)}
              </button>
            ))}
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-xl font-black text-gray-900">{fmt(total)}</p>
          </div>
          <button onClick={confirm} disabled={saving || lines.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black px-5 py-3 rounded-xl text-sm">
            {saving ? '…' : <><CheckCircle2 size={16} /> {isAuto ? 'Cobrar' : 'Guardar pedido'}</>}
          </button>
        </div>
      </div>

      {weightFor && (
        <WeightEntryModal entry={weightFor} isAuto={isAuto}
          onClose={() => setWeightFor(null)}
          onConfirm={(qtyVal) => { setQ(weightFor.id, qtyVal, weightFor.available); setWeightFor(null); }} />
      )}
    </div>
  );
}

// ── Modal: ingresar peso o monto (₡) para productos por peso ──────────────────
function WeightEntryModal({ entry, isAuto, onConfirm, onClose }: {
  entry: { id: string; name: string; price: number; available: number; abbr: string };
  isAuto: boolean;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'weight' | 'amount'>('weight');
  const [val, setVal] = useState('');
  const num = parseFloat(val) || 0;
  let weight = mode === 'weight' ? num : (entry.price > 0 ? num / entry.price : 0);
  weight = Math.round(weight * 1000) / 1000;
  const capped = isAuto ? Math.min(weight, entry.available) : weight;
  const total = capped * entry.price;
  const presets = mode === 'weight' ? [0.25, 0.5, 1, 2, 5] : [1000, 2000, 5000, 10000];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-500 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Scale size={20} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-black truncate">{entry.name}</p>
              <p className="text-emerald-100 text-xs">{fmt(entry.price)} / {entry.abbr}{isAuto ? ` · camión: ${entry.available} ${entry.abbr}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center"><X size={16} className="text-white" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setMode('weight'); setVal(''); }}
              className={`py-2 rounded-xl text-sm font-bold ${mode === 'weight' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}>Por peso ({entry.abbr})</button>
            <button onClick={() => { setMode('amount'); setVal(''); }}
              className={`py-2 rounded-xl text-sm font-bold ${mode === 'amount' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'}`}>Por monto (₡)</button>
          </div>
          <input autoFocus type="number" inputMode="decimal" step="0.01" value={val} onChange={e => setVal(e.target.value)}
            placeholder={mode === 'weight' ? '0.00' : '₡0'}
            className="w-full text-3xl font-black text-center border-2 border-gray-200 rounded-2xl py-3 focus:outline-none focus:border-emerald-400" />
          <div className="flex gap-2 flex-wrap">
            {presets.map(p => (
              <button key={p} onClick={() => setVal(String(p))}
                className="flex-1 min-w-14 py-2 rounded-xl font-bold text-sm bg-gray-50 border-2 border-gray-200 hover:border-emerald-300">
                {mode === 'weight' ? `${p}${entry.abbr}` : fmt(p)}
              </button>
            ))}
          </div>
          {capped > 0 && (
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-emerald-700 font-semibold text-sm">{capped} {entry.abbr} × {fmt(entry.price)}</span>
              <span className="text-emerald-700 font-black text-xl">{fmt(total)}</span>
            </div>
          )}
          <button onClick={() => capped > 0 && onConfirm(capped)} disabled={capped <= 0}
            className="w-full py-3.5 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2">
            <CheckCircle2 size={18} /> Agregar {capped > 0 ? `${capped} ${entry.abbr}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RouteRun;
