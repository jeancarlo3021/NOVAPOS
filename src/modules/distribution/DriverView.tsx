import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, MapPin, Navigation, PackageCheck, RefreshCw, Loader2,
  ClipboardCheck, ChevronRight, CheckCircle2, X,
} from 'lucide-react';
import { distributionService, type DeliveryRoute } from '@/services/distribution/distributionService';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

export const DriverView: React.FC = () => {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'routes' | 'orders'>('routes');
  const [verify, setVerify] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, o] = await Promise.all([
        distributionService.mine().catch(() => []),
        distributionService.myOrders().catch(() => []),
      ]);
      setRoutes(r ?? []); setOrders(o ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openRoutes = routes.filter(r => r.status === 'open');

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
            <button key={r.id} onClick={() => navigate(`/distribution/${r.id}`)}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-cyan-200">
              <div className="w-11 h-11 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0"><Truck size={20} className="text-cyan-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 truncate">{r.warehouse?.name ?? 'Camión'}</p>
                <p className="text-xs text-gray-400">{r.route_date} · {r.stops_done ?? 0}/{r.stops_total ?? 0} paradas</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {r.status === 'open' ? 'Abierta' : 'Cerrada'}
              </span>
              <ChevronRight size={18} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {orders.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 text-center py-12">
              <PackageCheck size={34} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-500 font-semibold">Nada por entregar</p>
            </div>
          )}
          {orders.map(o => {
            const addr = o.customer?.address;
            const mapUrl = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 truncate">{o.customer?.name ?? o.customer_name ?? 'Cliente'}</p>
                    <p className="text-[11px] text-gray-400">{o.route?.truck} · {o.route?.date}</p>
                    {addr && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {addr}</p>}
                  </div>
                  <span className="font-black text-gray-900 shrink-0">{fmt(o.total)}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {mapUrl && (
                    <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">
                      <Navigation size={13} /> Ir
                    </a>
                  )}
                  <button onClick={() => setVerify(o)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold py-2 rounded-lg">
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
          onDelivered={async () => { setVerify(null); await load(); }} />
      )}
    </div>
  );
};

// ── Modal: verificar productos y entregar ────────────────────────────────────────
function VerifyDeliverModal({ order, onClose, onDelivered }: { order: any; onClose: () => void; onDelivered: () => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const items: any[] = order.items ?? [];
  const allChecked = items.length > 0 && items.every((it: any) => checked[it.product_id]);

  const deliver = async () => {
    setSaving(true);
    try { await distributionService.deliverOrder(order.id); onDelivered(); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900">Verificar entrega</h2>
            <p className="text-xs text-gray-400">{order.customer?.name ?? order.customer_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-xs text-gray-400">Marcá cada producto al cargarlo/entregarlo:</p>
          {items.map((it: any) => (
            <label key={it.product_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer ${checked[it.product_id] ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={!!checked[it.product_id]}
                onChange={e => setChecked(p => ({ ...p, [it.product_id]: e.target.checked }))}
                className="w-5 h-5 rounded text-emerald-600" />
              <span className="flex-1 font-semibold text-gray-800">{it.product_name}</span>
              <span className="text-gray-500 font-black">×{it.quantity}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={deliver} disabled={saving || !allChecked}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black py-3 rounded-xl text-sm">
            {saving ? 'Entregando…' : <><CheckCircle2 size={16} /> {allChecked ? 'Confirmar entrega' : 'Marcá todos los productos'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DriverView;
