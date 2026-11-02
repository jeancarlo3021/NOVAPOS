import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Grid as GridIcon, ArrowLeft } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { MapItemShape } from '@/modules/tables/MapShapes';
import { migrateItems, tableMeta } from '@/modules/tables/types';
import type { MapItem } from '@/modules/tables/types';
import { BillPanel } from './BillPanel';
import { OrderCatalogModal } from './OrderCatalogModal';
import { SplitBillModal } from './SplitBillModal';
import { billingService, findOpenBillForSpot } from './billingService';
import { printBillTicket } from './printBill';
import type { Bill, BillItem, CobrableKind, SpotRef } from './types';
import { billSubtotal, billService, billItemTotal, itemsSinMandar, proximaRonda, SERVICE_RATE } from './types';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { useLlamadasMesa, numeroDeEtiqueta } from './useLlamadasMesa';
import { BarraLlamadas } from './BarraLlamadas';

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

/** Lo que se le dice al mesero cuando la cuenta no llegó al servidor. */
const SOLO_EN_ESTA_TABLET =
  'OJO: no subió al servidor — quedó solo en esta tablet y se sube sola al volver la conexión.';

/**
 * El tamaño REAL de un elemento del mapa.
 *
 * Antes se daba por hecho 100×100 para toda mesa: el halo de una cuenta y el
 * aviso de ColónTab quedaban cortos en la mesa larga y en la barra, que miden
 * 200×80 y 240×36.
 */
function medidaDe(it: MapItem): { w: number; h: number } {
  if (it.kind === 'freeTable') return { w: it.width, h: it.height };
  if (it.kind === 'seat') return { w: 28, h: 28 };
  if (it.kind === 'table') { const m = tableMeta(it.type); return { w: m.width, h: m.height }; }
  // Las ZONAS y las PAREDES también miden: con la medida por omisión, el
  // recorte del plano las dejaba fuera y el salón salía cortado por abajo.
  if (it.kind === 'zone') return { w: it.width, h: it.height };
  if (it.kind === 'wall') return { w: it.length, h: it.thickness };
  return { w: 100, h: 100 };
}

const COBRABLE: CobrableKind[] = ['table', 'freeTable', 'seat'];
function isCobrable(it: MapItem): boolean {
  return (COBRABLE as string[]).includes(it.kind);
}

export function BillingDashboard() {
  const { tenantId } = useTenantId();
  const { user, planFeatures } = useAuth();
  const navigate = useNavigate();

  const [mapItems, setMapItems] = useState<MapItem[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [pinForSpot, setPinForSpot] = useState<string | null>(null);   // mesa esperando PIN del mesero
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [addingSpot, setAddingSpot] = useState(false);
  /** Mostrando la lista de mesas libres para mudar la cuenta. */
  const [mudando, setMudando] = useState(false);
  /** Pidiendo el PIN del mesero que se hace cargo de la cuenta. */
  const [cambiandoMesero, setCambiandoMesero] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  /** Qué se está haciendo contra el servidor, para bloquear el doble toque. */
  const [guardando, setGuardando] = useState<null | 'mandando' | 'cobrando' | 'dividiendo'>(null);
  const [aviso, setAviso] = useState('');

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
    // Primer pintado con el caché (instantáneo), y enseguida la BASE.
    setBills(billingService.load(tenantId));
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
      // Cuentas desde la BASE: es lo que ven todos los dispositivos.
      try {
        const fresh = await billingService.fetch(tenantId);
        if (!cancelled) setBills(fresh);
      } catch { /* offline: sigue con el caché */ }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Refresco periódico: varios meseros trabajan sobre las mismas mesas y una
  // cuenta abierta en otra tablet tiene que aparecer acá sin recargar.
  useEffect(() => {
    if (!tenantId) return;
    const iv = setInterval(async () => {
      // No pisamos lo que el usuario está editando en este momento.
      if (selectedSpotId) return;
      try { setBills(await billingService.fetch(tenantId)); } catch { /* ignore */ }
    }, 20_000);
    return () => clearInterval(iv);
  }, [tenantId, selectedSpotId]);

  // Persistencia automática de bills (caché al instante + subida a la base).
  useEffect(() => {
    if (!tenantId) return;
    void billingService.save(tenantId, bills);
  }, [tenantId, bills]);

  /**
   * Los avisos de ColónTab (la mesa digital) acá mismo.
   *
   * El cliente pide la cuenta desde el QR de su mesa y ese aviso aparecía solo
   * en otra pantalla, que nadie tiene abierta mientras atiende. Acá sale sobre
   * el mapa, suena, y se cierra de un toque.
   */
  const mesaDigitalOn = !!(planFeatures as any)?.mesa_digital;
  const { llamadas, porSpot, atender } = useLlamadasMesa(tenantId ?? undefined, mesaDigitalOn, mapItems);

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

/** Firma de una línea: dos líneas se pueden juntar solo si coinciden en todo. */
  const firmaDe = (it: Partial<BillItem>) => JSON.stringify([
    it.product_id ?? it.name,
    (it.modifiers ?? []).map(m => `${m.group}|${m.name}|${m.price_delta}`).sort(),
    (it.notes ?? '').trim(),
  ]);

  /**
   * Agregar del catálogo: si el plato YA está en la cuenta, sube la cantidad.
   *
   * Tocar tres veces «Casado con pollo» dejaba tres renglones de 1 en vez de uno
   * de 3: la cuenta se vuelve ilegible y la comanda sale con tres líneas
   * sueltas que cocina tiene que sumar de cabeza.
   *
   * Solo se juntan las líneas que todavía NO se mandaron y que coinciden en
   * adicionales y nota: una línea ya mandada pertenece a su ronda y tocarla
   * cambiaría lo que cocina ya tiene en la mano.
   */
  const addCatalogItem = (item: Omit<BillItem, 'id'>) => {
    if (!activeBill) return;
    const firma = firmaDe(item);
    setBills(prev => prev.map(b => {
      if (b.id !== activeBill.id) return b;
      const i = b.items.findIndex(it => !Number(it.ronda) && firmaDe(it) === firma);
      if (i >= 0) {
        const items = b.items.slice();
        items[i] = { ...items[i], quantity: items[i].quantity + item.quantity };
        return { ...b, items };
      }
      return { ...b, items: [...b.items, { ...item, id: uidItem() }] };
    }));
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

  /**
   * COBRAR: la cuenta pasa al POS y ahí se factura.
   *
   * Antes esto imprimía un ticket y marcaba la cuenta como pagada, y nada más:
   * NO se creaba la factura. Esa plata no entraba a los reportes, no descontaba
   * inventario, no entraba a la caja y no se podía anular ni reimprimir. Un
   * restaurante podía cerrar el día habiendo cobrado y no tener registro de
   * nada.
   *
   * El POS ya sabe cobrar —medios de pago, vuelto, IVA, factura electrónica,
   * impresión— y sabe cerrar la cuenta de la mesa ligada a la factura. Lo que
   * faltaba era pasársela.
   */
  const charge = async () => {
    if (!activeBill || activeBill.items.length === 0 || !tenantId) return;
    const sub = billSubtotal(activeBill);
    const servicio = billService(sub, activeBill.is_delivery);

    // Primero se GUARDA: el POS cierra la cuenta por su id, así que tiene que
    // existir en la base con sus líneas antes de salir de esta pantalla.
    setGuardando('cobrando');
    const subio = await billingService.guardar(tenantId, activeBill);
    if (!subio && !confirm(
      'La cuenta no se pudo subir al servidor (parece que no hay conexión).\n\n'
      + 'Se puede cobrar igual: el punto de venta guarda la venta y la sube al '
      + 'reconectar. Pero la mesa puede quedar marcada como ocupada hasta '
      + 'entonces.\n\n¿Cobrar de todos modos?')) {
      setGuardando(null);
      return;
    }

    const lineas: Array<Record<string, unknown>> = activeBill.items.map(it => ({
      product_id: it.product_id ?? null,
      product_name: it.name,
      quantity: it.quantity,
      // El precio que viaja YA trae los adicionales: el POS cobra por línea y
      // no sabe de modificadores.
      unit_price: billItemTotal(it) / (it.quantity || 1),
      subtotal: billItemTotal(it),
      notes: [it.notes, (it.modifiers ?? []).map(m => m.name).join(', ')]
        .filter(Boolean).join(' · ') || null,
    }));

    /**
     * El 10% viaja como UNA LÍNEA MÁS, con IVA 0.
     *
     * Tiene que ir en la factura —el cliente lo paga y la ley pide que se vea
     * desglosado— y el POS no tiene un concepto de «servicio». Va con IVA 0
     * para que el total que se cobra sea EXACTAMENTE el que esta pantalla
     * mostró; si el contador define que el servicio lleva IVA, se cambia acá
     * (`iva_rate: 13`) y en `BillPanel`, en los dos lados a la vez.
     */
    if (servicio > 0) {
      lineas.push({
        product_id: null, is_adhoc: true, iva_rate: 0,
        product_name: `Servicio ${Math.round(SERVICE_RATE * 100)}%`,
        quantity: 1, unit_price: servicio, subtotal: servicio, notes: null,
      });
    }

    try {
      sessionStorage.setItem('novapos_pending_table_order', JSON.stringify({
        order_id: activeBill.id,
        table_id: activeBill.spots[0]?.id,
        table_label: activeSpotLabel || 'Mesa',
        customer_name: activeBill.customer_name ?? null,
        items: lineas,
      }));
    } catch {
      setGuardando(null);
      alert('El navegador no dejó pasar la cuenta al POS. Cobrala desde el POS a mano.');
      return;
    }
    setGuardando(null);
    navigate('/pos');
  };

  /**
   * GUARDAR Y MANDAR: deja la cuenta en la base y manda a cocina lo NUEVO.
   *
   * Son una sola acción porque en el salón son un solo gesto: el mesero termina
   * de digitar la ronda y la suelta. Separarlas dejaba la puerta abierta a
   * mandar a cocina algo que todavía no estaba guardado —y que se perdía si la
   * tablet se quedaba sin batería— o a guardar sin que cocina se enterara.
   *
   * Se manda SOLO lo que no tiene ronda. Antes se reimprimía el pedido entero
   * en cada toque y cocina volvía a preparar lo ya servido.
   */
  const guardarYMandar = async () => {
    if (!activeBill || activeBill.items.length === 0 || !tenantId) return;
    const nuevas = itemsSinMandar(activeBill);
    const ronda = proximaRonda(activeBill);
    setGuardando('mandando');

    // Sin nada nuevo que mandar, el botón sigue sirviendo para GUARDAR: es lo
    // que el mesero toca cuando corrigió una cantidad o el nombre del cliente.
    if (nuevas.length === 0) {
      const subio = await billingService.guardar(tenantId, activeBill);
      setAviso(subio ? 'Cuenta guardada' : SOLO_EN_ESTA_TABLET);
      setGuardando(null);
      setTimeout(() => setAviso(''), subio ? 3000 : 8000);
      return;
    }

    /**
     * 1) GUARDAR — y si no se pudo subir, se manda a cocina IGUAL.
     *
     * Trabar la comanda porque el servidor no responde sería peor que el
     * problema: la comida no se cocina y el salón se para. La cuenta queda en
     * esta tablet (y se sube sola cuando vuelva la conexión), pero eso HAY QUE
     * DECIRLO, porque mientras tanto la caja no la ve.
     */
    const subio = await billingService.guardar(tenantId, activeBill);

    // 2) MANDAR a cocina.
    try {
      const { posPrinterService } = await import('@/services/pos/posPrinterService');
      // Mesero que digitó (o responsable) — para que cocina sepa de quién es.
      const mesero = activeBill.waiter_name || activeBill.responsible_name;
      /**
       * La ESTACIÓN de cada plato, resuelta contra el menú de recetas.
       *
       * Es lo que manda el plato a la impresora correcta: la categoría es de
       * venta (Bebidas, Postres) y la estación es de producción (Barra,
       * Parrilla). Se vuelve a resolver acá y no se confía solo en lo que trae
       * la línea porque la cuenta se guarda en la base SIN la estación: una
       * cuenta abierta ayer, o abierta en otra tablet, llega sin ella y el
       * plato se iría a la impresora equivocada —o a ninguna—.
       */
      const estaciones = new Map<string, string>();
      try {
        const { apiFetch } = await import('@/lib/api');
        const menu = await apiFetch<any[]>('/recipes/menu');
        for (const m of menu ?? []) if (m?.id && m?.station) estaciones.set(String(m.id), String(m.station));
      } catch { /* sin menú de recetas se rutea por categoría, como antes */ }
      await posPrinterService.printComandas(
        activeBill.id.slice(-4),
        nuevas.map(it => ({
          name: it.name,
          quantity: it.quantity,
          // La nota va en su propio campo, no pegada al nombre: así sale en la
          // línea de abajo y no se pierde al recortar un nombre largo.
          notes: [it.notes, (it.modifiers ?? []).map((m: any) => m.name).join(', ')]
            .filter(Boolean).join(' · ') || undefined,
          category_id: it.category_id,   // para rutear a la impresora de su estación
          station: it.station ?? (it.product_id ? estaciones.get(it.product_id) : undefined),
        })),
        tenantId,
        activeBill.customer_name ?? undefined,
        {
          // En el salón lo que cocina busca es la MESA, no el consecutivo.
          tableInfo: activeSpotLabel || activeBill.id.slice(-4),
          // Una cuenta marcada para llevar se empaca, aunque venga del salón.
          serviceMode: activeBill.is_delivery ? 'llevar' : 'mesa',
          // Quién la tomó y qué tanda es: cocina reclama por las dos cosas.
          waiter: mesero,
          round: ronda,
        },
      );
    } catch (e) {
      /**
       * Si la comanda no salió, HAY QUE DECIRLO.
       *
       * El botón se tocaba, no pasaba nada visible y el mesero daba por hecho que
       * cocina ya tenía el pedido. La mesa esperaba comida que nadie estaba
       * preparando. No hay panel de mensajes en esta pantalla, así que se avisa
       * con un aviso del navegador: feo, pero imposible de no ver.
       */
      console.warn('[billing] error comandas:', e);
      setGuardando(null);
      alert(`La cuenta SÍ quedó guardada, pero la comanda NO salió: `
        + `${e instanceof Error ? e.message : 'error'}\n\n`
        + 'Avisá a cocina a mano y revisá Configuración → Comandas. '
        + 'Las líneas quedan pendientes: cuando se arregle, el botón las vuelve a mandar.');
      return;
    }

    // 3) Quedaron mandadas: se les pone la ronda y se vuelve a guardar, para que
    //    la otra tablet tampoco las vuelva a mandar.
    const ids = new Set(nuevas.map(it => it.id));
    setBills(prev => prev.map(b => b.id === activeBill.id
      ? { ...b, items: b.items.map(it => ids.has(it.id) ? { ...it, ronda } : it) }
      : b));
    setGuardando(null);
    setAviso(subio
      ? `Ronda ${ronda} mandada a cocina · ${nuevas.length} línea(s)`
      : `Ronda ${ronda} mandada a cocina. ${SOLO_EN_ESTA_TABLET}`);
    setTimeout(() => setAviso(''), subio ? 4000 : 9000);
  };

  // Dividir cuenta → genera N facturas (una por parte) y cierra la original.
  /**
   * DIVIDIR: también guarda antes de imprimir.
   *
   * Es el mismo cuidado que el resto: lo que se imprime y se da por cobrado
   * tiene que existir en la base. Si el guardado falla, no se imprime nada y la
   * cuenta queda como estaba, entera.
   */
  const handleSplitConfirm = async (parts: BillItem[][]) => {
    if (!activeBill || !tenantId) return;
    const now = new Date().toISOString();
    setGuardando('dividiendo');
    const subio = await billingService.guardar(tenantId, activeBill);
    if (!subio && !confirm(
      'La cuenta no se pudo subir al servidor (parece que no hay conexión).\n\n'
      + '¿Imprimir las partes de todos modos?')) {
      setGuardando(null);
      return;
    }
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
    setGuardando(null);
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

  /**
   * MUDAR LA CUENTA a otra mesa.
   *
   * Pasa todo el tiempo: la pareja de la 2 se cambia a la terraza, o el grupo
   * de cuatro necesita la mesa larga. Antes había que anular y volver a
   * digitar —con la comanda ya mandada colgando— o irse a la otra pantalla,
   * que sí lo sabía hacer.
   *
   * Se elige de una LISTA y no tocando el mapa: la mudanza se pide desde la
   * pantalla de la cuenta, donde no hay mapa a la vista, y mandar al mesero a
   * buscarla en el plano para después volver es el camino largo.
   */
  const mudarA = useCallback((destinoId: string) => {
    if (!activeBill) return;
    const item = spotsById.get(destinoId);
    if (!item || !isCobrable(item)) return;
    if (findOpenBillForSpot(destinoId, bills)) {
      alert('Esa mesa ya tiene una cuenta abierta. Cobrala o cerrala primero.');
      return;
    }
    const destino: SpotRef = { id: item.id, kind: item.kind as CobrableKind };
    setBills(prev => prev.map(b => b.id === activeBill.id ? { ...b, spots: [destino] } : b));
    setMudando(false);
    setSelectedSpotId(destinoId);
    setAviso(`Cuenta mudada a ${(item as any).label ?? 'la otra mesa'}`);
    setTimeout(() => setAviso(''), 4000);
  }, [activeBill, spotsById, bills]);

  /**
   * El recorte del plano: la caja que envuelve TODO lo dibujado.
   *
   * El lienzo son 1600×1000 fijos, pero un salón de ocho mesas ocupa un rincón.
   * Dibujar el papel entero deja media pantalla en blanco y las mesas del
   * tamaño de un botón. Recortando a lo que hay, el salón llena el espacio
   * disponible y las mesas se tocan sin apuntar.
   */
  const recorte = useMemo(() => {
    const margen = 40;
    const cajas = mapItems.map(it => {
      const m = medidaDe(it);
      return { x1: it.x, y1: it.y, x2: it.x + m.w, y2: it.y + m.h };
    });
    if (cajas.length === 0) return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
    const x1 = Math.max(0, Math.min(...cajas.map(c => c.x1)) - margen);
    const y1 = Math.max(0, Math.min(...cajas.map(c => c.y1)) - margen);
    const x2 = Math.min(CANVAS_W, Math.max(...cajas.map(c => c.x2)) + margen);
    const y2 = Math.min(CANVAS_H, Math.max(...cajas.map(c => c.y2)) + margen);
    /* Un mínimo para que dos mesas sueltas no se vean gigantes. */
    const w = Math.max(600, x2 - x1);
    const h = Math.max(380, y2 - y1);
    return { x: x1, y: y1, w, h };
  }, [mapItems]);

  /** Las mesas a las que se puede mudar: cobrables y sin cuenta abierta. */
  const mesasLibres = useMemo(() => mapItems
    .filter(it => isCobrable(it) && !findOpenBillForSpot(it.id, bills))
    .map(it => ({ id: it.id, label: (it as any).label ?? 'Mesa' })), [mapItems, bills]);

  /**
   * Entrar a la mesa que llamó, desde la barra de avisos.
   *
   * Hace lo mismo que tocarla en el mapa —si está libre pide el PIN y abre la
   * cuenta; si ya tiene, entra—: el mesero toca el aviso para ir a atender, no
   * para quedarse mirando el mapa.
   */
  const irAMesa = useCallback((numero: number) => {
    const it = mapItems.find(m => isCobrable(m) && numeroDeEtiqueta((m as any).label) === numero);
    if (it) handleSpotClick(it.id);
  }, [mapItems, handleSpotClick]);

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
    /**
     * Lo que hay en el salón, con el 10% y los adicionales incluidos.
     *
     * Antes multiplicaba precio × cantidad y nada más: no contaba los
     * adicionales ni el servicio, así que el número del encabezado era SIEMPRE
     * menor que la suma de lo que los clientes van a pagar.
     */
    const totalOpen = open.reduce((s, b) => {
      const sub = billSubtotal(b);
      return s + sub + billService(sub, b.is_delivery);
    }, 0);
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

  /**
   * El teclado del PIN para pasar la cuenta a otro mesero.
   *
   * Se arma una sola vez y se usa en las DOS vistas —el mapa y la pantalla
   * completa—, porque el cambio de turno pasa con la cuenta abierta, que es
   * justo cuando el mesero está en la pantalla completa. Dejarlo solo en el
   * mapa era dejarlo donde no se necesita.
   */
  const modalCambioMesero = cambiandoMesero && activeBill ? (
    <MeseroPinModal
      titulo="¿Quién se hace cargo?"
      subtitulo="La cuenta pasa a su nombre"
      onClose={() => setCambiandoMesero(false)}
      onOk={(name) => {
        updateBill({ waiter_name: name });
        setCambiandoMesero(false);
        setAviso(`La cuenta queda a cargo de ${name}`);
        setTimeout(() => setAviso(''), 4000);
      }}
    />
  ) : null;

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

        {/* Los avisos de las otras mesas siguen a la vista mientras se digita:
            el mesero está acá adentro, no en el mapa. */}
        <BarraLlamadas compacta llamadas={llamadas} onAtender={atender} onIr={irAMesa} />

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
            onSendKitchen={guardarYMandar}
            mudando={mudando}
            destinos={mesasLibres}
            onMudar={() => setMudando(true)}
            onMudarA={mudarA}
            onCancelarMudanza={() => setMudando(false)}
            onCambiarMesero={() => setCambiandoMesero(true)}
            guardando={guardando}
            pendientes={itemsSinMandar(activeBill).length}
            aviso={aviso}
            onUpdateItemQty={updateItemQty}
            onRemoveItem={removeItem}
            onRemoveSpot={removeSpot}
            onStartAddSpot={() => { /* unir spots se hace desde el mapa */ }}
            onCancelAddSpot={() => setAddingSpot(false)}
            onCharge={charge}
            onCancelBill={cancelBill}
          />
        </div>

        {modalCambioMesero}

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

      <BarraLlamadas llamadas={llamadas} onAtender={atender} onIr={irAMesa} />

      {/* Body: mapa + panel.
          Apilados hasta `lg`: en una tablet en vertical el panel se comía la
          mitad del ancho para decir «tocá una mesa», y al mapa le quedaba
          menos espacio que al cartel. */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Canvas mapa (read-only) */}
        {/* EL SALÓN ENTERO, SIEMPRE A LA VISTA.
            El lienzo medía 1600 px fijos: en una tablet en vertical se veía un
            tercio del local y había que arrastrar el plano para encontrar una
            mesa, que es lo contrario de para qué sirve un mapa. Con la caja
            proporcional y el SVG al 100 %, el salón se achica hasta caber; en
            pantalla grande no pasa de su tamaño real. */}
        <div className="flex-1 overflow-auto bg-gray-200 p-4 flex items-center justify-center">
          {mapItems.length === 0 ? (
            <div className="h-full flex items-center justify-center flex-col gap-2 text-gray-500">
              <GridIcon size={36} className="text-gray-300" />
              <p className="font-bold">Aún no has creado el mapa</p>
              <p className="text-xs">Armá las mesas en «Diseño del salón» y volvé acá a cobrar.</p>
              <button onClick={() => navigate('/tables')}
                className="mt-3 px-4 h-10 rounded-xl bg-gray-900 text-white text-sm font-black">
                Ir a diseñar el salón
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg w-full mx-auto"
              style={{ maxWidth: recorte.w, aspectRatio: `${recorte.w} / ${recorte.h}` }}>
              <svg
                viewBox={`${recorte.x} ${recorte.y} ${recorte.w} ${recorte.h}`}
                width="100%" height="100%"
                preserveAspectRatio="xMidYMid meet"
                style={{ userSelect: 'none', touchAction: 'none' }}
                onClick={() => { if (!addingSpot) setSelectedSpotId(null); }}
              >
                {/* Halo de color del bill alrededor de spots agrupados */}
                {bills.filter(b => b.status === 'open').map(b => (
                  <g key={b.id}>
                    {b.spots.map(s => {
                      const it = spotsById.get(s.id);
                      if (!it) return null;
                      const padding = 12;
                      const m = medidaDe(it);
                      const sw = m.w + padding * 2;
                      const sh = m.h + padding * 2;
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

                {/* La mesa que llamó: un anillo que late.
                    Que el aviso esté en una lista no alcanza — el mesero mira
                    el salón, y lo que necesita es saber CUÁL mesa, de un
                    vistazo y desde lejos. */}
                {[...porSpot.entries()].map(([spotId, l]) => {
                  const it = spotsById.get(spotId);
                  if (!it) return null;
                  const pad = 14;
                  const med = medidaDe(it);
                  const w = med.w + pad * 2;
                  const h = med.h + pad * 2;
                  const color = l.tipo === 'cuenta' ? '#f59e0b' : l.tipo === 'ordenar' ? '#10b981' : '#2563eb';
                  const emoji = l.tipo === 'cuenta' ? '🧾' : l.tipo === 'ordenar' ? '🙋' : '🛎️';
                  return (
                    <g key={`llamada_${spotId}`} pointerEvents="none">
                      {/* Doble anillo: el blanco de abajo lo despega del verde de
                          la mesa y del color de la zona, que si no se confunden. */}
                      <rect x={it.x - pad} y={it.y - pad} width={w} height={h} rx={18}
                        fill="none" stroke="#fff" strokeWidth={9} opacity={0.95} />
                      <rect x={it.x - pad} y={it.y - pad} width={w} height={h} rx={18}
                        fill="none" stroke={color} strokeWidth={6}>
                        <animate attributeName="opacity" values="1;0.45;1" dur="1.1s" repeatCount="indefinite" />
                      </rect>
                      <circle cx={it.x + med.w} cy={it.y - pad + 2} r={16} fill={color} stroke="#fff" strokeWidth={3} />
                      <text x={it.x + med.w} y={it.y - pad + 8} textAnchor="middle" fontSize={16}>{emoji}</text>
                    </g>
                  );
                })}

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
          onSendKitchen={activeBill ? guardarYMandar : undefined}
          apilado
          mudando={mudando}
          destinos={mesasLibres}
          onMudar={() => setMudando(true)}
          onMudarA={mudarA}
          onCancelarMudanza={() => setMudando(false)}
          onCambiarMesero={() => setCambiandoMesero(true)}
          abiertas={bills.filter(b => b.status === 'open')}
          onPickBill={b => setSelectedSpotId(b.spots[0]?.id ?? null)}
          guardando={guardando}
          pendientes={activeBill ? itemsSinMandar(activeBill).length : 0}
          aviso={aviso}
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

      {modalCambioMesero}

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
function MeseroPinModal({ onOk, onClose, titulo, subtitulo }: {
  onOk: (name: string) => void; onClose: () => void;
  titulo?: string; subtitulo?: string;
}) {
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
        <h3 className="text-base font-black text-gray-900 text-center">{titulo ?? 'PIN del mesero'}</h3>
        <p className="text-xs text-gray-500 text-center mb-3">
          {subtitulo ?? 'Quien digite la cuenta es el responsable'}
        </p>
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
