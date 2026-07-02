import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, MapPin, Navigation, PackageCheck, RefreshCw, Loader2,
  ClipboardCheck, CheckCircle2, X, Lock, Printer, Package,
} from 'lucide-react';
import { distributionService, type DeliveryRoute } from '@/services/distribution/distributionService';
import { distributionOfflineService } from '@/services/distribution/distributionOfflineService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { PrintTicketModal } from './PrintTicketModal';
import { useTenantId } from '@/hooks/useTenant';
import { offlineQueue } from '@/services/offlineQueue';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

export const DriverView: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'routes' | 'orders'>('routes');
  const [verify, setVerify] = useState<any | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeSummary, setCloseSummary] = useState<any | null>(null);
  const [showReturned, setShowReturned] = useState(false);
  const [printTicket_, setPrintTicket_] = useState<{ invoiceNumber?: string; total?: number; print: () => Promise<void>; receipt?: any } | null>(null);

  const printClose = () => {
    if (!closeSummary) return;
    // Modal con Reintentar / Conectar impresora (igual que las facturas).
    setPrintTicket_({ print: () => posPrinterService.printRouteClose(closeSummary, tenantId ?? '') });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, o] = await Promise.all([
        distributionOfflineService.mine().catch(() => []),
        distributionOfflineService.myOrders().catch(() => []),
      ]);
      setRoutes(r ?? []); setOrders(o ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Reconexión silenciosa de la impresora Bluetooth al entrar.
  useEffect(() => { if (tenantId) posPrinterService.reconnectBluetooth(tenantId).catch(() => {}); }, [tenantId]);

  const openRoutes = routes.filter(r => r.status === 'open');

  const closeRoute = async (r: DeliveryRoute) => {
    if (!confirm(`¿Cerrar la ruta de "${r.warehouse?.name ?? 'camión'}"?\nSe devolverá el sobrante al inventario y se hará el corte de ventas.`)) return;
    setClosingId(r.id);
    try {
      // 1) Subir PRIMERO las ventas offline pendientes (contado/crédito). Si se
      //    cierra la ruta con ventas sin subir, el corte queda incompleto y la
      //    ruta se cierra dejando esas ventas sin poder sincronizar (se pierden).
      const pending = await offlineQueue.getPendingCount().catch(() => 0);
      if (pending > 0) {
        if (!navigator.onLine) {
          alert(`Tenés ${pending} venta(s) sin subir y estás sin conexión.\nConectate a internet para que suban antes de cerrar la ruta.`);
          return;
        }
        await offlineQueue.syncAll(apiFetch).catch(() => {});
        const stillPending = await offlineQueue.getPendingCount().catch(() => 0);
        if (stillPending > 0) {
          alert(`Quedaron ${stillPending} venta(s) sin subir. Revisá la conexión e intentá cerrar de nuevo.`);
          return;
        }
      }
      // 2) El cierre requiere conexión (corta ventas + devuelve sobrante al inventario).
      if (!navigator.onLine) {
        alert('Necesitás conexión a internet para cerrar la ruta.');
        return;
      }
      const summary = await distributionService.close(r.id);
      setCloseSummary({ ...summary, truck: r.warehouse?.name });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo cerrar la ruta');
    } finally { setClosingId(null); }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <div className="bg-linear-to-r from-cyan-600 to-blue-600 text-white px-4 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2"><Truck size={24} /> Mis entregas</h1>
            <p className="text-cyan-100 text-sm">Tus rutas y pedidos por entregar</p>
          </div>
          <button onClick={load} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><RefreshCw size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/15 rounded-xl px-4 py-3">
            <p className="text-cyan-100 text-xs">Rutas abiertas</p>
            <p className="text-2xl font-black">{openRoutes.length}</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-3">
            <p className="text-cyan-100 text-xs">Pedidos por entregar</p>
            <p className="text-2xl font-black">{orders.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 -mt-3">
        <button onClick={() => setTab('routes')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold shadow-sm ${tab === 'routes' ? 'bg-white text-cyan-700' : 'bg-white/70 text-gray-500'}`}>
          Rutas
        </button>
        <button onClick={() => setTab('orders')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold shadow-sm ${tab === 'orders' ? 'bg-white text-cyan-700' : 'bg-white/70 text-gray-500'}`}>
          Por entregar ({orders.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
      ) : tab === 'routes' ? (
        <div className="p-4 space-y-3">
          {routes.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
              <Truck size={34} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-500 font-semibold">No tenés rutas asignadas</p>
              <p className="text-gray-400 text-sm">El encargado te asigna las rutas.</p>
            </div>
          )}
          {routes.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0"><Truck size={20} className="text-cyan-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-gray-900 truncate">{r.warehouse?.name ?? 'Camión'}</p>
                  <p className="text-xs text-gray-400">{r.route_date}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {r.status === 'open' ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              {r.status === 'open' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => navigate(`/distribution/${r.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold py-2.5 rounded-lg">
                    <Navigation size={15} /> Abrir / Vender
                  </button>
                  <button onClick={() => closeRoute(r)} disabled={closingId === r.id}
                    className="flex items-center justify-center gap-1.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-sm font-bold px-4 py-2.5 rounded-lg disabled:opacity-50">
                    {closingId === r.id ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />} Cerrar ruta
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 text-sm text-cyan-800">
            <p className="font-bold flex items-center gap-1.5"><PackageCheck size={15} /> Pedidos que tenés que llevar</p>
            <p className="text-xs text-cyan-700 mt-0.5">Estos pedidos los tomó el gerente. Verificá los productos antes de salir y marcá la entrega al llegar.</p>
          </div>
          {orders.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
              <PackageCheck size={34} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-500 font-semibold">Nada por entregar</p>
            </div>
          )}
          {orders.map((o, idx) => {
            const addr = o.customer?.address;
            const mapUrl = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;
            const items: any[] = o.items ?? [];
            const units = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-cyan-400 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2">
                    <span className="w-7 h-7 rounded-full bg-cyan-100 text-cyan-700 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 truncate">{o.customer?.name ?? o.customer_name ?? 'Cliente'}</p>
                      {addr && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {addr}</p>}
                      {o.customer?.phone && <p className="text-xs text-gray-400">{o.customer.phone}</p>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-gray-900">{fmt(o.total)}</p>
                    <p className="text-[10px] text-gray-400">{items.length} prod · {units} u.</p>
                  </div>
                </div>

                {/* Productos a entregar */}
                {items.length > 0 && (
                  <ul className="mt-3 bg-gray-50 rounded-lg p-2.5 text-sm text-gray-700 space-y-1">
                    {items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate"><strong>{it.quantity}</strong> × {it.product_name}</span>
                        <span className="text-gray-400 shrink-0">{fmt(Number(it.unit_price) * Number(it.quantity))}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2 mt-3">
                  {mapUrl && (
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-2.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">
                      <Navigation size={13} /> Cómo llegar
                    </a>
                  )}
                  <button onClick={() => setVerify(o)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-2.5 rounded-lg">
                    <ClipboardCheck size={15} /> Verificar y entregar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {verify && (
        <VerifyDeliverModal order={verify} onClose={() => setVerify(null)}
          onDelivered={async () => { setVerify(null); await load(); }}
          onPrint={(info) => setPrintTicket_(info)} />
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

      {closeSummary && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setCloseSummary(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="bg-linear-to-r from-emerald-600 to-teal-600 text-white px-5 py-4 rounded-t-2xl">
              <h2 className="font-black text-lg flex items-center gap-2"><CheckCircle2 size={20} /> Ruta cerrada</h2>
              <p className="text-emerald-100 text-xs">{closeSummary.truck ?? ''}</p>
            </div>
            <div className="p-5 space-y-2 text-sm max-h-[50vh] overflow-y-auto">
              <div className="flex justify-between"><span className="text-gray-500">Ventas</span><span className="font-bold">{closeSummary.sales_count ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total vendido</span><span className="font-black text-emerald-600">{fmt(closeSummary.sales_total ?? 0)}</span></div>
              {closeSummary.by_method && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Efectivo</span><span>{fmt(closeSummary.by_method.cash)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tarjeta</span><span>{fmt(closeSummary.by_method.card)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SINPE</span><span>{fmt(closeSummary.by_method.sinpe)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Crédito</span><span>{fmt(closeSummary.by_method.credit)}</span></div>
                </div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Anulaciones</span><span className="font-bold text-rose-600">{closeSummary.voids_count ?? 0}</span></div>

              {/* Abonos de CxC del día (efectivo/tarjeta/SINPE por aparte + detalle) */}
              {closeSummary.ar_payments && closeSummary.ar_payments.total > 0 && (
                <div className="border border-blue-100 bg-blue-50/50 rounded-lg p-3 mt-2">
                  <p className="text-xs font-black text-blue-700 mb-1.5">Abonos a crédito (CxC) — {fmt(closeSummary.ar_payments.total)}</p>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-gray-500">Efectivo</span><span>{fmt(closeSummary.ar_payments.by_method.cash)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Tarjeta</span><span>{fmt(closeSummary.ar_payments.by_method.card)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">SINPE</span><span>{fmt(closeSummary.ar_payments.by_method.sinpe)}</span></div>
                  </div>
                  {closeSummary.ar_payments.list.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-blue-100 space-y-0.5">
                      {closeSummary.ar_payments.list.map((a: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-600 truncate">{a.customer} <span className="text-gray-400">· {a.method === 'card' ? 'Tarjeta' : a.method === 'sinpe' ? 'SINPE' : 'Efectivo'}</span></span>
                          <span className="font-bold">{fmt(a.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Gastos del día */}
              {closeSummary.expenses && closeSummary.expenses.total > 0 && (
                <div className="border border-rose-100 bg-rose-50/50 rounded-lg p-3 mt-2">
                  <p className="text-xs font-black text-rose-700 mb-1.5">Gastos del día — {fmt(closeSummary.expenses.total)}</p>
                  <div className="space-y-0.5">
                    {closeSummary.expenses.list.map((g: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-600 truncate">{g.description}</span>
                        <span className="font-bold">{fmt(g.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showReturned && (
                <div className="border border-gray-100 rounded-lg p-3 mt-2">
                  <p className="text-xs font-black text-gray-500 mb-1.5">Inventario devuelto a bodega</p>
                  {(closeSummary.returned ?? []).length === 0
                    ? <p className="text-xs text-gray-400">Sin sobrante (se vendió todo).</p>
                    : [...(closeSummary.returned ?? [])].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'es')).map((r: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm py-0.5">
                          <span className="text-gray-700 truncate">{r.name}</span>
                          <span className="font-bold">×{r.quantity}</span>
                        </div>
                      ))}
                </div>
              )}
            </div>
            <div className="px-5 pb-5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={printClose}
                  className="flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl text-sm">
                  <Printer size={15} /> Imprimir cierre
                </button>
                <button onClick={() => setShowReturned(v => !v)}
                  className="flex items-center justify-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 font-bold py-2.5 rounded-xl text-sm">
                  <Package size={15} /> {showReturned ? 'Ocultar' : 'Restante'}
                </button>
              </div>
              <button onClick={() => { setCloseSummary(null); setShowReturned(false); }} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-2.5 rounded-xl text-sm">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Modal: verificar productos y entregar ────────────────────────────────────────
function VerifyDeliverModal({ order, onClose, onDelivered, onPrint }: {
  order: any; onClose: () => void; onDelivered: () => void;
  onPrint: (info: { invoiceNumber?: string; total?: number; print: () => Promise<void>; receipt?: any }) => void;
}) {
  const { tenantId } = useTenantId();
  const { planFeatures } = useAuth();
  const feEnabled = !!(planFeatures as any)?.electronic_invoice;
  const [documentType, setDocumentType] = useState<'tiquete_electronico' | 'factura_electronica'>('tiquete_electronico');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'sinpe' | 'credit' | 'mixed'>('cash');
  const [mix, setMix] = useState<{ cash: number; card: number; sinpe: number }>({ cash: 0, card: 0, sinpe: 0 });
  const [preview, setPreview] = useState(false);
  const [enabledPays, setEnabledPays] = useState<string[]>(['cash', 'card', 'sinpe', 'credit', 'mixed']);
  useEffect(() => {
    posPrinterService.loadReceiptConfig(tenantId ?? '')
      .then(cfg => setEnabledPays((cfg as any).paymentMethods ?? ['cash', 'card', 'sinpe', 'credit', 'mixed']))
      .catch(() => {});
  }, [tenantId]);
  useEffect(() => {
    if (!enabledPays.includes(paymentMethod)) {
      const first = (['cash', 'card', 'sinpe', 'mixed', 'credit'] as const).find(m => enabledPays.includes(m));
      if (first) setPaymentMethod(first);
    }
  }, [enabledPays]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const items: any[] = order.items ?? [];
  const allChecked = items.length > 0 && items.every((it: any) => checked[it.product_id]);
  const orderTotal = Number(order.total ?? 0);
  const mixSum = Math.round((mix.cash + mix.card + mix.sinpe) * 100) / 100;
  const mixValid = paymentMethod !== 'mixed' || mixSum === orderTotal;

  const deliver = async () => {
    if (feEnabled && documentType === 'factura_electronica' && !(order.customer?.identification || order.customer_identification)) {
      alert('La factura electrónica requiere que el cliente tenga cédula. Usá tiquete electrónico o registrá la cédula del cliente.');
      return;
    }
    if (feEnabled) {
      const { confirmFeQuota } = await import('@/services/hacienda/feQuotaGuard');
      if (!(await confirmFeQuota())) return;
    }
    setSaving(true);
    try {
      const d = new Date(); const p = (x: number) => String(x).padStart(2, '0');
      const issued_at = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      const payments = paymentMethod === 'mixed'
        ? (['cash', 'card', 'sinpe'] as const).filter(m => mix[m] > 0).map(m => ({ method: m, amount: mix[m] }))
        : undefined;
      const inv: any = await distributionOfflineService.deliverOrder(order.route_id ?? '', order.id, {
        payment_method: paymentMethod, payments, issued_at,
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
        items: items.map((it: any) => ({ name: it.product_name, quantity: it.quantity, unitPrice: it.unit_price, subtotal: Math.round(it.unit_price * it.quantity) })),
        subtotal: Number(order.total ?? 0), tax: 0, total: Number(order.total ?? 0),
        paymentMethod: paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' ? 'Tarjeta' : paymentMethod === 'sinpe' ? 'SINPE' : paymentMethod === 'mixed' ? 'Mixto' : 'Crédito',
        payments,
        customerName: order.customer?.name ?? order.customer_name,
        customerEmail: (feEnabled && documentType === 'factura_electronica') ? (order.customer?.email ?? order.customer_email ?? undefined) : undefined,
        hideThanks: true,
        ...feFields,
      };
      const doPrint = async () => {
        const cfg: any = await posPrinterService.loadReceiptConfig(tenantId ?? '').catch(() => null);
        const dbl: string[] = cfg?.doubleInvoiceMethods ?? ['credit'];
        if (dbl.includes(paymentMethod)) {
          await posPrinterService.printAuto({ ...data, copyLabel: 'ORIGINAL - CLIENTE' } as any, tenantId ?? '');
          await posPrinterService.printAuto({ ...data, copyLabel: 'COPIA - VENDEDOR' } as any, tenantId ?? '');
        } else {
          await posPrinterService.printAuto(data as any, tenantId ?? '');
        }
      };
      onPrint({ invoiceNumber: inv?.invoice_number, total: Number(order.total ?? 0), print: doPrint, receipt: data });
      onDelivered();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl h-[94vh] sm:h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-lg text-gray-900">Verificar entrega</h2>
            <p className="text-sm text-gray-500">{order.customer?.name ?? order.customer_name}{order.customer?.address ? ` · ${order.customer.address}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-sm font-bold text-gray-500 mb-1">Marcá cada producto al cargarlo / entregarlo:</p>
          {items.map((it: any) => (
            <label key={it.product_id} className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 cursor-pointer transition ${checked[it.product_id] ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={!!checked[it.product_id]}
                onChange={e => setChecked(p => ({ ...p, [it.product_id]: e.target.checked }))}
                className="w-6 h-6 rounded text-emerald-600 shrink-0" />
              <span className="flex-1 font-bold text-gray-800 text-base">{it.product_name}</span>
              <span className="text-gray-700 font-black text-lg">×{it.quantity}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 space-y-3">
          {feEnabled && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1.5">Tipo de comprobante</p>
              <div className="grid grid-cols-2 gap-2">
                {(['tiquete_electronico', 'factura_electronica'] as const).map(d => (
                  <button key={d} onClick={() => setDocumentType(d)}
                    className={`py-2 rounded-lg text-xs font-bold ${documentType === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {d === 'tiquete_electronico' ? 'Tiquete electrónico' : 'Factura electrónica'}
                  </button>
                ))}
              </div>
              {documentType === 'factura_electronica' && (
                <p className="text-[11px] text-amber-600 mt-1">La factura requiere que el cliente tenga cédula.</p>
              )}
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1.5">¿Con qué pagó el cliente?</p>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'card', 'sinpe', 'credit', 'mixed'] as const).filter(m => enabledPays.includes(m)).map(m => (
                <button key={m} onClick={() => setPaymentMethod(m)}
                  className={`py-2 rounded-lg text-xs font-bold ${paymentMethod === m ? (m === 'credit' ? 'bg-amber-600 text-white' : m === 'mixed' ? 'bg-violet-600 text-white' : 'bg-cyan-600 text-white') : 'bg-gray-100 text-gray-600'}`}>
                  {m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : m === 'sinpe' ? 'SINPE' : m === 'credit' ? 'Crédito' : 'Mixto'}
                </button>
              ))}
            </div>
          </div>
          {paymentMethod === 'mixed' && (
            <div className="space-y-2 bg-violet-50 border border-violet-200 rounded-xl p-3">
              {(['cash', 'card', 'sinpe'] as const).map(m => (
                <div key={m} className="flex items-center gap-2">
                  <span className="w-20 text-xs font-bold text-gray-600">{m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : 'SINPE'}</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₡</span>
                    <input type="number" inputMode="decimal" value={mix[m] || ''} placeholder="0"
                      onChange={e => setMix(prev => ({ ...prev, [m]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                      className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right" />
                  </div>
                </div>
              ))}
              <div className={`flex justify-between text-xs font-bold ${mixValid ? 'text-emerald-700' : 'text-red-600'}`}>
                <span>Suma: {fmt(mixSum)}</span>
                <span>Total: {fmt(orderTotal)}</span>
              </div>
              {!mixValid && <p className="text-[11px] text-red-600">La suma debe ser igual al total.</p>}
            </div>
          )}
          <button onClick={() => setPreview(true)} disabled={saving || !allChecked || !mixValid}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black py-3 rounded-xl text-sm">
            {saving ? 'Entregando…' : <><CheckCircle2 size={16} /> {allChecked ? `Entregar e imprimir (${fmt(order.total)})` : 'Marcá todos los productos'}</>}
          </button>
        </div>
      </div>

      {/* Previsualización ANTES de entregar/emitir */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-60 p-4" onClick={() => setPreview(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 bg-emerald-600 text-white text-center">
              <p className="font-black">Confirmar entrega</p>
              <p className="text-emerald-100 text-xs">Revisá antes de cobrar</p>
            </div>
            <div className="p-4">
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 font-mono text-[11px] leading-snug max-h-64 overflow-y-auto">
                <p className="text-center font-black">TICKET DE VENTA</p>
                {(order.customer?.name ?? order.customer_name) && <p className="text-center">{order.customer?.name ?? order.customer_name}</p>}
                <div className="border-t border-dashed border-gray-300 my-1.5" />
                {items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="truncate">{it.quantity} × {it.product_name}</span>
                    <span>{fmt(Math.round(it.unit_price * it.quantity))}</span>
                  </div>
                ))}
                <div className="border-t border-dashed border-gray-300 my-1.5" />
                <div className="flex justify-between font-black text-xs"><span>TOTAL</span><span>{fmt(orderTotal)}</span></div>
                <p className="text-center mt-1">{paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' ? 'Tarjeta' : paymentMethod === 'sinpe' ? 'SINPE' : paymentMethod === 'mixed' ? 'Mixto' : 'Crédito'}</p>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setPreview(false)} disabled={saving}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Volver</button>
                <button onClick={() => { setPreview(false); deliver(); }} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-2.5 rounded-xl text-sm">
                  {saving ? '…' : <><CheckCircle2 size={15} /> Entregar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverView;
