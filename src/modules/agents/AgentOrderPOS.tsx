import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Trash2, Plus, Minus, AlertCircle, CheckCircle2, User, Home, Search, X, Receipt } from 'lucide-react';
import { usePOSProducts } from '@/hooks/POS/usePOSProducts';
import { usePOSLayout } from '@/hooks/usePOSLayout';
import { useFeReady, type DocumentType } from '@/hooks/POS/useFeReady';
import { POSCustomerSearch } from '@/modules/pos/POSCustomerSearch';
import { PosShortcutsHint } from '@/modules/pos/PosShortcutsHint';
import type { Customer } from '@/services/customers/customersService';
import { POSProductsPanel } from '@/modules/pos/POSProducts';
import type { Product, CashSession } from '@/types/Types_POS';
import {
  salesAgentsService, agentOrdersService,
  type SalesAgent, type AgentOrderItem,
} from '@/services/agents/salesAgentsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

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

  const send = async () => {
    if (cart.length === 0) { setMsg({ kind: 'err', text: 'El pedido no tiene productos.' }); return; }
    // Una factura electrónica necesita receptor identificado: si el agente no lo
    // elige, el cajero se traba al cobrar y hay que llamar al cliente de nuevo.
    if (docType === 'factura_electronica' && !customer?.identification) {
      setMsg({ kind: 'err', text: 'La factura electrónica necesita un cliente con cédula. Buscalo o creálo.' });
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
        items: cart,
      });
      setCart([]); setCustomer(null); setNotes(''); setDocType('ticket');
      setMsg({ kind: 'ok', text: `Pedido ${created.number ?? ''} enviado a caja ✓` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo enviar' });
    } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Cabecera compacta: agente y cliente */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-2 flex-wrap shrink-0">
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
              onPick={(cst) => { setCustomer(cst); setShowCustomerSearch(false); }}
              onClose={() => setShowCustomerSearch(false)}
            />
          )}
        </div>

        {/* Tipo de comprobante — el MISMO selector del POS: mismos colores por tipo,
            mismas validaciones y los mismos avisos cuando no se puede elegir. */}
        <div className="flex items-center gap-2 shrink-0">
          <Receipt size={15} className="text-gray-400" />
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
            className={`px-2 py-1.5 border rounded-lg text-xs font-bold focus:outline-none focus:ring-2 ${
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

      {msg && (
        <div className={`shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.text}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col">
        {/* Buscador ARRIBA, a todo lo ancho: en formato lista el panel de productos
            es justo eso — el campo de captura por código o nombre. */}
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
                          <button onClick={() => setQty(i, it.quantity + 1)}
                            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                            <Plus size={15} />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-500 tabular-nums">{money(it.unit_price)}</td>
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
