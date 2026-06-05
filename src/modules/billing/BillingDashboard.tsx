import { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Grid as GridIcon } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { MapItemShape } from '@/modules/tables/MapShapes';
import { migrateItems } from '@/modules/tables/types';
import type { MapItem } from '@/modules/tables/types';
import { BillPanel } from './BillPanel';
import { billingService, findOpenBillForSpot } from './billingService';
import type { Bill, CobrableKind, SpotRef } from './types';

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

  const [mapItems, setMapItems] = useState<MapItem[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [addingSpot, setAddingSpot] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setMapItems(loadMap(tenantId));
    setBills(billingService.load(tenantId));
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
    if (!activeBill || activeBill.items.length === 0) return;
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, status: 'paid', closed_at: new Date().toISOString() }
      : b));
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

    setSelectedSpotId(id);
  }, [spotsById, addingSpot, activeBill, bills]);

  // ── Stats ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const open = bills.filter(b => b.status === 'open');
    const totalOpen = open.reduce((s, b) => s + b.items.reduce((x, it) => x + it.unit_price * it.quantity, 0), 0);
    const occupiedSpots = new Set(open.flatMap(b => b.spots.map(s => s.id))).size;
    const cobrableSpots = mapItems.filter(isCobrable).length;
    return { open: open.length, totalOpen, occupiedSpots, freeSpots: cobrableSpots - occupiedSpots };
  }, [bills, mapItems]);

  return (
    <div className="h-full flex flex-col bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0 flex-wrap">
        <Receipt size={20} className="text-emerald-500" />
        <h1 className="font-black text-gray-900">Cobro por Mesas</h1>
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
          onStartBill={selectedSpotId && !activeBill && spotsById.get(selectedSpotId) && isCobrable(spotsById.get(selectedSpotId)!) ? handleStartBill : undefined}
          onUpdate={updateBill}
          onAddItem={addItem}
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

      <div className="bg-white border-t border-gray-200 px-6 py-2 text-[11px] text-gray-500 shrink-0">
        Click sobre cualquier mesa/silla para abrir o ver su cuenta. Las sillas y mesas con cuenta abierta se ven en rojo y comparten un halo de color si están agrupadas.
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
