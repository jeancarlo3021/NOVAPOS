import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Trash2, Plus, Minus, AlertCircle, CheckCircle2, User, Home, Search, X, Receipt, CalendarDays, FileText, MapPin, Boxes, Pencil } from 'lucide-react';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';
import { usePOSLayout } from '@/hooks/usePOSLayout';
import { useFeReady, type DocumentType } from '@/hooks/POS/useFeReady';
import { POSCustomerSearch } from '@/modules/pos/POSCustomerSearch';
import { PosShortcutsHint } from '@/modules/pos/PosShortcutsHint';
import type { Customer } from '@/services/customers/customersService';
import { POSProductsPanel } from '@/modules/pos/POSProducts';
import { ProductForm } from '@/modules/inventory/products/ProductsForm';
import type { Product, CashSession } from '@/types/Types_POS';
import { proformasService, type Proforma } from '@/services/proformas/proformasService';
import { customersService } from '@/services/customers/customersService';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useSettings } from '@/hooks/useSettings';
import { productKitsService, type ProductKit } from '@/services/Inventory/productKitsService';
import {
  salesAgentsService, agentOrdersService,
  type SalesAgent, type AgentOrderItem,
} from '@/services/agents/salesAgentsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
/** Hoy en Costa Rica. El día del negocio no es el UTC del navegador. */
const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

/**
 * Nuevo pedido del AGENTE, con el mismo POS de venta.
 *
 * Reusa el panel de productos del punto de venta (catálogo, categorías, búsqueda,
 * pistola, extras/modificadores), así el agente trabaja igual que un cajero. La
 * diferencia es el final: en vez de cobrar, el pedido se ENVÍA a caja.
 *
 * No necesita sesión de caja: el agente no maneja dinero. Se le pasa al panel una
 * sesión sintética abierta para que no bloquee el agregado de productos.
 */
export const AgentOrderPOS: React.FC = () => {
  const navigate = useNavigate();
  const {
    products, filteredProducts, searchTerm, setSearchTerm,
    loading: productsLoading, error: productsError,
    refetch: refetchProducts,
  } = usePOSProducts();

  const [cart, setCart] = useState<AgentOrderItem[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [agentId, setAgentId] = useState('');
  /** Agente del usuario logueado: se muestra su nombre, sin lista que elegir. */
  const [myAgent, setMyAgent] = useState<{ id: string; name: string } | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  // Mismo criterio que el POS para saber si se puede emitir electrónico.
  const { feReady, defaultDocType } = useFeReady();
  const [docType, setDocType] = useState<DocumentType>('ticket');
  // El default configurado del negocio, una vez que se sabe si la FE está lista.
  useEffect(() => { setDocType(defaultDocType); }, [defaultDocType]);
  // Si la FE deja de estar disponible, no se puede quedar en electrónico.
  useEffect(() => { if (!feReady && docType !== 'ticket') setDocType('ticket'); }, [feReady, docType]);
  const [notes, setNotes] = useState('');
  // Agenda: el día en que el cliente espera el pedido. Por defecto hoy, para que
  // el flujo de mostrador no cambie; el agente de ruta lo mueve a su día.
  const [schedDate, setSchedDate] = useState<string>(crToday());
  const [schedNote, setSchedNote] = useState('');
  // Lugar de entrega. Se autocompleta de la ficha del cliente, pero se puede
  // corregir: "la casa de la esquina" no está en ninguna ficha.
  const [place, setPlace] = useState('');
  const [zone, setZone] = useState('');
  // Proforma de origen. Si el pedido nace de una cotización, se cierra al cobrar.
  const [proforma, setProforma] = useState<Proforma | null>(null);
  const [showProformas, setShowProformas] = useState(false);
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [loadingProformas, setLoadingProformas] = useState(false);
  // Kits: se ofrecen como una fila de "categorías" arriba del buscador. Tocar
  // uno mete de golpe todo lo que lleva dentro, que es como el agente los canta
  // ("mandame el combo"), y después puede quitar lo que el cliente no quiera.
  const [kits, setKits] = useState<ProductKit[]>([]);
  useEffect(() => {
    productKitsService.list().then(setKits).catch(() => setKits([]));
  }, []);

  /**
   * Producto que el agente está corrigiendo.
   *
   * En la calle el agente es quien descubre que un precio está mal o que falta
   * un código: antes tenía que anotarlo y pedirle a alguien en la oficina que lo
   * arreglara, y mientras tanto seguía vendiendo con el dato viejo.
   */
  const [editProductId, setEditProductId] = useState<string | null>(null);
  // El permiso manda: si el negocio no se lo concedió al rol, el botón no está.
  const { canDo, isOwnerOrAdmin } = useRolePermissions();
  const canEditProducts = isOwnerOrAdmin || canDo('inventory', 'edit');
  // Crear también: el agente en la calle se topa con productos que el catálogo
  // no tiene todavía, y anotarlos en papel para cargarlos después es como se
  // pierden las ventas.
  const canCreateProducts = isOwnerOrAdmin || canDo('inventory', 'create');
  const [creatingProduct, setCreatingProduct] = useState(false);

  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    customersService.listZones()
      .then(zs => setZones(zs.map((z: any) => z.name).filter(Boolean)))
      .catch(() => setZones([]));
  }, []);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    // 1) Si el usuario logueado ES un agente, el pedido sale a su nombre directo.
    agentOrdersService.me()
      .then(me => {
        if (me) { setMyAgent(me); setAgentId(me.id); return; }
        // 2) Si no (dueño/gerente armando el pedido), se ofrece la lista.
        return salesAgentsService.list().then(a => {
          const activos = a.filter(x => x.is_active);
          setAgents(activos);
          if (activos.length === 1) setAgentId(activos[0].id);
        });
      })
      .catch(() => {});
  }, []);

  // El pedido se arma en formato LISTA (captura por código/nombre + Enter), que es
  // más rápido para un agente que va anotando lo que le piden.
  const { layout, setLayout } = usePOSLayout();
  useEffect(() => { if (layout !== 'list') setLayout('list'); }, [layout, setLayout]);

  // El panel de productos exige una sesión ABIERTA para dejar agregar. El agente
  // no abre caja, así que se le pasa una sintética.
  const fakeSession = useMemo(() => ({
    id: 'agent', status: 'open', tenant_id: '', cash_register_id: '',
    opening_date: new Date().toISOString(),
  } as unknown as CashSession), []);

  const addToCart = (product: Product, quantity = 1, mods?: Array<{ name: string; price_delta: number }>) => {
    const extra = (mods ?? []).reduce((s, m) => s + Number(m.price_delta || 0), 0);
    const unit = round2(Number(product.unit_price ?? 0) + extra);
    setCart(prev => {
      // Con extras cada línea es única (precio y preparación distintos).
      if (mods && mods.length > 0) {
        return [...prev, {
          product_id: product.id, product_name: product.name, quantity,
          unit_price: unit, subtotal: round2(unit * quantity),
          notes: mods.map(m => m.name).join(', '),
        }];
      }
      const i = prev.findIndex(x => x.product_id === product.id && !x.notes);
      if (i >= 0) {
        const next = [...prev];
        const qty = next[i].quantity + quantity;
        next[i] = { ...next[i], quantity: qty, subtotal: round2(qty * next[i].unit_price) };
        return next;
      }
      return [...prev, {
        product_id: product.id, product_name: product.name, quantity,
        unit_price: unit, subtotal: round2(unit * quantity),
      }];
    });
  };

  /** Mete al pedido todos los productos que lleva el kit. */
  const addKit = (kit: ProductKit) => {
    let faltantes = 0;
    for (const it of kit.items) {
      const p = products.find(x => String(x.id) === String(it.component_id));
      if (p) { addToCart(p as Product, it.quantity); continue; }
      // El componente puede no estar en el catálogo cargado (filtro, borrado):
      // se agrega igual con el precio que trae el kit, así el pedido no queda
      // incompleto sin que nadie se entere.
      faltantes++;
      setCart(prev => {
        const unit = round2(Number(it.price ?? 0));
        const i = prev.findIndex(x => x.product_id === it.component_id);
        if (i >= 0) {
          const next = [...prev];
          const qty = next[i].quantity + it.quantity;
          next[i] = { ...next[i], quantity: qty, subtotal: round2(qty * next[i].unit_price) };
          return next;
        }
        return [...prev, {
          product_id: it.component_id, product_name: it.name ?? 'Producto',
          quantity: it.quantity, unit_price: unit, subtotal: round2(unit * it.quantity),
        }];
      });
    }
    setMsg({
      kind: 'ok',
      text: `${kit.name}: ${kit.items.length} producto(s) agregados${faltantes ? ` (${faltantes} sin ficha en el catálogo)` : ''}`,
    });
  };

  /**
   * Precio editable por el agente, si el negocio lo permitió en Configuración.
   *
   * Donde el precio se negocia en la puerta (mayoreo, materiales), mandar el
   * pedido con el precio de lista obligaba a corregirlo en caja y el cliente
   * escuchaba un monto y pagaba otro.
   */
  const { settings: generalSettings } = useSettings('general');
  const puedeEditarPrecio = generalSettings?.agentPriceEdit === true;

  const setPrice = (i: number, price: number) => {
    const p = Math.max(0, round2(price));
    setCart(prev => prev.map((x, j) => j === i
      ? { ...x, unit_price: p, subtotal: round2(x.quantity * p) } : x));
  };

  const setQty = (i: number, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter((_, j) => j !== i)); return; }
    setCart(prev => prev.map((x, j) => j === i
      ? { ...x, quantity: qty, subtotal: round2(qty * x.unit_price) } : x));
  };

  const total = cart.reduce((s, x) => s + x.subtotal, 0);

  // Líneas que piden más de lo que hay. No bloquean el envío (puede haber stock
  // sin registrar), pero el agente tiene que saberlo antes de prometerlo.
  const sinStock = cart.filter(it => {
    const p: any = products.find(x => x.id === it.product_id);
    if (!p || p.tracks_stock === false) return false;
    return Number(p.stock_quantity ?? 0) - Number(it.quantity ?? 0) < 0;
  });

  // ── Atajos, los MISMOS del POS ────────────────────────────────────────────
  // F2 (buscador) y Enter (agregar) los maneja el panel de productos que ya se
  // reusa. Acá van los del carrito: ↑↓ para elegir línea, Supr para borrarla y
  // F12 para enviar (el equivalente a "cobrar" del POS).
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (selected != null && selected >= cart.length) setSelected(cart.length ? cart.length - 1 : null);
  }, [cart.length, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F12') { e.preventDefault(); void send(); return; }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (cart.length === 0) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(i => {
          if (i == null) return e.key === 'ArrowDown' ? 0 : cart.length - 1;
          return Math.max(0, Math.min(cart.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        });
      } else if (e.key === 'Delete' && selected != null) {
        e.preventDefault();
        setQty(selected, 0);
      } else if (e.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const openProformas = () => {
    setShowProformas(true);
    setLoadingProformas(true);
    proformasService.list('open')
      .then(setProformas)
      .catch(() => setProformas([]))
      .finally(() => setLoadingProformas(false));
  };

  /** Pasa una cotización al pedido: líneas, cliente y nota de origen. */
  const loadProforma = (p: Proforma) => {
    setCart(p.items.map(it => ({
      product_id: it.product_id ?? null,
      product_name: it.name,
      quantity: Number(it.quantity || 0),
      unit_price: round2(Number(it.unit_price || 0)),
      subtotal: round2(Number(it.quantity || 0) * Number(it.unit_price || 0)),
    })));
    setProforma(p);
    if (p.customer_id) {
      setCustomer({
        id: p.customer_id, name: p.customer_name ?? 'Cliente',
        identification: p.customer_identification ?? null,
      } as Customer);
      // La ficha tiene la zona y la dirección; la proforma no las guarda.
      void customersService.get?.(p.customer_id)
        ?.then((c: any) => { setZone(z => z || (c?.zone ?? '')); setPlace(pl => pl || (c?.address ?? '')); })
        ?.catch(() => {});
    }
    // La validez de la cotización es la fecha que el cliente tiene en la cabeza.
    if (p.valid_until) setSchedDate(String(p.valid_until).slice(0, 10));
    setShowProformas(false);
    setMsg({ kind: 'ok', text: `Proforma ${p.number ?? ''} cargada al pedido` });
  };

  const send = async () => {
    if (cart.length === 0) { setMsg({ kind: 'err', text: 'El pedido no tiene productos.' }); return; }
    // Una factura electrónica necesita receptor identificado: si el agente no lo
    // elige, el cajero se traba al cobrar y hay que llamar al cliente de nuevo.
    if (docType === 'factura_electronica' && !customer?.identification) {
      setMsg({ kind: 'err', text: 'La factura electrónica necesita un cliente con cédula. Buscalo o creálo.' });
      return;
    }
    // Un pedido agendado para otro día hay que ir a entregarlo: sin cliente no
    // se sabe a quién ni a dónde, y el día de la entrega ya nadie se acuerda.
    if (schedDate && schedDate !== crToday() && !customer) {
      setMsg({ kind: 'err', text: 'Para agendar el pedido para otro día hay que elegir el cliente.' });
      return;
    }
    if (schedDate && schedDate !== crToday() && !place.trim() && !zone.trim()) {
      setMsg({ kind: 'err', text: 'Poné la zona o el lugar de entrega: la agenda se usa para armar la ruta.' });
      return;
    }
    setSending(true); setMsg(null);
    try {
      const agent = myAgent ?? agents.find(a => a.id === agentId);
      const created = await agentOrdersService.send({
        agent_id: agentId || null,
        agent_name: agent?.name ?? null,
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? null,
        customer_phone: customer?.phone ?? null,
        document_type: docType,
        notes: notes.trim() || null,
        scheduled_date: schedDate || null,
        customer_zone: zone.trim() || null,
        delivery_place: place.trim() || null,
        scheduled_note: schedNote.trim() || null,
        proforma_id: proforma?.id ?? null,
        items: cart,
      });
      setCart([]); setCustomer(null); setNotes(''); setDocType('ticket');
      setProforma(null); setSchedNote(''); setSchedDate(crToday());
      setPlace(''); setZone('');
      setMsg({ kind: 'ok', text: `Pedido ${created.number ?? ''} enviado a caja ✓` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo enviar' });
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Cabecera compacta: agente y cliente */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 flex items-center gap-2 flex-wrap shrink-0">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={16} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-1.5 text-sm font-black text-sky-700 shrink-0">
          <Send size={16} /> Nuevo pedido
        </span>
        {myAgent ? (
          <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sm font-black text-sky-800 shrink-0">
            <User size={14} /> {myAgent.name}
          </span>
        ) : (
          <select value={agentId} onChange={e => setAgentId(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-sky-400">
            <option value="">— Agente —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}

        {/* Cliente: el MISMO buscador del POS (incluye crear cliente nuevo). */}
        <div className="relative flex-1 min-w-40">
          <button onClick={() => setShowCustomerSearch(true)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-sky-400 text-left">
            <Search size={14} className="text-gray-400 shrink-0" />
            <span className={`flex-1 min-w-0 truncate ${customer ? 'font-bold text-gray-800' : 'text-gray-400'}`}>
              {customer ? customer.name : 'Buscar o crear cliente…'}
            </span>
            {customer && (
              <span onClick={e => {
                e.stopPropagation(); setCustomer(null);
                // Sin cliente no hay receptor: la factura electrónica deja de ser válida.
                if (docType === 'factura_electronica') setDocType('ticket');
              }}
                className="shrink-0 text-gray-300 hover:text-red-500"><X size={14} /></span>
            )}
          </button>
          {showCustomerSearch && (
            <POSCustomerSearch
              variant="inline"
              selected={customer}
              onPick={(cst) => {
                setCustomer(cst);
                setShowCustomerSearch(false);
                // El lugar sale de la ficha, pero solo si el usuario no escribió
                // uno a mano: lo que él puso manda.
                setZone(z => z || (cst?.zone ?? ''));
                setPlace(p => p || (cst?.address ?? ''));
              }}
              onClose={() => setShowCustomerSearch(false)}
            />
          )}
        </div>

        {/* Tipo de comprobante — el MISMO selector del POS: mismos colores por tipo,
            mismas validaciones y los mismos avisos cuando no se puede elegir. */}
        {/* Agenda: para qué día es el pedido. El cajero trabaja por día. */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0">
          <CalendarDays size={15} className={schedDate === crToday() ? 'text-gray-400' : 'text-amber-500'} />
          <input
            type="date" value={schedDate} min={crToday()}
            onChange={e => setSchedDate(e.target.value)}
            title="Día en que el cliente espera el pedido"
            className={`flex-1 sm:flex-none min-w-0 px-2 py-2 sm:py-1.5 border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 ${
              schedDate && schedDate !== crToday()
                ? 'border-amber-300 bg-amber-50 text-amber-800 focus:ring-amber-200'
                : 'border-gray-200 bg-white text-gray-700 focus:ring-gray-200'}`}
          />
          <input
            type="text" value={schedNote} onChange={e => setSchedNote(e.target.value)}
            placeholder="Hora / referencia"
            className="flex-1 sm:flex-none sm:w-32 min-w-0 px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>

        {/* Lugar de entrega: sin esto la agenda no sirve para armar ruta. */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0">
          <MapPin size={15} className={zone || place ? 'text-emerald-600' : 'text-gray-400'} />
          <input
            type="text" value={zone} onChange={e => setZone(e.target.value)}
            placeholder="Zona" list="agenda-zonas"
            className="w-24 sm:w-28 shrink-0 px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          <datalist id="agenda-zonas">
            {zones.map(z => <option key={z} value={z} />)}
          </datalist>
          <input
            type="text" value={place} onChange={e => setPlace(e.target.value)}
            placeholder="Lugar de entrega"
            className="flex-1 sm:flex-none sm:w-44 min-w-0 px-2 py-2 sm:py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>

        {/* Proforma de origen */}
        <div className="flex items-center gap-1.5 shrink-0 order-last sm:order-none">
          {proforma ? (
            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-xs font-black text-violet-800">
              <FileText size={13} /> {proforma.number ?? 'Proforma'}
              <button onClick={() => setProforma(null)} title="Desligar la proforma"
                className="ml-0.5 text-violet-400 hover:text-violet-700"><X size={13} /></button>
            </span>
          ) : (
            <button onClick={openProformas}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-violet-200 bg-white text-xs font-black text-violet-700 hover:bg-violet-50">
              <FileText size={13} /> Desde proforma
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-none sm:shrink-0 min-w-0">
          <Receipt size={15} className="text-gray-400 shrink-0" />
          <select
            value={docType}
            onChange={(e) => {
              const t = e.target.value as DocumentType;
              if (t !== 'ticket' && !feReady) {
                alert('No podés emitir comprobantes electrónicos: la facturación electrónica no está configurada. Contactá al administrador.');
                return;
              }
              if (t === 'factura_electronica' && !customer?.identification) {
                alert('Para emitir Factura Electrónica primero seleccioná un cliente con cédula (usá el buscador 🔍).');
                return;
              }
              setDocType(t);
            }}
            className={`flex-1 sm:flex-none min-w-0 px-2 py-2 sm:py-1.5 border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 ${
              docType === 'factura_electronica' ? 'border-blue-300 bg-blue-50 text-blue-700 focus:ring-blue-200' :
              docType === 'tiquete_electronico' ? 'border-cyan-300 bg-cyan-50 text-cyan-700 focus:ring-cyan-200' :
              'border-gray-200 bg-white text-gray-700 focus:ring-gray-200'
            }`}
          >
            <option value="ticket">Tiquete corriente</option>
            <option value="tiquete_electronico" disabled={!feReady}>
              Tiquete electrónico{!feReady ? ' (FE no configurada)' : ''}
            </option>
            <option value="factura_electronica" disabled={!feReady || !customer?.identification}>
              Factura electrónica{!feReady ? ' (FE no configurada)' : !customer?.identification ? ' (requiere cliente)' : ''}
            </option>
          </select>
        </div>
      </div>

      {creatingProduct && (
        <ProductForm
          productId={null}
          onSuccess={() => {
            setCreatingProduct(false);
            refetchProducts();
            setMsg({ kind: 'ok', text: 'Producto creado · ya podés agregarlo al pedido' });
          }}
          onCancel={() => setCreatingProduct(false)}
        />
      )}

      {editProductId && (
        <ProductForm
          productId={editProductId}
          onSuccess={() => {
            setEditProductId(null);
            // Se recarga el catálogo para que el precio corregido entre en el
            // pedido que está armando, no en el siguiente.
            refetchProducts();
            setMsg({ kind: 'ok', text: 'Producto actualizado' });
          }}
          onCancel={() => setEditProductId(null)}
        />
      )}

      {showProformas && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-start justify-center p-0 sm:p-4 sm:pt-16"
          onClick={() => setShowProformas(false)}>
          <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[85vh]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="flex items-center gap-2 text-sm font-black text-violet-700">
                <FileText size={16} /> Proformas abiertas
              </span>
              <button onClick={() => setShowProformas(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto no-scrollbar">
              {loadingProformas ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-gray-400">
                  <Loader2 size={16} className="animate-spin" /> Cargando…
                </div>
              ) : proformas.length === 0 ? (
                <div className="py-10 text-center text-sm font-bold text-gray-400">
                  No hay proformas abiertas.
                </div>
              ) : proformas.map(p => (
                <button key={p.id} onClick={() => loadProforma(p)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 text-left hover:bg-violet-50">
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-gray-800 truncate">
                      {p.number ?? 'Proforma'} · {p.customer_name ?? 'Sin cliente'}
                    </span>
                    <span className="block text-xs font-bold text-gray-400">
                      {p.items?.length ?? 0} línea(s)
                      {p.valid_until ? ` · vence ${String(p.valid_until).slice(0, 10)}` : ''}
                    </span>
                  </span>
                  <span className="text-sm font-black text-violet-700 shrink-0">{money(p.total)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div className={`shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.text}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col">
        {/* Buscador ARRIBA, a todo lo ancho: en formato lista el panel de productos
            es justo eso — el campo de captura por código o nombre. */}
        {canCreateProducts && (
          <div className="shrink-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center gap-2">
            <button onClick={() => setCreatingProduct(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-800 text-xs font-black hover:bg-blue-100">
              <Plus size={14} /> Nuevo producto
            </button>
            <span className="text-[11px] font-semibold text-gray-400">
              Si el cliente pide algo que no está en el catálogo, cargalo acá y seguí el pedido.
            </span>
          </div>
        )}

        {kits.length > 0 && (
          <div className="shrink-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="flex items-center gap-1 text-[11px] font-black text-teal-700 shrink-0 pr-1">
              <Boxes size={14} /> Kits
            </span>
            {kits.map(k => (
              <button key={k.id} onClick={() => addKit(k)}
                title={k.items.map(i => `${i.quantity} × ${i.name}`).join('\n')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-teal-200 bg-teal-50 text-xs font-black text-teal-800 hover:bg-teal-100 active:scale-95 transition">
                {k.name}
                <span className="text-[10px] font-bold text-teal-600">
                  {k.items.length} art.
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="shrink-0">
          <POSProductsPanel
            filteredProducts={filteredProducts}
            allProducts={products}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onAddToCart={addToCart}
            currentSession={fakeSession}
            productsError={productsError}
            ignoreStock
          />
        </div>

        {/* Carrito GRANDE: ocupa todo el resto de la pantalla */}
        <div className="flex-1 min-h-0 bg-white flex flex-col">
          <div className="px-4 py-2 border-b border-gray-100 text-sm font-black text-gray-700 flex items-center justify-between shrink-0">
            <span>Pedido</span>
            <span className="text-xs font-bold text-gray-400">{cart.length} línea(s)</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 p-8">
                <User size={56} className="text-gray-200" />
                <p className="text-lg font-bold text-center text-gray-400">El pedido está vacío</p>
                <p className="text-sm text-center text-gray-400">
                  Escribí el código o el nombre del producto arriba y presioná <b>Enter</b>.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                  <tr>
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-center px-2 py-2 w-20">Disp.</th>
                    <th className="text-center px-2 py-2 w-40">Cantidad</th>
                    <th className="text-right px-2 py-2 w-28">P/U</th>
                    <th className="text-right px-4 py-2 w-32">Subtotal</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cart.map((it, i) => (
                    <tr key={i} onClick={() => setSelected(i)}
                      className={`cursor-pointer ${selected === i
                        ? 'bg-sky-100/70 outline outline-2 -outline-offset-2 outline-sky-500'
                        : 'hover:bg-sky-50/40'}`}>
                      <td className="px-4 py-2.5">
                        <span className="block font-bold text-gray-900">{it.product_name}</span>
                        {it.notes && <span className="block text-[11px] text-violet-700 font-semibold">+ {it.notes}</span>}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {(() => {
                          // Existencias que QUEDARÍAN si el cajero cobra este pedido.
                          // El agente vende fuera del local: sin esto ofrece lo que ya no hay.
                          const prod: any = products.find(p => p.id === it.product_id);
                          if (!prod) return <span className="text-gray-300">—</span>;
                          if (prod.tracks_stock === false) return <span className="text-blue-600 font-bold">∞</span>;
                          const left = Number(prod.stock_quantity ?? 0) - Number(it.quantity ?? 0);
                          return (
                            <span className={`font-bold tabular-nums ${
                              left < 0 ? 'text-red-600' : left === 0 ? 'text-amber-600' : 'text-gray-500'
                            }`}>
                              {Number.isInteger(left) ? left : left.toFixed(2)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setQty(i, it.quantity - 1)}
                            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                            <Minus size={15} />
                          </button>
                          <input type="number" min={0} step="any" value={it.quantity}
                            onChange={e => setQty(i, Number(e.target.value) || 0)}
                            onFocus={e => e.currentTarget.select()}
                            className="w-20 text-center text-base font-bold border border-gray-200 rounded-lg px-1 py-1.5" />
                          {it.product_id && canEditProducts && (
                        <button onClick={() => setEditProductId(it.product_id!)}
                          title="Corregir este producto (precio, código, CABYS)"
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                          <Pencil size={13} />
                        </button>
                      )}
                      <button onClick={() => setQty(i, it.quantity + 1)}
                            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                            <Plus size={15} />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-500 tabular-nums">
                        {puedeEditarPrecio ? (
                          <label className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 px-1.5 py-1">
                            <span className="text-[11px] font-bold text-gray-400">₡</span>
                            <input type="number" min={0} step="any" value={it.unit_price}
                              onChange={e => setPrice(i, Number(e.target.value) || 0)}
                              onFocus={e => e.currentTarget.select()}
                              onClick={e => e.stopPropagation()}
                              className="w-20 text-right text-sm font-black text-gray-800 outline-none tabular-nums" />
                          </label>
                        ) : money(it.unit_price)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-base font-black tabular-nums">{money(it.subtotal)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <button onClick={() => setQty(i, 0)} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {sinStock.length > 0 && (
            <div className="shrink-0 bg-amber-50 border-t border-amber-200 px-4 py-2 text-xs font-bold text-amber-800">
              ⚠ Sin existencias suficientes de: {sinStock.map(x => x.product_name).join(', ')}.
              El pedido se puede enviar igual, pero confirmá con bodega.
            </div>
          )}

          <div className="border-t-2 border-gray-200 px-4 py-3 shrink-0 flex items-center gap-3 flex-wrap">
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Nota para caja…"
              className="flex-1 min-w-40 px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-sky-400" />
            <PosShortcutsHint variant="inline" shortcuts={[
              { keys: 'F2',    label: 'Abrir buscador' },
              { keys: 'F12',   label: 'Enviar a caja' },
              { keys: 'Enter', label: 'Agregar al pedido' },
              { keys: '↑ ↓',   label: 'Elegir producto / línea' },
              { keys: 'Supr',  label: 'Borrar línea del pedido' },
              { keys: 'Esc',   label: 'Cerrar / limpiar' },
            ]} />
            <div className="text-right shrink-0">
              <p className="text-[11px] font-bold text-gray-400 uppercase leading-none">Total</p>
              <p className="text-4xl font-black tabular-nums leading-tight">{money(total)}</p>
            </div>
            <button onClick={send} disabled={sending || cart.length === 0 || productsLoading}
              className="shrink-0 flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xl disabled:bg-gray-200 disabled:text-gray-400">
              {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              {sending ? 'Enviando…' : 'Enviar a caja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentOrderPOS;
