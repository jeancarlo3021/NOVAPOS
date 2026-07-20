import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, ShoppingCart, X,
  CheckCircle2, Search, Loader2, PackageCheck, Truck, User, Scale, Ban, Package,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { distributionService, type DeliveryRoute, type RouteStop } from '@/services/distribution/distributionService';
import { distributionOfflineService } from '@/services/distribution/distributionOfflineService';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { unitTypesService } from '@/services/Inventory/unitTypesService';
import { PrintTicketModal } from './PrintTicketModal';
import { customerPricesService } from '@/services/customers/customerPricesService';
import { customersService, type Customer } from '@/services/customers/customersService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { truckTracking } from '@/services/distribution/truckTrackingService';
import {
  promotionsService, getProductPromotion, calcPromoUnitPrice, calcPromoSubtotal, promoLabel,
  type Promotion,
} from '@/services/promotions/promotionsService';
import type { Product } from '@/types/Types_POS';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const payLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : m === 'sinpe' ? 'SINPE' : m === 'mixed' ? 'Mixto' : 'Crédito';

// Imprime el ticket; saca doble factura (cliente + vendedor) si el método de pago
// está configurado para ello (Configuración → Recibo → Doble factura).
async function printTicket(data: any, tenantId: string, paymentMethod: string) {
  const cfg: any = await posPrinterService.loadReceiptConfig(tenantId).catch(() => null);
  const dbl: string[] = cfg?.doubleInvoiceMethods ?? ['credit'];
  if (dbl.includes(paymentMethod)) {
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
  const [tab, setTab] = useState<'clients' | 'deliver' | 'sales'>('clients');
  const [sales, setSales] = useState<any[]>([]);
  const [salesErr, setSalesErr] = useState<string | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [showStock, setShowStock] = useState(false);
  const [stock, setStock] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [printTicket_, setPrintTicket_] = useState<{ invoiceNumber?: string; total?: number; print: () => Promise<void>; receipt?: any } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [r, o] = await Promise.all([
        distributionOfflineService.getRoute(id),
        distributionOfflineService.orders(id).catch(() => []),
      ]);
      setRoute(r); setOrders(o ?? []);
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Reconexión silenciosa de la impresora Bluetooth al entrar (primera impresión instantánea).
  useEffect(() => { if (tenantId) posPrinterService.reconnectBluetooth(tenantId).catch(() => {}); }, [tenantId]);

  // Rastreo del camión en segundo plano (solo app nativa; en web es no-op).
  // Arranca cuando la ruta está ABIERTA y el repartidor lo tiene activado.
  const [trackingOn, setTrackingOn] = useState(() => localStorage.getItem('tracking_enabled') !== 'false');
  const toggleTracking = () => {
    const v = !trackingOn;
    setTrackingOn(v);
    localStorage.setItem('tracking_enabled', String(v));
  };
  useEffect(() => {
    if (!id) return;
    if (route?.status === 'open' && trackingOn) truckTracking.start(id).catch(() => {});
    else truckTracking.stop().catch(() => {});
    return () => { truckTracking.stop().catch(() => {}); };
  }, [id, route?.status, trackingOn]);

  const loadSales = useCallback(async () => {
    if (!id) return;
    setSalesLoading(true); setSalesErr(null);
    try { setSales(await distributionService.sales(id)); }
    catch (e) { setSalesErr(e instanceof Error ? e.message : 'No se pudieron cargar las ventas'); setSales([]); }
    finally { setSalesLoading(false); }
  }, [id]);
  useEffect(() => { if (tab === 'sales') loadSales(); }, [tab, loadSales]);

  const voidSale = async (inv: any) => {
    if (!confirm(`¿Anular la factura ${inv.invoice_number}? Los productos vuelven al camión.`)) return;
    setVoiding(inv.id);
    try {
      await distributionService.voidSale(inv.id);
      // Si la factura era electrónica, emitir la Nota de Crédito a Hacienda.
      if (inv.fe_clave && !inv.fe_nc_clave) {
        try {
          const { haciendaService } = await import('@/services/hacienda/haciendaService');
          await haciendaService.creditNote(inv.id, 'Anulación por error en facturación');
        } catch (ncErr) {
          alert(`Factura anulada, pero falló la Nota de Crédito: ${ncErr instanceof Error ? ncErr.message : 'error'}. Podés reintentarla en FE Facturas.`);
        }
      }
      await loadSales();
      await load();   // refresca stock del camión
      // Reimprimir comprobante de ANULACIÓN (solo aviso + número + monto).
      const now = new Date();
      const data = {
        invoiceNumber: inv.invoice_number,
        date: now.toLocaleDateString('es-CR'),
        time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
        items: [], subtotal: 0, tax: 0, total: Number(inv.total ?? 0),
        paymentMethod: '',
        voidNotice: true,
      };
      setPrintTicket_({
        invoiceNumber: inv.invoice_number, total: Number(inv.total ?? 0),
        print: () => posPrinterService.printAuto(data as any, tenantId ?? ''),
      });
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo anular'); }
    finally { setVoiding(null); }
  };

  const openStock = async () => {
    if (!id) return;
    setShowStock(true); setStockLoading(true);
    try { setStock(await distributionOfflineService.truckStock(id)); }
    catch { setStock([]); }
    finally { setStockLoading(false); }
  };

  const markNoSale = async (stop: RouteStop) => {
    const reason = window.prompt('Motivo (opcional):', '') ?? undefined;
    await distributionService.updateStop(stop.id, { status: 'no_sale', reason });
    await load();
  };

  const deliver = async (order: any, paymentMethod: 'cash' | 'card' | 'sinpe' | 'credit') => {
    const d = new Date(); const p = (x: number) => String(x).padStart(2, '0');
    const issued_at = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    const inv: any = await distributionOfflineService.deliverOrder(id ?? '', order.id, { payment_method: paymentMethod, issued_at });
    const now = new Date();
    const data = {
      invoiceNumber: inv?.invoice_number ?? '',
      date: now.toLocaleDateString('es-CR'),
      time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
      items: (order.items ?? []).map((it: any) => ({ name: it.product_name, quantity: it.quantity, unitPrice: it.unit_price, subtotal: Math.round(it.unit_price * it.quantity) })),
      subtotal: Number(order.total ?? 0), tax: 0, total: Number(order.total ?? 0),
      paymentMethod: payLabel(paymentMethod),
      customerName: order.customer?.name ?? order.customer_name,
      hideThanks: true,
    };
    setDeliverTarget(null);
    setPrintTicket_({
      invoiceNumber: inv?.invoice_number, total: Number(order.total ?? 0),
      print: () => printTicket(data, tenantId ?? '', paymentMethod),
      receipt: data,
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
            <button onClick={openStock}
              className="flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2.5 rounded-xl text-sm">
              <Package size={16} /> Inventario
            </button>
          </div>
        )}

        {/* Rastreo GPS: activar/desactivar (solo en la app del repartidor) */}
        {truckTracking.isSupported() && route.status === 'open' && (
          <button onClick={toggleTracking}
            className={`w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition ${trackingOn ? 'bg-emerald-400/90 text-emerald-950' : 'bg-white/15 text-white hover:bg-white/25'}`}>
            <MapPin size={15} /> {trackingOn ? 'Rastreo activo (tocá para apagar)' : 'Rastreo apagado (tocá para activar)'}
          </button>
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
        <button onClick={() => setTab('sales')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === 'sales' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600'}`}>
          Ventas
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

      {/* Ventas de la ruta — con anulación + devolución al camión */}
      {tab === 'sales' && (
        <div className="p-4 space-y-3">
          {salesLoading && <p className="text-center text-gray-400 text-sm py-10 flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Cargando ventas…</p>}
          {salesErr && !salesLoading && (
            <div className="text-center py-8">
              <p className="text-red-600 text-sm font-bold">No se pudieron cargar las ventas</p>
              <p className="text-gray-400 text-xs mt-1">{salesErr}</p>
              <button onClick={loadSales} className="mt-3 text-cyan-600 text-sm font-bold underline">Reintentar</button>
            </div>
          )}
          {!salesLoading && !salesErr && sales.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Sin ventas en esta ruta.</p>}
          {sales.map(inv => {
            const cancelled = inv.status === 'cancelled';
            return (
              <div key={inv.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${cancelled ? 'border-red-100 opacity-70' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900">#{inv.invoice_number} {cancelled && <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full ml-1">ANULADA</span>}</p>
                    <p className="text-[11px] text-gray-400">{inv.customer_name ?? 'Mostrador'} · {payLabel(inv.payment_method)}</p>
                  </div>
                  <span className="font-black text-gray-900 shrink-0">{fmt(inv.total)}</span>
                </div>
                <ul className="mt-2 text-sm text-gray-600 space-y-0.5">
                  {(inv.items ?? []).map((it: any, idx: number) => (
                    <li key={idx} className="flex justify-between">
                      <span>{it.quantity} × {it.product_name}</span>
                      <span className="text-gray-400">{fmt(Number(it.unit_price) * Number(it.quantity))}</span>
                    </li>
                  ))}
                </ul>
                {!cancelled && (
                  <button onClick={() => voidSale(inv)} disabled={voiding === inv.id}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-sm font-bold py-2 rounded-lg disabled:opacity-50">
                    {voiding === inv.id ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Anular y devolver al camión
                  </button>
                )}
              </div>
            );
          })}
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
          receipt={printTicket_.receipt}
          tenantId={tenantId ?? undefined}
          printFn={printTicket_.print}
          onClose={() => setPrintTicket_(null)}
        />
      )}

      {/* Modal: inventario cargado en el camión */}
      {showStock && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowStock(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2"><Package size={18} /> Inventario del camión</h2>
              <button onClick={() => setShowStock(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {stockLoading && <p className="text-center text-gray-400 text-sm py-10 flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Cargando…</p>}
              {!stockLoading && stock.filter(s => Number(s.quantity) > 0).length === 0 && (
                <p className="text-center text-gray-400 text-sm py-10">El camión no tiene productos cargados.</p>
              )}
              <ul className="divide-y divide-gray-100">
                {stock.filter(s => Number(s.quantity) > 0).sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '')).map(s => (
                  <li key={s.product_id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate">{s.product?.name ?? 'Producto'}</p>
                      <p className="text-[11px] text-gray-400">
                        {[s.product?.sku, s.product?.unit_type?.name].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <span className="font-black text-cyan-700 shrink-0 ml-3">
                      {Number(s.quantity)}{s.product?.unit_type?.abbreviation ? ` ${s.product.unit_type.abbreviation}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
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
  onPrint?: (info: { invoiceNumber?: string; total?: number; print: () => Promise<void>; receipt?: any }) => void;
}) {
  const isAuto = mode === 'auto';
  const { planFeatures } = useAuth();
  const feEnabled = !!(planFeatures as any)?.electronic_invoice;
  const [documentType, setDocumentType] = useState<'tiquete_electronico' | 'factura_electronica'>('tiquete_electronico');
  // Cliente: si viene de una parada, fijo; si es mostrador, seleccionable/opcional.
  const stopCust = stop ? (stop as any).customer : null;
  const [customer, setCustomer] = useState<{ id?: string; name?: string; identification?: string | null; email?: string | null } | null>(stopCust ?? null);
  const [pickOpen, setPickOpen] = useState(false);
  const [custList, setCustList] = useState<Customer[]>([]);
  const [custSearch, setCustSearch] = useState('');

  const [rows, setRows] = useState<Array<{ product_id: string; name: string; base: number; available: number; category_id?: string | null }>>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [unitMap, setUnitMap] = useState<Record<string, { name: string; abbreviation: string; requires_weight: boolean }>>({});
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'sinpe' | 'credit' | 'mixed'>('cash');
  const [mix, setMix] = useState<{ cash: number; card: number; sinpe: number }>({ cash: 0, card: 0, sinpe: 0 });
  const [enabledPays, setEnabledPays] = useState<string[]>(['cash', 'card', 'sinpe', 'credit', 'mixed']);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(false);
  const [weightFor, setWeightFor] = useState<{ id: string; name: string; price: number; available: number; abbr: string } | null>(null);

  // Valida y abre la previsualización antes de cobrar.
  const tryPreview = () => {
    if (lines.length === 0) { setErr('Agregá productos'); return; }
    if (paymentMethod === 'mixed') {
      const sum = Math.round((mix.cash + mix.card + mix.sinpe) * 100) / 100;
      if (sum !== Math.round(total * 100) / 100) { setErr('El pago mixto debe sumar el total'); return; }
    }
    setErr(''); setPreview(true);
  };

  // Métodos de pago habilitados (config de recibo).
  useEffect(() => {
    posPrinterService.loadReceiptConfig(tenantId)
      .then(cfg => setEnabledPays((cfg as any).paymentMethods ?? ['cash', 'card', 'sinpe', 'credit', 'mixed']))
      .catch(() => {});
  }, [tenantId]);
  // Si el método actual quedó deshabilitado, saltar al primero disponible.
  useEffect(() => {
    if (!enabledPays.includes(paymentMethod)) {
      const first = (['cash', 'card', 'sinpe', 'mixed'] as const).find(m => enabledPays.includes(m));
      if (first) setPaymentMethod(first);
    }
  }, [enabledPays]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Productos base (una sola vez): autoventa = stock del camión; preventa = catálogo.
  useEffect(() => {
    (async () => {
      if (isAuto) {
        const stock = await distributionOfflineService.truckStock(route.id).catch(() => []);
        setRows((stock ?? []).map((s: any) => ({
          product_id: s.product_id, name: s.product?.name ?? 'Producto',
          base: Number(s.product?.unit_price ?? 0), available: Number(s.quantity),
          category_id: s.product?.category_id ?? null,
        })));
      } else {
        const prods: Product[] = await inventoryProductsService.getAllProducts(tenantId).catch(() => []);
        setRows((prods ?? []).map(p => ({ product_id: p.id, name: p.name, base: Number(p.unit_price ?? 0), available: Infinity, category_id: (p as any).category_id ?? null })));
      }
    })();
  }, [isAuto, route.id, tenantId]);

  // Promociones activas hoy (mismo motor que el POS).
  useEffect(() => {
    promotionsService.getActiveToday(tenantId).then(setPromos).catch(() => setPromos([]));
  }, [tenantId]);

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
  const promoOf = (r: { product_id: string; category_id?: string | null }) =>
    getProductPromotion(r.product_id, r.category_id, promos);
  const filtered = rows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const lines = rows.map(r => {
    const baseUnit = priceOf(r.product_id, r.base);
    const promo = promoOf(r);
    const q = Number(qty[r.product_id] || 0);
    const unit_price = promo ? calcPromoUnitPrice(baseUnit, promo) : baseUnit;
    const subtotal = Math.round(promo ? calcPromoSubtotal(baseUnit, q, promo) : unit_price * q);
    return { ...r, baseUnit, unit_price, q, subtotal, promo };
  }).filter(l => l.q > 0);
  const total = lines.reduce((s, l) => s + l.subtotal, 0);

  const setQ = (id: string, v: number, available: number) => {
    let n = Math.max(0, Number(v) || 0);   // permite decimales (tipo de medida)
    if (isAuto && n > available) n = available;   // bloqueante: nunca más de lo cargado
    setQty(prev => ({ ...prev, [id]: n }));
  };

  const filteredCust = custList.filter(c => !custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()));

  const confirm = async () => {
    if (lines.length === 0) { setErr('Agregá productos'); return; }
    // Validar pago mixto (la suma debe igualar el total).
    let payments: Array<{ method: 'cash' | 'card' | 'sinpe'; amount: number }> | undefined;
    if (isAuto && paymentMethod === 'mixed') {
      const sum = Math.round((mix.cash + mix.card + mix.sinpe) * 100) / 100;
      if (sum !== Math.round(total * 100) / 100) { setErr('El pago mixto debe sumar el total'); return; }
      payments = (['cash', 'card', 'sinpe'] as const).filter(m => mix[m] > 0).map(m => ({ method: m, amount: mix[m] }));
    }
    setSaving(true); setErr('');
    try {
      const items = lines.map(l => ({
        product_id: l.product_id, quantity: l.q, unit_price: l.unit_price,
        subtotal: l.subtotal, discount_percent: 0, discount_amount: 0,
      }));
      const d = new Date(); const p = (x: number) => String(x).padStart(2, '0');
      const issued_at = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      if (isAuto) {
        if (feEnabled && documentType === 'factura_electronica' && !customer?.identification) {
          setErr('La factura electrónica requiere un cliente con cédula. Seleccioná un cliente registrado con identificación.');
          setSaving(false); return;
        }
        if (feEnabled) {
          const { confirmFeQuota } = await import('@/services/hacienda/feQuotaGuard');
          if (!(await confirmFeQuota())) { setSaving(false); return; }
        }
        const inv: any = await distributionOfflineService.sale(route.id, {
          stop_id: stop?.id, customer_id: customer?.id ?? null, customer_name: customer?.name, items,
          subtotal: total, tax_amount: 0, total, payment_method: paymentMethod, payments, issued_at,
          document_type: feEnabled ? documentType : undefined,
        });

        // Emisión electrónica a Hacienda (solo online y con factura real).
        let feFields: any = {};
        if (feEnabled && navigator.onLine && inv?.id && !inv.offline) {
          try {
            const { haciendaService } = await import('@/services/hacienda/haciendaService');
            const res: any = await haciendaService.emit(inv.id);
            if (res?.clave) {
              const esFactura = (res.tipo ?? (documentType === 'factura_electronica' ? '01' : '04')) === '01';
              const consec = res.consecutivo ?? (typeof res.clave === 'string' && res.clave.length === 50 ? res.clave.slice(21, 41) : undefined);
              feFields = { feClave: res.clave, feConsecutivo: consec, feTipoLabel: esFactura ? 'FACTURA ELECTRÓNICA' : 'TIQUETE ELECTRÓNICO' };
            }
          } catch (e) {
            console.error('[FE emit distribución] Error:', e);
          }
        }

        const now = new Date();
        const data = {
          invoiceNumber: inv?.invoice_number ?? '',
          date: now.toLocaleDateString('es-CR'),
          time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
          items: lines.map(l => ({ name: l.name, quantity: l.q, unitPrice: l.unit_price, subtotal: l.subtotal })),
          subtotal: total, tax: 0, total,
          paymentMethod: payLabel(paymentMethod),
          payments,
          customerName: customer?.name,
          customerEmail: (feEnabled && documentType === 'factura_electronica') ? (customer?.email ?? undefined) : undefined,
          hideThanks: true,
          ...feFields,
        };
        onPrint?.({
          invoiceNumber: inv?.invoice_number, total,
          print: () => printTicket(data, tenantId, paymentMethod),
          receipt: data,
        });
      } else {
        if (!customer?.id) { setErr('La preventa necesita un cliente'); setSaving(false); return; }
        await distributionOfflineService.order(route.id, {
          stop_id: stop?.id, customer_id: customer.id, customer_name: customer.name, items, total,
        });
        // Imprimir comprobante del PEDIDO (no fiscal, para la entrega).
        try {
          const now = new Date();
          await posPrinterService.printAuto({
            invoiceNumber: 'PEDIDO',
            date: now.toLocaleDateString('es-CR'),
            time: now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
            items: lines.map(l => ({ name: l.name, quantity: l.q, unitPrice: l.unit_price, subtotal: l.subtotal })),
            subtotal: total, tax: 0, total,
            paymentMethod: 'PEDIDO (a entregar)',
            customerName: customer.name,
            footerMessage: 'Comprobante de pedido — no es factura',
            hideThanks: true,
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
                    <button key={c.id} onClick={() => { setCustomer({ id: c.id, name: c.name, identification: c.identification, email: c.email }); setPickOpen(false); }}
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
              const promo = promoOf(r);
              const promoPrice = promo ? calcPromoUnitPrice(price, promo) : price;
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
                    {promo && promo.type !== '2x1'
                      ? (<>
                          <span className="text-[11px] font-black text-rose-600">{fmt(promoPrice)}</span>
                          <span className="ml-1 text-[9px] text-gray-400 line-through">{fmt(price)}</span>
                        </>)
                      : <span className={`text-[11px] font-black ${special ? 'text-violet-600' : 'text-gray-700'}`}>{fmt(price)}</span>}
                    {unit && <span className="text-[10px] text-gray-400">/{unit.abbreviation}</span>}
                    {promo && <span className="ml-1 text-[8px] font-black text-rose-600 bg-rose-100 px-1 rounded uppercase">{promoLabel(promo)}</span>}
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
          <div className="px-4 py-2 border-t border-gray-100 space-y-2">
            {feEnabled && (
              <div className="flex gap-2">
                {(['tiquete_electronico', 'factura_electronica'] as const).map(dt => (
                  <button key={dt} onClick={() => setDocumentType(dt)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold ${documentType === dt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {dt === 'tiquete_electronico' ? 'Tiquete elec.' : 'Factura elec.'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(['cash', 'card', 'sinpe', 'mixed', ...(customer?.id ? ['credit'] as const : [])] as const)
                .filter(m => enabledPays.includes(m)).map(m => (
                <button key={m} onClick={() => setPaymentMethod(m)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${paymentMethod === m ? (m === 'credit' ? 'bg-amber-600 text-white' : m === 'mixed' ? 'bg-violet-600 text-white' : 'bg-cyan-600 text-white') : 'bg-gray-100 text-gray-600'}`}>
                  {payLabel(m)}
                </button>
              ))}
            </div>
            {paymentMethod === 'mixed' && (
              <div className="space-y-1.5 bg-violet-50 border border-violet-200 rounded-xl p-2.5">
                {(['cash', 'card', 'sinpe'] as const).map(m => (
                  <div key={m} className="flex items-center gap-2">
                    <span className="w-16 text-[11px] font-bold text-gray-600">{payLabel(m)}</span>
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₡</span>
                      <input type="number" inputMode="decimal" value={mix[m] || ''} placeholder="0"
                        onChange={e => setMix(prev => ({ ...prev, [m]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                        className="w-full pl-5 pr-2 py-1 border border-gray-200 rounded-lg text-sm text-right" />
                    </div>
                  </div>
                ))}
                <div className={`flex justify-between text-[11px] font-bold ${Math.round((mix.cash + mix.card + mix.sinpe) * 100) / 100 === Math.round(total * 100) / 100 ? 'text-emerald-700' : 'text-red-600'}`}>
                  <span>Suma: {fmt(Math.round((mix.cash + mix.card + mix.sinpe) * 100) / 100)}</span>
                  <span>Total: {fmt(total)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-xl font-black text-gray-900">{fmt(total)}</p>
          </div>
          <button onClick={() => isAuto ? tryPreview() : confirm()} disabled={saving || lines.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black px-5 py-3 rounded-xl text-sm">
            {saving ? '…' : <><CheckCircle2 size={16} /> {isAuto ? 'Cobrar' : 'Guardar pedido'}</>}
          </button>
        </div>
      </div>

      {/* Previsualización ANTES de cobrar/emitir */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-60 p-4" onClick={() => setPreview(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 bg-emerald-600 text-white text-center">
              <p className="font-black">Confirmar venta</p>
              <p className="text-emerald-100 text-xs">Revisá antes de cobrar</p>
            </div>
            <div className="p-4">
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 font-mono text-[11px] leading-snug max-h-64 overflow-y-auto">
                <p className="text-center font-black">TICKET DE VENTA</p>
                {customer?.name && <p className="text-center">{customer.name}</p>}
                <div className="border-t border-dashed border-gray-300 my-1.5" />
                {lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="truncate">{l.q} × {l.name}</span>
                    <span>{fmt(l.subtotal)}</span>
                  </div>
                ))}
                <div className="border-t border-dashed border-gray-300 my-1.5" />
                <div className="flex justify-between font-black text-xs"><span>TOTAL</span><span>{fmt(total)}</span></div>
                <p className="text-center mt-1">{payLabel(paymentMethod)}</p>
              </div>
              {err && <p className="text-red-600 text-xs font-bold mt-2">{err}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => setPreview(false)} disabled={saving}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Volver</button>
                <button onClick={() => confirm().then(() => setPreview(false))} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-2.5 rounded-xl text-sm">
                  {saving ? '…' : <><CheckCircle2 size={15} /> Cobrar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
