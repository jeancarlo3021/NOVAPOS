import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Plus, X, Package, RefreshCw, LockKeyhole, Trash2,
  CheckCircle2, Search, Loader2, Navigation, BarChart3, Users, Scale, Printer,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { distributionService, type DeliveryRoute, type Truck as TruckT } from '@/services/distribution/distributionService';
import { customersService, type Customer } from '@/services/customers/customersService';
import { usersService } from '@/services/users/usersService';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { unitTypesService } from '@/services/Inventory/unitTypesService';
import type { Product } from '@/types/Types_POS';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const today = () => new Date().toISOString().slice(0, 10);

export const DistributionDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loadFor, setLoadFor] = useState<DeliveryRoute | null>(null);
  const [clearFor, setClearFor] = useState<DeliveryRoute | null>(null);
  const [clearStock, setClearStock] = useState<any[]>([]);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearErr, setClearErr] = useState('');
  const [closeSummary, setCloseSummary] = useState<{ route: DeliveryRoute; sum: import('@/services/distribution/distributionService').RouteCloseSummary } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showReturned, setShowReturned] = useState(false);
  const [printingClose, setPrintingClose] = useState(false);
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const reprintClose = async (r: DeliveryRoute) => {
    setReprintingId(r.id);
    try {
      const sum = await distributionService.closeSummary(r.id);
      await posPrinterService.printRouteClose({ ...sum, truck: sum.truck ?? r.warehouse?.name } as any, tenantId ?? '');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reimprimir el cierre'); }
    finally { setReprintingId(null); }
  };

  const printClose = async () => {
    if (!closeSummary) return;
    setPrintingClose(true);
    try {
      await posPrinterService.printRouteClose({ ...closeSummary.sum, truck: closeSummary.route.warehouse?.name } as any, tenantId ?? '');
    } catch (e) { alert(e instanceof Error ? e.message : 'No se pudo imprimir'); }
    finally { setPrintingClose(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRoutes(await distributionService.list()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const closeRoute = async (r: DeliveryRoute) => {
    if (!confirm(`Cerrar la ruta del ${r.route_date}? Se devuelve el sobrante del camión a la bodega central.`)) return;
    try {
      const sum = await distributionService.close(r.id);
      setCloseSummary({ route: r, sum });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al cerrar'); }
  };

  const openClearLoad = async (r: DeliveryRoute) => {
    setClearFor(r); setClearStock([]); setClearLoading(true); setClearErr('');
    try { setClearStock((await distributionService.truckStock(r.id)).filter((s: any) => Number(s.quantity) > 0)); }
    catch { setClearStock([]); }
    finally { setClearLoading(false); }
  };

  const confirmClearLoad = async () => {
    if (!clearFor) return;
    setClearing(true); setClearErr('');
    try {
      const res = await distributionService.clearLoad(clearFor.id);
      setClearFor(null);
      await load();
      alert(`Carga borrada: ${res.returned_items} producto(s) devueltos al inventario.`);
    } catch (e) { setClearErr(e instanceof Error ? e.message : 'No se pudo borrar la carga'); }
    finally { setClearing(false); }
  };

  const open = routes.filter(r => r.status === 'open').length;
  const closed = routes.filter(r => r.status === 'closed').length;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header con degradado */}
      <div className="bg-linear-to-r from-cyan-600 to-blue-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><Truck size={22} /></div>
            <div>
              <h1 className="text-2xl font-black">Distribución</h1>
              <p className="text-cyan-100 text-sm">Rutas de reparto en camión</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg bg-white/15 hover:bg-white/25"><RefreshCw size={16} /></button>
            <button onClick={() => setShowReport(true)}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2 rounded-xl text-sm">
              <BarChart3 size={16} /> Reporte
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-white text-cyan-700 font-black px-4 py-2 rounded-xl text-sm hover:bg-cyan-50">
              <Plus size={16} /> Nueva ruta
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/15 rounded-xl px-3 py-2"><p className="text-cyan-100 text-[11px]">Rutas</p><p className="text-xl font-black">{routes.length}</p></div>
          <div className="bg-white/15 rounded-xl px-3 py-2"><p className="text-cyan-100 text-[11px]">Abiertas</p><p className="text-xl font-black">{open}</p></div>
          <div className="bg-white/15 rounded-xl px-3 py-2"><p className="text-cyan-100 text-[11px]">Cerradas</p><p className="text-xl font-black">{closed}</p></div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-14 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
      ) : routes.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl text-center py-14">
          <Truck size={36} className="text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-semibold">Sin rutas</p>
          <p className="text-gray-400 text-sm">Creá una ruta para asignar camión, carga y clientes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {routes.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-black text-gray-900">{r.warehouse?.name ?? 'Camión'}</p>
                  <p className="text-xs text-gray-400">{r.route_date} · {r.modality === 'autoventa' ? 'Autoventa' : r.modality === 'preventa' ? 'Preventa' : 'Auto + Preventa'}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {r.status === 'open' ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <button onClick={() => navigate(`/distribution/${r.id}`)}
                className="w-full flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold py-2 rounded-lg">
                <Navigation size={14} /> Abrir ruta
              </button>
              {r.status === 'open' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={() => setLoadFor(r)}
                    className="flex items-center justify-center gap-1 bg-blue-50 text-blue-700 text-xs font-bold py-2 rounded-lg hover:bg-blue-100">
                    <Package size={13} /> Cargar
                  </button>
                  <button onClick={() => closeRoute(r)}
                    className="flex items-center justify-center gap-1 bg-red-50 text-red-600 text-xs font-bold py-2 rounded-lg hover:bg-red-100">
                    <LockKeyhole size={13} /> Cerrar
                  </button>
                  <button onClick={() => openClearLoad(r)}
                    className="col-span-2 flex items-center justify-center gap-1 bg-amber-50 text-amber-700 text-xs font-bold py-2 rounded-lg hover:bg-amber-100">
                    <Trash2 size={13} /> Borrar carga
                  </button>
                </div>
              )}
              {r.status === 'closed' && (
                <button onClick={() => reprintClose(r)} disabled={reprintingId === r.id}
                  className="w-full flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold py-2 rounded-lg disabled:opacity-50">
                  {reprintingId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} Reimprimir cierre
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && tenantId && (
        <CreateRouteModal tenantId={tenantId} onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await load(); }} />
      )}
      {loadFor && tenantId && (
        <LoadTruckModal tenantId={tenantId} route={loadFor} onClose={() => setLoadFor(null)} onDone={async () => { setLoadFor(null); await load(); }} />
      )}

      {/* Modal: confirmar borrado de carga con la lista de productos a devolver */}
      {clearFor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !clearing && setClearFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2"><Trash2 size={18} className="text-amber-600" /> Borrar carga</h2>
              <button onClick={() => !clearing && setClearFor(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto">
              <p className="text-sm text-gray-600 mb-3">
                Se devolverán al inventario los siguientes productos del camión <strong>{clearFor.warehouse?.name}</strong>. La ruta queda abierta y vacía para recargar.
              </p>
              {clearErr && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{clearErr}</div>}
              {clearLoading && <p className="text-center text-gray-400 text-sm py-8 flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> Cargando…</p>}
              {!clearLoading && clearStock.length === 0 && <p className="text-center text-gray-400 text-sm py-8">El camión no tiene carga.</p>}
              {clearStock.length > 0 && (
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                  {clearStock.sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '')).map(s => (
                    <li key={s.product_id} className="flex items-center justify-between px-3 py-2">
                      <span className="font-bold text-gray-800 truncate">{s.product?.name ?? 'Producto'}</span>
                      <span className="font-black text-amber-700 shrink-0 ml-3">{Number(s.quantity)}{s.product?.unit_type?.abbreviation ? ` ${s.product.unit_type.abbreviation}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-100">
              <button onClick={() => setClearFor(null)} disabled={clearing}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
              <button onClick={confirmClearLoad} disabled={clearing || clearLoading || clearStock.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl text-sm">
                {clearing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Borrar carga
              </button>
            </div>
          </div>
        </div>
      )}

      {showReport && <ReportModal onClose={() => setShowReport(false)} />}

      {closeSummary && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setCloseSummary(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-cyan-500 flex items-center justify-center"><CheckCircle2 size={16} className="text-white" /></div>
              <div>
                <h2 className="font-black text-gray-900 text-sm">Cierre de ruta</h2>
                <p className="text-xs text-gray-400">{closeSummary.route.warehouse?.name} · {closeSummary.route.route_date}</p>
              </div>
            </div>
            <div className="p-5 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Ventas</span><span className="font-bold">{closeSummary.sum.sales_count}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total vendido</span><span className="font-black text-emerald-600">{fmt(closeSummary.sum.sales_total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Anulaciones</span><span className="font-bold text-red-600">{closeSummary.sum.voids_count}</span></div>
              {closeSummary.sum.by_method && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Efectivo</span><span>{fmt(closeSummary.sum.by_method.cash)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tarjeta</span><span>{fmt(closeSummary.sum.by_method.card)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SINPE</span><span>{fmt(closeSummary.sum.by_method.sinpe)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Crédito</span><span>{fmt(closeSummary.sum.by_method.credit)}</span></div>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-100"><span className="text-gray-500">Productos devueltos a central</span><span className="font-bold">{closeSummary.sum.returned_items}</span></div>
              {showReturned && (
                <div className="border border-gray-100 rounded-lg p-3">
                  <p className="text-[11px] font-black text-gray-500 mb-1.5">Inventario devuelto</p>
                  {(closeSummary.sum.returned ?? []).length === 0
                    ? <p className="text-xs text-gray-400">Sin sobrante.</p>
                    : (closeSummary.sum.returned ?? []).map((r, i) => (
                        <div key={i} className="flex justify-between text-sm py-0.5"><span className="text-gray-700 truncate">{r.name}</span><span className="font-bold">×{r.quantity}</span></div>
                      ))}
                </div>
              )}
            </div>
            <div className="px-5 pb-5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={printClose} disabled={printingClose}
                  className="flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl text-sm">
                  {printingClose ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Imprimir cierre
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

// ── Modal: crear ruta ──────────────────────────────────────────────────────────
function CreateRouteModal({ tenantId, onClose, onCreated }: { tenantId: string; onClose: () => void; onCreated: () => void }) {
  const [trucks, setTrucks] = useState<TruckT[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; full_name: string }[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [modality, setModality] = useState<'autoventa' | 'preventa' | 'ambas'>('ambas');
  const [date, setDate] = useState(today());
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [zoneList, setZoneList] = useState<string[]>([]);
  const [busyTrucks, setBusyTrucks] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      setTrucks(await distributionService.trucks().catch(() => []));
      // Camiones que ya tienen una ruta abierta (no se pueden reusar hasta cerrarla).
      const open = await distributionService.list({ status: 'open' }).catch(() => []);
      setBusyTrucks(new Set((open ?? []).map(r => r.warehouse_id).filter(Boolean)));
      setCustomers(await customersService.list().catch(() => []));
      setZoneList((await customersService.listZones().catch(() => [])).map(z => z.name));
      try {
        const us = await usersService.getAllUsers(tenantId);
        setDrivers((us ?? []).map((u: any) => ({ id: u.id, full_name: u.full_name || u.email })));
      } catch { /* ignore */ }
    })();
  }, [tenantId]);

  const toggle = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const activeCustomers = customers.filter(c => c.is_active);
  const zones = Array.from(new Set([...zoneList, ...activeCustomers.map(c => (c.zone ?? '').trim()).filter(Boolean)])).sort();
  const filtered = activeCustomers.filter(c =>
    (!zone || (c.zone ?? '').trim() === zone) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase())),
  );

  const save = async () => {
    if (!warehouseId) { setErr('Elegí un camión'); return; }
    setSaving(true); setErr('');
    try {
      await distributionService.create({
        warehouse_id: warehouseId,
        driver_id: driverId || null,
        modality, route_date: date,
        stops: selected.map((cid, i) => ({ customer_id: cid, seq: i })),
      });
      onCreated();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error al crear'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Nueva ruta</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          {trucks.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
              No hay camiones. Creá una bodega tipo "camión" en Sucursales/Bodegas primero.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Camión</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">— Elegir —</option>
                {trucks.map(t => {
                  const busy = busyTrucks.has(t.id);
                  return <option key={t.id} value={t.id} disabled={busy}>{t.name}{busy ? ' — en ruta' : ''}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Repartidor</label>
              <select value={driverId} onChange={e => setDriverId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">— Sin asignar —</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Modalidad</label>
              <select value={modality} onChange={e => setModality(e.target.value as any)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="ambas">Ambas (auto + preventa)</option>
                <option value="autoventa">Autoventa</option>
                <option value="preventa">Preventa</option>
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1 text-xs font-bold text-gray-600 mb-1">
              <Users size={12} /> Clientes de la ruta ({selected.length}) <span className="font-normal text-gray-400">— opcional</span>
            </label>
            <p className="text-[11px] text-gray-400 mb-2">
              Asigná los clientes (por zona) para que el gerente les tome pedidos. El repartidor igual puede vender en mostrador.
            </p>
            {zones.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <select value={zone} onChange={e => setZone(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                  <option value="">Todas las zonas</option>
                  {zones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                <button type="button" onClick={() => setSelected(p => Array.from(new Set([...p, ...filtered.map(c => c.id)])))}
                  className="px-3 py-2 rounded-lg bg-cyan-50 text-cyan-700 text-xs font-bold whitespace-nowrap">
                  Seleccionar zona
                </button>
              </div>
            )}
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente…"
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
              {filtered.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)}
                    className="w-4 h-4 rounded text-cyan-600" />
                  <span className="flex-1">{c.name}</span>
                  {c.zone && <span className="text-[10px] text-cyan-600 bg-cyan-50 px-1.5 rounded">{c.zone}</span>}
                </label>
              ))}
              {filtered.length === 0 && <p className="text-center text-gray-400 text-xs py-4">Sin clientes</p>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={save} disabled={saving || !warehouseId}
            className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl text-sm">
            {saving ? 'Creando…' : 'Crear ruta'}
          </button>
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: cargar camión ────────────────────────────────────────────────────────
function LoadTruckModal({ tenantId, route, onClose, onDone }: { tenantId: string; route: DeliveryRoute; onClose: () => void; onDone: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [central, setCentral] = useState<Record<string, number>>({});
  const [unitMap, setUnitMap] = useState<Record<string, { abbreviation: string; requires_weight: boolean }>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [weightFor, setWeightFor] = useState<{ id: string; name: string; price: number; available: number; abbr: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [prods, cs, units] = await Promise.all([
        inventoryProductsService.getAllProducts(tenantId).catch(() => []),
        distributionService.centralStock().catch(() => ({})),
        unitTypesService.getAllUnitTypes(tenantId ?? '').catch(() => []),
      ]);
      setProducts(prods ?? []); setCentral(cs ?? {});
      const uById = new Map((units ?? []).map((u: any) => [u.id, u]));
      const WEIGHT = new Set(['kg', 'g', 'lb', 'lbs', 'oz', 'gr', 'kilo', 'kilos']);
      const map: Record<string, any> = {};
      for (const p of (prods ?? []) as any[]) {
        const ut = p.unit_type ?? (p.unit_type_id ? uById.get(p.unit_type_id) : null);
        if (ut) map[p.id] = { abbreviation: ut.abbreviation ?? 'u', requires_weight: ut.requires_weight != null ? ut.requires_weight : WEIGHT.has((ut.abbreviation ?? '').toLowerCase()) };
      }
      setUnitMap(map);
    })();
  }, [tenantId]);

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p as any).sku?.toLowerCase?.().includes(search.toLowerCase()));
  const items = Object.entries(qty).filter(([, v]) => v > 0).map(([product_id, v]) => ({ product_id, quantity: v }));
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const availOf = (id: string) => { const v = central[id]; return v === undefined ? 0 : v; }; // -1 = infinito

  const setQ = (id: string, n: number) => {
    const avail = availOf(id);
    const cap = avail === -1 ? Infinity : avail;
    // Permite decimales (ej. 1.5 kg), igual que el tipo de medida del producto.
    setQty(prev => ({ ...prev, [id]: Math.max(0, Math.min(cap, Number(n) || 0)) }));
  };

  const save = async () => {
    if (items.length === 0) { setErr('Agregá cantidades'); return; }
    setSaving(true); setErr('');
    try { await distributionService.load(route.id, items); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Error al cargar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-linear-to-r from-blue-600 to-cyan-600 text-white px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="font-black text-lg flex items-center gap-2"><Package size={18} /> Cargar camión</h2>
            <p className="text-blue-100 text-xs">{route.warehouse?.name} · descuenta del inventario del sistema</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg"><X size={18} /></button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {err && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filtered.map(p => {
              const avail = availOf(p.id);
              const q = qty[p.id] ?? 0;
              const inf = avail === -1;
              const out = !inf && avail <= 0;
              const unit = unitMap[p.id];
              const byWeight = !!unit?.requires_weight;
              const stepBy = byWeight ? 0.5 : 1;
              return (
                <div key={p.id} className={`rounded-xl border-2 p-2.5 flex flex-col transition ${q > 0 ? 'border-blue-400 bg-blue-50/50' : out ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div className="w-9 h-9 rounded-lg bg-linear-to-br from-blue-100 to-cyan-100 text-blue-700 font-black flex items-center justify-center text-sm shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    {q > 0 && <span className="text-[10px] font-black bg-blue-600 text-white rounded-full px-1.5 py-0.5">{q}</span>}
                  </div>
                  <p className="text-xs font-bold text-gray-800 leading-tight mt-1.5 line-clamp-2 min-h-8">{p.name}</p>
                  <p className={`text-[10px] font-bold mt-0.5 ${out ? 'text-red-500' : 'text-emerald-600'}`}>
                    Sistema: {inf ? '∞' : avail}{unit ? ` ${unit.abbreviation}` : ''}
                    {byWeight && <span className="ml-1 text-[8px] font-black text-amber-600 bg-amber-100 px-1 rounded uppercase">por peso</span>}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <button onClick={() => setQ(p.id, q - stepBy)} disabled={q <= 0}
                      className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-black disabled:opacity-30">−</button>
                    <input type="number" inputMode="decimal" step={byWeight ? '0.01' : 'any'} value={q || ''} onChange={e => setQ(p.id, parseFloat(e.target.value) || 0)}
                      placeholder="0" className="flex-1 w-full text-center border border-gray-200 rounded-lg py-1 text-sm min-w-0" />
                    <button onClick={() => setQ(p.id, q + stepBy)} disabled={out || (!inf && q >= avail)}
                      className="w-7 h-7 rounded-lg bg-blue-500 text-white font-black disabled:opacity-30">+</button>
                  </div>
                  {byWeight && (
                    <button onClick={() => setWeightFor({ id: p.id, name: p.name, price: Number((p as any).unit_price ?? 0), available: avail, abbr: unit?.abbreviation ?? 'kg' })} disabled={out}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 rounded-lg py-1 disabled:opacity-40">
                      <Scale size={12} /> Peso / ₡
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-10">Sin productos</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-gray-400">A cargar</p>
            <p className="font-black text-gray-900">{items.length} productos · {totalUnits} u.</p>
          </div>
          <button onClick={save} disabled={saving || items.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-black px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2">
            {saving ? 'Cargando…' : <><CheckCircle2 size={16} /> Cargar camión</>}
          </button>
        </div>
      </div>

      {weightFor && (
        <LoadWeightModal entry={weightFor}
          onClose={() => setWeightFor(null)}
          onConfirm={(v) => { setQ(weightFor.id, v); setWeightFor(null); }} />
      )}
    </div>
  );
}

// ── Modal: ingresar peso o monto (₡) para cargar productos por peso ──────────────
function LoadWeightModal({ entry, onConfirm, onClose }: {
  entry: { id: string; name: string; price: number; available: number; abbr: string };
  onConfirm: (weight: number) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'weight' | 'amount'>('weight');
  const [val, setVal] = useState('');
  const num = parseFloat(val) || 0;
  let weight = mode === 'weight' ? num : (entry.price > 0 ? num / entry.price : 0);
  weight = Math.round(weight * 1000) / 1000;
  const cap = entry.available === -1 ? Infinity : entry.available;
  const capped = Math.min(weight, cap);
  const presets = mode === 'weight' ? [0.25, 0.5, 1, 2, 5] : [1000, 2000, 5000, 10000];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Scale size={20} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-black truncate">{entry.name}</p>
              <p className="text-blue-100 text-xs">{fmt(entry.price)} / {entry.abbr} · disponible: {entry.available === -1 ? '∞' : `${entry.available} ${entry.abbr}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center"><X size={16} className="text-white" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setMode('weight'); setVal(''); }}
              className={`py-2 rounded-xl text-sm font-bold ${mode === 'weight' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Por peso ({entry.abbr})</button>
            <button onClick={() => { setMode('amount'); setVal(''); }}
              className={`py-2 rounded-xl text-sm font-bold ${mode === 'amount' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Por monto (₡)</button>
          </div>
          <input autoFocus type="number" inputMode="decimal" step="0.01" value={val} onChange={e => setVal(e.target.value)}
            placeholder={mode === 'weight' ? '0.00' : '₡0'}
            className="w-full text-3xl font-black text-center border-2 border-gray-200 rounded-2xl py-3 focus:outline-none focus:border-blue-400" />
          <div className="flex gap-2 flex-wrap">
            {presets.map(p => (
              <button key={p} onClick={() => setVal(String(p))}
                className="flex-1 min-w-14 py-2 rounded-xl font-bold text-sm bg-gray-50 border-2 border-gray-200 hover:border-blue-300">
                {mode === 'weight' ? `${p}${entry.abbr}` : fmt(p)}
              </button>
            ))}
          </div>
          {capped > 0 && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-4 py-3 text-center">
              <span className="text-blue-700 font-black text-xl">{capped} {entry.abbr}</span>
            </div>
          )}
          {weight > cap && cap !== Infinity && (
            <p className="text-amber-600 text-xs font-bold text-center">
              Solo hay {entry.available} {entry.abbr} en bodega — se ajustó a ese máximo.
            </p>
          )}
          <button onClick={() => capped > 0 && onConfirm(capped)} disabled={capped <= 0}
            className="w-full py-3.5 rounded-2xl font-black text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2">
            <CheckCircle2 size={18} /> Cargar {capped > 0 ? `${capped} ${entry.abbr}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: reporte de rutas y camiones ──────────────────────────────────────────
function ReportModal({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(today());
  const [data, setData] = useState<{ routes: any[]; trucks: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try { setData(await distributionService.report(from, to)); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { run(); }, [run]);

  const totalSales = (data?.routes ?? []).reduce((s, r) => s + r.sales_total, 0);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900 flex items-center gap-2"><BarChart3 size={18} className="text-cyan-600" /> Reporte de Distribución</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-gray-400">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <span className="ml-auto text-sm">Total vendido: <strong className="text-emerald-600">{fmt(totalSales)}</strong></span>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>
          ) : (
            <>
              {/* Por camión */}
              <div>
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Por camión</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(data?.trucks ?? []).map((t, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-800 text-sm flex items-center gap-1"><Truck size={14} className="text-cyan-600" /> {t.truck}</p>
                        <p className="text-xs text-gray-400">{t.routes} ruta{t.routes !== 1 ? 's' : ''} · {t.sales_count} ventas</p>
                      </div>
                      <span className="font-black text-gray-900">{fmt(t.sales_total)}</span>
                    </div>
                  ))}
                  {(data?.trucks ?? []).length === 0 && <p className="text-gray-400 text-sm">Sin datos</p>}
                </div>
              </div>
              {/* Por ruta */}
              <div>
                <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">Por ruta</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-[11px] font-bold text-gray-400 uppercase">
                        <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Camión</th><th className="px-3 py-2">Repartidor</th>
                        <th className="px-3 py-2 text-right">Ventas</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-center">Anul.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(data?.routes ?? []).map(r => (
                        <tr key={r.id} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2 text-gray-600">{r.route_date}</td>
                          <td className="px-3 py-2 font-semibold text-gray-800">{r.truck}</td>
                          <td className="px-3 py-2 text-gray-600">{r.driver}</td>
                          <td className="px-3 py-2 text-right">{r.sales_count}</td>
                          <td className="px-3 py-2 text-right font-bold">{fmt(r.sales_total)}</td>
                          <td className="px-3 py-2 text-center text-red-600">{r.voids_count || ''}</td>
                        </tr>
                      ))}
                      {(data?.routes ?? []).length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin rutas en el período</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DistributionDashboard;
