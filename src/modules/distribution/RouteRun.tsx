import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Navigation, ShoppingCart, ClipboardList, X,
  CheckCircle2, Search, Loader2, PackageCheck, Ban, Truck, User,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { distributionService, type DeliveryRoute, type RouteStop } from '@/services/distribution/distributionService';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { customerPricesService } from '@/services/customers/customerPricesService';
import { customersService, type Customer } from '@/services/customers/customersService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import type { Product } from '@/types/Types_POS';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

export const RouteRun: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [route, setRoute] = useState<DeliveryRoute | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stops' | 'deliver'>('stops');
  const [saleStop, setSaleStop] = useState<{ stop: RouteStop | null; mode: 'auto' | 'pre' } | null>(null);

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

  const deliver = async (orderId: string) => {
    await distributionService.deliverOrder(orderId);
    await load();
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando ruta…</div>;
  if (!route) return <div className="p-6 text-center text-gray-400">Ruta no encontrada</div>;

  const stops = route.stops ?? [];
  const pendingOrders = orders.filter(o => o.status === 'pending');

  const doneStops = stops.filter(s => s.status !== 'pending').length;
  const progress = stops.length > 0 ? Math.round((doneStops / stops.length) * 100) : 0;
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

        {/* Progreso de paradas */}
        {stops.length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-cyan-100 mb-1">
              <span>Paradas: {doneStops}/{stops.length}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Acciones rápidas (mostrador) */}
        {route.status === 'open' && (
          <div className="flex items-center gap-2 mt-3">
            {route.modality !== 'preventa' && (
              <button onClick={() => setSaleStop({ stop: null, mode: 'auto' })}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white text-emerald-700 font-black px-3 py-2.5 rounded-xl text-sm">
                <ShoppingCart size={16} /> Vender
              </button>
            )}
            {route.modality !== 'autoventa' && (
              <button onClick={() => setSaleStop({ stop: null, mode: 'pre' })}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-black px-3 py-2.5 rounded-xl text-sm">
                <ClipboardList size={16} /> Pedido
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 pt-3">
        <button onClick={() => setTab('stops')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'stops' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Paradas ({stops.length})
        </button>
        <button onClick={() => setTab('deliver')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'deliver' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Por entregar ({pendingOrders.length})
        </button>
      </div>

      {/* Stops */}
      {tab === 'stops' && (
        <div className="p-4 space-y-3">
          {stops.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Sin paradas asignadas</p>}
          {stops.map((s, i) => {
            const cust = (s as any).customer;
            const addr = cust?.address;
            const mapUrl = s.lat && s.lng
              ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`
              : addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;
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
                    {s.status === 'visited' ? '✓ Visitado' : s.status === 'no_sale' ? 'No compró' : 'Pendiente'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {mapUrl && (
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">
                      <Navigation size={13} /> Cómo llegar
                    </a>
                  )}
                  {route.modality !== 'preventa' && (
                    <button onClick={() => setSaleStop({ stop: s, mode: 'auto' })}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">
                      <ShoppingCart size={13} /> Vender
                    </button>
                  )}
                  {route.modality !== 'autoventa' && (
                    <button onClick={() => setSaleStop({ stop: s, mode: 'pre' })}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold">
                      <ClipboardList size={13} /> Tomar pedido
                    </button>
                  )}
                  <button onClick={() => markNoSale(s)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 text-xs font-bold">
                    <Ban size={13} /> No compró
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
              <button onClick={() => deliver(o.id)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2 rounded-lg">
                <PackageCheck size={15} /> Marcar entregado
              </button>
            </div>
          ))}
        </div>
      )}

      {saleStop && tenantId && route && (
        <SaleModal
          tenantId={tenantId} route={route} stop={saleStop.stop} mode={saleStop.mode}
          onClose={() => setSaleStop(null)} onDone={async () => { setSaleStop(null); await load(); }}
        />
      )}
    </div>
  );
};

// ── Modal de venta (autoventa) o pedido (preventa) ───────────────────────────────
function SaleModal({ tenantId, route, stop, mode, onClose, onDone }: {
  tenantId: string; route: DeliveryRoute; stop: RouteStop | null; mode: 'auto' | 'pre';
  onClose: () => void; onDone: () => void;
}) {
  const isAuto = mode === 'auto';
  // Cliente: si viene de una parada, fijo; si es mostrador, seleccionable/opcional.
  const stopCust = stop ? (stop as any).customer : null;
  const [customer, setCustomer] = useState<{ id?: string; name?: string } | null>(stopCust ?? null);
  const [pickOpen, setPickOpen] = useState(false);
  const [custList, setCustList] = useState<Customer[]>([]);
  const [custSearch, setCustSearch] = useState('');

  const [rows, setRows] = useState<Array<{ product_id: string; name: string; base: number; available: number }>>([]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'sinpe'>('cash');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

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
    let n = Math.max(0, Math.floor(v) || 0);
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
          stop_id: stop?.id, customer_name: customer?.name, items,
          subtotal: total, tax_amount: 0, total, payment_method: paymentMethod, issued_at,
        });
        try {
          const now = new Date();
          await posPrinterService.printAuto({
            invoiceNumber: inv?.invoice_number ?? '',
            date: now.toLocaleDateString('es-CR'),
            time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
            items: lines.map(l => ({ name: l.name, quantity: l.q, unitPrice: l.unit_price, subtotal: Math.round(l.q * l.unit_price) })),
            subtotal: total, tax: 0, total,
            paymentMethod: paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' ? 'Tarjeta' : 'SINPE',
            customerName: customer?.name,
          } as any, tenantId);
        } catch { /* impresora no disponible */ }
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
                    {special && <span className="ml-1 text-[8px] font-black text-violet-600 bg-violet-100 px-1 rounded uppercase">cliente</span>}
                    {isAuto && <p className={`text-[10px] font-bold ${r.available <= 0 ? 'text-red-500' : 'text-gray-400'}`}>camión: {r.available}</p>}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <button onClick={() => setQ(r.product_id, q - 1, r.available)} disabled={q <= 0}
                      className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-black disabled:opacity-30">−</button>
                    <input type="number" inputMode="numeric" value={qty[r.product_id] ?? ''} disabled={noStock}
                      onChange={e => setQ(r.product_id, parseInt(e.target.value) || 0, r.available)} placeholder="0"
                      className="flex-1 w-full min-w-0 text-center border border-gray-200 rounded-lg py-1 text-sm disabled:bg-gray-100" />
                    <button onClick={() => setQ(r.product_id, q + 1, r.available)} disabled={noStock || (isAuto && q >= r.available)}
                      className={`w-7 h-7 rounded-lg text-white font-black disabled:opacity-30 ${special ? 'bg-violet-500' : 'bg-emerald-500'}`}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-10">{isAuto ? 'El camión no tiene carga' : 'Sin productos'}</p>}
        </div>
        {isAuto && (
          <div className="px-4 py-2 border-t border-gray-100 flex gap-2">
            {(['cash', 'card', 'sinpe'] as const).map(m => (
              <button key={m} onClick={() => setPaymentMethod(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${paymentMethod === m ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : 'SINPE'}
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
    </div>
  );
}

export default RouteRun;
