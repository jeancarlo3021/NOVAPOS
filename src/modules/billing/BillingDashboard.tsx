import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Grid as GridIcon, ArrowLeft } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { MapItemShape } from '@/modules/tables/MapShapes';
import { migrateItems } from '@/modules/tables/types';
import type { MapItem } from '@/modules/tables/types';
import { BillPanel } from './BillPanel';
import { OrderCatalogModal } from './OrderCatalogModal';
import { SplitBillModal } from './SplitBillModal';
import { billingService, findOpenBillForSpot } from './billingService';
import { printBillTicket } from './printBill';
import type { Bill, BillItem, CobrableKind, SpotRef } from './types';
import { cacheGet, cacheKey } from '@/utils/offlineCache';

const MAP_KEY    = (tenantId: string) => `novapos_tables_map_${tenantId}`;
const CANVAS_W = 1600;
const CANVAS_H = 1000;

function loadMap(tenantId: string): MapItem[] {
  try {
    const raw = localStorage.getItem(MAP_KEY(tenantId));
    if (!raw) return [];
    return migrateItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

function uidItem(prefix = 'bi') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const COBRABLE: CobrableKind[] = ['table', 'freeTable', 'seat'];
function isCobrable(it: MapItem): boolean {
  return (COBRABLE as string[]).includes(it.kind);
}

export function BillingDashboard() {
  const { tenantId } = useTenantId();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mapItems, setMapItems] = useState<MapItem[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [pinForSpot, setPinForSpot] = useState<string | null>(null);   // mesa esperando PIN del mesero
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [addingSpot, setAddingSpot] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showSplit, setShowSplit] = useState(false);

  // Config de impuestos (cacheada desde Settings → General)
  const taxCfg = useMemo(() => {
    if (!tenantId) return { enabled: false, rate: 0 };
    try {
      const cached = cacheGet<any>(cacheKey(tenantId, 'settings_general'))
                  ?? cacheGet<any>(cacheKey(tenantId, 'general_settings'));
      const g = cached?.config ?? cached;
      return {
        enabled: g?.taxEnabled !== false,
        rate: (g?.taxPercentage ?? 13) / 100,
      };
    } catch { return { enabled: false, rate: 0 }; }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setMapItems(loadMap(tenantId));   // cache local (rápido / offline)
    setBills(billingService.load(tenantId));
    // Traer el mapa desde la BD (fuente de verdad, compartido entre dispositivos).
    let cancelled = false;
    (async () => {
      try {
        const { apiFetch } = await import('@/lib/api');
        const cfg = await apiFetch<{ items?: MapItem[] }>('/settings/tables-map');
        if (!cancelled && Array.isArray(cfg?.items)) {
          const items = migrateItems(cfg.items);
          setMapItems(items);
          try { localStorage.setItem(MAP_KEY(tenantId), JSON.stringify(items)); } catch { /* cuota */ }
        }
      } catch { /* offline: se queda con el cache */ }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Persistencia automática de bills.
  useEffect(() => {
    if (!tenantId) return;
    billingService.save(tenantId, bills);
  }, [tenantId, bills]);

  const spotsById = useMemo(() => {
    const m = new Map<string, MapItem>();
    mapItems.forEach(it => m.set(it.id, it));
    return m;
  }, [mapItems]);

  // Bill activo: la cuenta abierta sobre el spot seleccionado, si existe.
  const activeBill = useMemo(
    () => selectedSpotId ? findOpenBillForSpot(selectedSpotId, bills) : null,
    [selectedSpotId, bills],
  );

  // Sobre-escribimos el status visual del MapItem según las cuentas abiertas.
  const visualItems = useMemo(() => {
    const inBill = new Set<string>();
    const billByspot = new Map<string, Bill>();
    bills.forEach(b => {
      if (b.status === 'open') b.spots.forEach(s => { inBill.add(s.id); billByspot.set(s.id, b); });
    });
    return mapItems.map(it => {
      if (isCobrable(it) && inBill.has(it.id)) {
        return { ...it, status: 'occupied' as const };
      }
      // Spots cobrables sin bill = libres por defecto en esta vista.
      if (isCobrable(it)) {
        return { ...it, status: 'free' as const };
      }
      return it;
    });
  }, [mapItems, bills]);

  // ── Acciones sobre el bill activo ─────────────────────────────────────

  const handleStartBill = () => {
    if (!selectedSpotId) return;
    const item = spotsById.get(selectedSpotId);
    if (!item || !isCobrable(item)) return;
    const spotRef: SpotRef = { id: item.id, kind: item.kind as CobrableKind };
    setBills(prev => [...prev, billingService.create(spotRef, prev)]);
  };

  const updateBill = (patch: Partial<Bill>) => {
    if (!activeBill) return;
    setBills(prev => prev.map(b => b.id === activeBill.id ? { ...b, ...patch } : b));
  };

  // Agregar item desde el catálogo (con modifiers + notes ya resueltos)
  const addCatalogItem = (item: Omit<BillItem, 'id'>) => {
    if (!activeBill) return;
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, items: [...b.items, { ...item, id: uidItem() }] }
      : b));
  };

  // Agregar item manual rápido (nombre + precio libre, sin modifiers)
  const addItem = (name: string, price: number) => {
    if (!activeBill) return;
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, items: [...b.items, { id: uidItem(), name, unit_price: price, quantity: 1 }] }
      : b));
  };

  const updateItemQty = (itemId: string, qty: number) => {
    if (!activeBill) return;
    setBills(prev => prev.map(b => {
      if (b.id !== activeBill.id) return b;
      const items = qty <= 0
        ? b.items.filter(it => it.id !== itemId)
        : b.items.map(it => it.id === itemId ? { ...it, quantity: qty } : it);
      return { ...b, items };
    }));
  };

  const removeItem = (itemId: string) => {
    if (!activeBill) return;
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, items: b.items.filter(it => it.id !== itemId) }
      : b));
  };

  const removeSpot = (spotId: string) => {
    if (!activeBill) return;
    if (activeBill.spots.length <= 1) return;
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, spots: b.spots.filter(s => s.id !== spotId) }
      : b));
    if (selectedSpotId === spotId) {
      // Saltar al primer spot restante.
      const rest = activeBill.spots.filter(s => s.id !== spotId);
      setSelectedSpotId(rest[0]?.id ?? null);
    }
  };

  const charge = () => {
    if (!activeBill || activeBill.items.length === 0 || !tenantId) return;
    // Imprimir ticket con impuestos
    printBillTicket(tenantId, activeBill, {
      taxEnabled: taxCfg.enabled,
      taxRate: taxCfg.rate,
      cashierName: user?.email ?? undefined,
    }).catch(err => console.warn('[billing] error imprimir ticket:', err));

    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, status: 'paid', closed_at: new Date().toISOString() }
      : b));
    setSelectedSpotId(null);
  };

  // Mandar a comandas: imprime las comandas de cocina con los items actuales
  // (NO cobra). Marca el bill como "enviado" para feedback visual.
  const sendKitchen = async () => {
    if (!activeBill || activeBill.items.length === 0 || !tenantId) return;
    try {
      const { posPrinterService } = await import('@/services/pos/posPrinterService');
      // Mesero que digitó (o responsable) — para que cocina sepa de quién es.
      const mesero = activeBill.waiter_name || activeBill.responsible_name;
      await posPrinterService.printComandas(
        `Mesa ${activeBill.id.slice(-4)}${mesero ? ` · ${mesero}` : ''}`,
        activeBill.items.map(it => ({
          name: it.notes ? `${it.name} (${it.notes})` : it.name,
          quantity: it.quantity,
          category_id: it.category_id,   // para rutear a la impresora de su estación
        })),
        tenantId,
        activeBill.customer_name ?? undefined,
      );
    } catch (e) {
      console.warn('[billing] error comandas:', e);
    }
  };

  // Dividir cuenta → genera N facturas (una por parte) y cierra la original.
  const handleSplitConfirm = (parts: BillItem[][]) => {
    if (!activeBill || !tenantId) return;
    const now = new Date().toISOString();
    // Imprimir un ticket por cada parte no vacía
    parts.forEach((items, idx) => {
      if (items.length === 0) return;
      const partBill: Bill = {
        ...activeBill,
        id: `${activeBill.id}_p${idx + 1}`,
        items,
      };
      printBillTicket(tenantId, partBill, {
        taxEnabled: taxCfg.enabled,
        taxRate: taxCfg.rate,
        cashierName: user?.email ?? undefined,
        partLabel: `Parte ${idx + 1} de ${parts.length}`,
      }).catch(() => {});
    });
    // Cerrar la cuenta original como pagada
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, status: 'paid', closed_at: now }
      : b));
    setShowSplit(false);
    setSelectedSpotId(null);
  };

  const cancelBill = () => {
    if (!activeBill) return;
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, status: 'cancelled', closed_at: new Date().toISOString() }
      : b));
    setSelectedSpotId(null);
  };

  // ── Click sobre un spot del mapa ──────────────────────────────────────

  const handleSpotClick = useCallback((id: string) => {
    const item = spotsById.get(id);
    if (!item || !isCobrable(item)) return;

    // Si estamos en modo "unir spot" y hay un bill activo, lo agregamos.
    if (addingSpot && activeBill) {
      const alreadyInThis = activeBill.spots.some(s => s.id === id);
      if (alreadyInThis) { setAddingSpot(false); return; }
      // No permitir unir un spot que ya tenga otra cuenta abierta.
      const otherBill = findOpenBillForSpot(id, bills);
      if (otherBill && otherBill.id !== activeBill.id) {
        alert('Ese sitio ya tiene una cuenta abierta. Ciérrala primero.');
        return;
      }
      const spotRef: SpotRef = { id: item.id, kind: item.kind as CobrableKind };
      setBills(prev => prev.map(b => b.id === activeBill.id
        ? { ...b, spots: [...b.spots, spotRef] }
        : b));
      setAddingSpot(false);
      return;
    }

    // Mesa CON cuenta abierta → entra directo. Mesa LIBRE → pide PIN del mesero
    // (responsable) ANTES de abrir la cuenta.
    const existing = findOpenBillForSpot(id, bills);
    if (existing) { setSelectedSpotId(id); return; }
    setPinForSpot(id);
  }, [spotsById, addingSpot, activeBill, bills]);

  // Abre la cuenta de la mesa con el mesero identificado por PIN como responsable.
  const openBillWithWaiter = (spotId: string, meseroName: string) => {
    const item = spotsById.get(spotId);
    if (!item || !isCobrable(item)) { setPinForSpot(null); return; }
    const spotRef: SpotRef = { id: item.id, kind: item.kind as CobrableKind };
    setBills(prev => [...prev, { ...billingService.create(spotRef, prev), responsible_name: meseroName, waiter_name: meseroName }]);
    setSelectedSpotId(spotId);
    setPinForSpot(null);
  };

  // ── Stats ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const open = bills.filter(b => b.status === 'open');
    const totalOpen = open.reduce((s, b) => s + b.items.reduce((x, it) => x + it.unit_price * it.quantity, 0), 0);
    const occupiedSpots = new Set(open.flatMap(b => b.spots.map(s => s.id))).size;
    const cobrableSpots = mapItems.filter(isCobrable).length;
    return { open: open.length, totalOpen, occupiedSpots, freeSpots: cobrableSpots - occupiedSpots };
  }, [bills, mapItems]);

  // Etiqueta de la mesa/spot del bill activo (para el header full-screen)
  const activeSpotLabel = useMemo(() => {
    if (!activeBill) return '';
    const first = activeBill.spots[0];
    const it = first ? spotsById.get(first.id) : null;
    if (!it) return 'Mesa';
    if (it.kind === 'table' || it.kind === 'freeTable') return it.label;
    if (it.kind === 'seat') return 'Silla';
    return 'Mesa';
  }, [activeBill, spotsById]);

  // ── Vista full-screen tipo POS (cuando hay cuenta activa) ─────────────────
  if (activeBill && tenantId) {
    return (
      <div className="fixed inset-0 z-40 bg-white flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center gap-3 shrink-0">
          <button onClick={() => setSelectedSpotId(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold transition">
            <GridIcon size={15} /> Mapa
          </button>
          <h1 className="font-black text-lg flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: activeBill.color }} />
            {activeSpotLabel}
            {activeBill.spots.length > 1 && (
              <span className="text-xs font-normal text-white/60">+{activeBill.spots.length - 1} sitios</span>
            )}
          </h1>
        </div>

        {/* Body: catálogo embebido + panel cuenta */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden border-r border-gray-200">
            <OrderCatalogModal
              tenantId={tenantId}
              embedded
              onClose={() => {}}
              onAdd={addCatalogItem}
            />
          </div>
          <BillPanel
            bill={activeBill}
            spotsById={spotsById}
            addingSpot={addingSpot}
            taxEnabled={taxCfg.enabled}
            taxRate={taxCfg.rate}
            onUpdate={updateBill}
            onAddItem={addItem}
            onSplit={() => setShowSplit(true)}
            onSendKitchen={sendKitchen}
            onUpdateItemQty={updateItemQty}
            onRemoveItem={removeItem}
            onRemoveSpot={removeSpot}
            onStartAddSpot={() => { /* unir spots se hace desde el mapa */ }}
            onCancelAddSpot={() => setAddingSpot(false)}
            onCharge={charge}
            onCancelBill={cancelBill}
          />
        </div>

        {/* Modal de dividir cuenta */}
        {showSplit && (
          <SplitBillModal
            bill={activeBill}
            taxEnabled={taxCfg.enabled}
            taxRate={taxCfg.rate}
            onClose={() => setShowSplit(false)}
            onConfirm={handleSplitConfirm}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0 flex-wrap">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition">
          <ArrowLeft size={15} /> Salir
        </button>
        <Receipt size={20} className="text-emerald-500" />
        <h1 className="font-black text-gray-900">Restaurante · Cobro por Mesas</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
            ✓ {stats.freeSpots} libres
          </span>
          <span className="px-2 py-1 rounded bg-red-50 text-red-700 font-bold border border-red-200">
            ● {stats.occupiedSpots} ocupados
          </span>
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
            {stats.open} cuenta{stats.open !== 1 ? 's' : ''} · ₡{Math.round(stats.totalOpen).toLocaleString('es-CR')}
          </span>
        </div>
      </div>

      {/* Body: mapa + panel */}
      <div className="flex-1 flex overflow-hidden">

        {/* Canvas mapa (read-only) */}
        <div className="flex-1 overflow-auto bg-gray-200 p-4">
          {mapItems.length === 0 ? (
            <div className="h-full flex items-center justify-center flex-col gap-2 text-gray-500">
              <GridIcon size={36} className="text-gray-300" />
              <p className="font-bold">Aún no has creado el mapa</p>
              <p className="text-xs">Crea mesas y sillas en el módulo "Mapa de Mesas" antes de cobrar.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg" style={{ width: CANVAS_W, height: CANVAS_H }}>
              <svg
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                width={CANVAS_W} height={CANVAS_H}
                style={{ userSelect: 'none', touchAction: 'none' }}
                onClick={() => { if (!addingSpot) setSelectedSpotId(null); }}
              >
                {/* Halo de color del bill alrededor de spots agrupados */}
                {bills.filter(b => b.status === 'open').map(b => (
                  <g key={b.id}>
                    {b.spots.map(s => {
                      const it = spotsById.get(s.id);
                      if (!it) return null;
                      let w = 80, h = 80;
                      if (it.kind === 'table') {
                        // Aproximación; la mesa se dibuja arriba con su tamaño real.
                        // Halo grande para destacar.
                      }
                      void w; void h;
                      // Caja envolvente aproximada.
                      const padding = 12;
                      const sw = (it.kind === 'freeTable' ? it.width  : it.kind === 'seat' ? 28 : 100) + padding * 2;
                      const sh = (it.kind === 'freeTable' ? it.height : it.kind === 'seat' ? 28 : 100) + padding * 2;
                      return (
                        <rect key={s.id}
                          x={it.x - padding} y={it.y - padding}
                          width={sw} height={sh} rx={16}
                          fill="none"
                          stroke={b.color} strokeOpacity={0.6}
                          strokeWidth={3} strokeDasharray="8 4"
                          pointerEvents="none" />
                      );
                    })}
                  </g>
                ))}

                {/* Items del mapa, ordenados por z */}
                {visualItems
                  .slice()
                  .sort((a, b) => zOrder(a) - zOrder(b))
                  .map(it => (
                    <MapItemShape
                      key={it.id}
                      item={it}
                      selected={it.id === selectedSpotId}
                      editMode={false}
                      onPointerDown={() => {}}
                      onClick={(id) => handleSpotClick(id)}
                    />
                  ))}
              </svg>
            </div>
          )}
        </div>

        {/* Panel derecho */}
        <BillPanel
          bill={activeBill}
          spotsById={spotsById}
          addingSpot={addingSpot}
          taxEnabled={taxCfg.enabled}
          taxRate={taxCfg.rate}
          onStartBill={selectedSpotId && !activeBill && spotsById.get(selectedSpotId) && isCobrable(spotsById.get(selectedSpotId)!) ? handleStartBill : undefined}
          onUpdate={updateBill}
          onAddItem={addItem}
          onOpenCatalog={() => setShowCatalog(true)}
          onSplit={() => setShowSplit(true)}
          onUpdateItemQty={updateItemQty}
          onRemoveItem={removeItem}
          onRemoveSpot={removeSpot}
          onStartAddSpot={() => setAddingSpot(true)}
          onCancelAddSpot={() => setAddingSpot(false)}
          onCharge={charge}
          onCancelBill={cancelBill}
          emptyMessage={
            selectedSpotId
              ? 'Este sitio aún no tiene cuenta abierta'
              : 'Click sobre una mesa o silla en el mapa'
          }
        />
      </div>

      {/* Modal de catálogo (toma de pedido) */}
      {showCatalog && activeBill && tenantId && (
        <OrderCatalogModal
          tenantId={tenantId}
          onClose={() => setShowCatalog(false)}
          onAdd={addCatalogItem}
        />
      )}

      {/* Modal de dividir cuenta */}
      {showSplit && activeBill && (
        <SplitBillModal
          bill={activeBill}
          taxEnabled={taxCfg.enabled}
          taxRate={taxCfg.rate}
          onClose={() => setShowSplit(false)}
          onConfirm={handleSplitConfirm}
        />
      )}

      <div className="bg-white border-t border-gray-200 px-6 py-2 text-[11px] text-gray-500 shrink-0">
        Click sobre cualquier mesa/silla para abrir o ver su cuenta. Las sillas y mesas con cuenta abierta se ven en rojo y comparten un halo de color si están agrupadas.
      </div>

      {/* PIN del mesero antes de abrir la cuenta */}
      {pinForSpot && (
        <MeseroPinModal
          onClose={() => setPinForSpot(null)}
          onOk={(name) => openBillWithWaiter(pinForSpot, name)}
        />
      )}
    </div>
  );
}

// ── Modal: PIN del mesero (identifica al responsable antes de abrir la cuenta) ──
function MeseroPinModal({ onOk, onClose }: { onOk: (name: string) => void; onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (value?: string) => {
    const p = (value ?? pin).trim();
    if (p.length < 3) return;
    setLoading(true); setErr('');
    try {
      const { apiFetch } = await import('@/lib/api');
      const u = await apiFetch<any>('/users/pin-login', { method: 'POST', body: JSON.stringify({ pin: p }) });
      onOk(u?.ticket_alias || u?.full_name || u?.email || 'Mesero');
    } catch {
      setErr('PIN incorrecto'); setPin('');
    } finally { setLoading(false); }
  };

  const press = (d: string) => {
    const next = (pin + d).slice(0, 8);
    setPin(next); setErr('');
    if (next.length >= 4) submit(next);   // intenta al llegar a 4 díg
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black text-gray-900 text-center">PIN del mesero</h3>
        <p className="text-xs text-gray-500 text-center mb-3">Quien digite la cuenta es el responsable</p>
        <div className="flex justify-center gap-2 mb-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-emerald-500' : 'bg-gray-200'}`} />
          ))}
        </div>
        {err && <p className="text-center text-xs font-bold text-red-600 mb-2">{err}</p>}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <button key={d} onClick={() => press(d)} disabled={loading}
              className="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-xl font-black text-gray-800 disabled:opacity-50">{d}</button>
          ))}
          <button onClick={() => { setPin(''); setErr(''); }} className="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-bold text-gray-500">C</button>
          <button onClick={() => press('0')} disabled={loading} className="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-xl font-black text-gray-800 disabled:opacity-50">0</button>
          <button onClick={() => submit()} disabled={loading || pin.length < 3}
            className="py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black disabled:opacity-40">OK</button>
        </div>
        <button onClick={onClose} className="w-full mt-3 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
      </div>
    </div>
  );
}

// Mismo z-order que el editor: zonas/paredes detrás, mesas arriba.
function zOrder(it: MapItem): number {
  switch (it.kind) {
    case 'zone': return 0;
    case 'wall': return 1;
    case 'table':
    case 'freeTable': return 2;
    case 'seat': return 3;
  }
}

export default BillingDashboard;
