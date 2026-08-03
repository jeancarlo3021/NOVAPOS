import React, { useEffect, useState } from 'react';
import { Trash2, Plus, Minus, ShoppingBag, CreditCard, Tag, Printer, StickyNote } from 'lucide-react';
import { CartItem, CashSession } from '@/types/Types_POS';
import type { AppliedCombo } from '@/services/promotions/promotionsService';

// Formato de moneda con 2 decimales (el carrito muestra los céntimos).
const money = (n: number) => Number(n ?? 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cantidad EDITABLE: al tocar el número se puede escribir una cantidad personalizada
 *  (incluye decimales para productos por peso). Se confirma al escribir un valor válido
 *  y, si se deja vacío/ inválido, vuelve al último valor. */
function QtyInput({ value, onCommit, className }: { value: number; onCommit: (n: number) => void; className?: string }) {
  const [text, setText] = useState(String(value));
  // Sincroniza cuando el valor cambia desde afuera (botones +/-, etc.).
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={e => e.currentTarget.select()}
      onPointerDown={e => e.stopPropagation()}
      onChange={e => {
        const t = e.target.value.replace(/[^\d.]/g, '');
        setText(t);
        const n = parseFloat(t);
        if (!isNaN(n) && n > 0) onCommit(n);
      }}
      onBlur={() => { const n = parseFloat(text); if (isNaN(n) || n <= 0) setText(String(value)); }}
      onKeyDown={e => {
        // Enter/Esc confirma y DEVUELVE el foco al campo de captura del POS, para
        // seguir digitando códigos sin tener que volver con el mouse.
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        if (e.key === 'Escape') setText(String(value));
        e.currentTarget.blur();
        window.dispatchEvent(new CustomEvent('pos:focus-search'));
      }}
      className={className}
    />
  );
}

interface POSCartPanelProps {
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  /** Descuento total por combos/grupos de promos (nivel carrito). */
  comboDiscount?: number;
  /** Combos armados en el carrito (para mostrar cada uno). */
  appliedCombos?: AppliedCombo[];
  /** Ajuste por redondeo a ₡10 (total redondeado − total exacto). */
  roundingAdjust?: number;
  taxEnabled?: boolean;
  taxRate?: number;
  /** Desglose del IVA por tasa (ej. { 13: 1300, 1: 50 }). */
  taxBreakdown?: Record<number, number>;
  currentSession: CashSession | null;
  loading: boolean;
  /** El negocio desactivó apertura/cierre de caja: no mostramos "Abre la caja". */
  cashDisabled?: boolean;
  onRemoveFromCart: (productId: string) => void;
  onChangeQuantity: (productId: string, quantity: number) => void;
  canDiscount?: boolean;
  /** Tope máximo de descuento (%) según configuración del negocio. */
  maxDiscountPercent?: number;
  onApplyDiscount?: (productId: string, discountPct: number) => void;
  /** Guarda la nota de una línea (comidas: "sin cebolla", "para llevar"). */
  onSetItemNotes?: (productId: string, notes: string) => void;
  onPayment: () => void;
  /** Imprime un pre-ticket (proforma, sin cobrar). */
  onPreTicket?: () => void;
  onSaveProforma?: () => void;
  /** Cuando true, el carrito se expande para ocupar el área principal (modo lista). */
  expanded?: boolean;
  /** El plan permite delivery: muestra el selector Mesa/Delivery. */
  deliveryEnabled?: boolean;
  /** Modo de venta actual. */
  saleMode?: 'mesa' | 'delivery';
  /** Cambia el modo de venta (mesa ↔ delivery). */
  onSaleModeChange?: (mode: 'mesa' | 'delivery') => void;
}

export const POSCartPanel: React.FC<POSCartPanelProps> = ({
  cartItems,
  subtotal,
  taxAmount,
  total,
  appliedCombos = [],
  roundingAdjust = 0,
  taxEnabled = true,
  taxRate = 0.13,
  taxBreakdown,
  currentSession,
  loading,
  cashDisabled = false,
  onRemoveFromCart,
  onChangeQuantity,
  canDiscount,
  maxDiscountPercent = 100,
  onApplyDiscount,
  onSetItemNotes,
  onPayment,
  onPreTicket,
  expanded = false,
  deliveryEnabled = false,
  saleMode = 'mesa',
  onSaleModeChange,
}) => {
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const canPay = cartItems.length > 0 && currentSession?.status === 'open' && !loading;

  // ── Selección del carrito con el teclado ─────────────────────────────────
  // ↑ ↓ mueven la línea seleccionada y Supr (Delete) la borra. Se identifica por
  // product_id, no por índice, para que la selección sobreviva a que se agreguen
  // o quiten líneas. NO actúa mientras se escribe en un input (el campo de
  // captura del POS usa las mismas flechas para elegir coincidencias).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Línea cuya nota se está escribiendo (product_id) + texto en edición.
  const [notingId, setNotingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const openNote = (item: CartItem) => {
    setSelectedId(item.product_id);
    setNotingId(item.product_id);
    setNoteDraft(item.notes ?? '');
  };
  const commitNote = () => {
    if (notingId) onSetItemNotes?.(notingId, noteDraft);
    setNotingId(null);
    setNoteDraft('');
    window.dispatchEvent(new CustomEvent('pos:focus-search'));
  };

  // La selección se descarta si la línea ya no está (se borró o se cobró).
  useEffect(() => {
    if (selectedId && !cartItems.some(i => i.product_id === selectedId)) setSelectedId(null);
  }, [cartItems, selectedId]);

  useEffect(() => {
    /** Aplica una tecla de navegación al carrito. Devuelve true si la consumió. */
    const applyKey = (key: string): boolean => {
      if (cartItems.length === 0) return false;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        const cur = cartItems.findIndex(i => i.product_id === selectedId);
        // Sin selección: ↓ toma la primera línea, ↑ la última.
        const next = cur === -1
          ? (key === 'ArrowDown' ? 0 : cartItems.length - 1)
          : Math.max(0, Math.min(cartItems.length - 1, cur + (key === 'ArrowDown' ? 1 : -1)));
        setSelectedId(cartItems[next].product_id);
        return true;
      }
      if (key === 'Delete') {
        if (!selectedId) return false;
        // Se selecciona la línea siguiente para poder borrar varias seguidas.
        const cur = cartItems.findIndex(i => i.product_id === selectedId);
        const after = cartItems[cur + 1] ?? cartItems[cur - 1] ?? null;
        onRemoveFromCart(selectedId);
        setSelectedId(after?.product_id ?? null);
        return true;
      }
      if (key === 'Escape') { setSelectedId(null); return true; }
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (applyKey(e.key)) e.preventDefault();
    };
    // El campo de captura del POS siempre tiene el foco, así que nos REENVÍA las
    // flechas/Supr cuando él no las necesita (sin coincidencias que recorrer).
    const onForwarded = (e: Event) => applyKey((e as CustomEvent<{ key: string }>).detail?.key ?? '');

    window.addEventListener('keydown', onKey);
    window.addEventListener('pos:cart-key', onForwarded);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pos:cart-key', onForwarded);
    };
  }, [cartItems, selectedId, onRemoveFromCart]);


  const handlePaymentClick = () => {
    // Double-check session status before allowing payment
    if (!currentSession || currentSession.status !== 'open') {
      return;
    }

    if (cartItems.length === 0) {
      return;
    }

    onPayment();
  };

  const handleDiscountChange = (productId: string, value: string) => {
    // Topar al máximo configurado por el negocio.
    const cap = Math.max(0, Math.min(100, maxDiscountPercent));
    let pct = Math.max(0, parseFloat(value) || 0);
    if (pct > cap) pct = cap;
    setDiscountInputs(prev => ({ ...prev, [productId]: pct ? String(pct) : '' }));
    onApplyDiscount?.(productId, pct);
  };

  return (
    <div className={`flex flex-col bg-white ${expanded ? 'flex-1' : 'w-60 sm:w-72 lg:w-96 shrink-0 border-l-2 border-gray-200'}`}>

      {/* ── Header (oculto en formato lista para ganar espacio) ── */}
      {!expanded && (
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 bg-white shrink-0">
          <ShoppingBag size={20} className="text-emerald-500" />
          <h2 className="text-gray-900 font-black text-lg">Carrito</h2>
          {cartItems.length > 0 && (
            <span className="ml-auto bg-emerald-500 text-white text-sm font-black w-7 h-7 rounded-full flex items-center justify-center">
              {cartItems.length}
            </span>
          )}
        </div>
      )}

      {/* ── Selector Mesa / Delivery (solo si el plan lo permite) ── */}
      {deliveryEnabled && (
        <div className="px-4 pt-3 shrink-0">
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => onSaleModeChange?.('mesa')}
              className={`flex-1 py-2 rounded-lg text-sm font-black transition ${saleMode === 'mesa' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              🍽️ Mesa
            </button>
            <button
              onClick={() => onSaleModeChange?.('delivery')}
              className={`flex-1 py-2 rounded-lg text-sm font-black transition ${saleMode === 'delivery' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500'}`}
            >
              🛵 Delivery
            </button>
          </div>
        </div>
      )}

      {/* ── Items ── */}
      <div className="flex-1 overflow-y-auto pos-scroll">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-10">
            <ShoppingBag size={64} className="text-gray-200" />
            <p className="text-xl font-semibold text-center text-gray-400 leading-snug">
              El carrito está vacío.<br />Toca un producto para agregar.
            </p>
          </div>
        ) : expanded ? (
          // ── Modo LISTA (expanded): renderizado tipo tabla, una fila por item.
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
              <tr>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-center px-2 py-2 w-20">Disp.</th>
                <th className="text-center px-2 py-2 w-32">Cantidad</th>
                <th className="text-right px-2 py-2 w-24">P/U</th>
                {canDiscount && <th className="text-center px-2 py-2 w-20">Desc. %</th>}
                <th className="text-right px-2 py-2 w-28">Subtotal</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {cartItems.map((item) => {
                const hasDiscount = (item.discount_percent ?? 0) > 0;
                const hasPromo    = !!item.promo;
                const originalSubtotal = item.unit_price * item.quantity;
                const showOriginal = hasDiscount || hasPromo;
                return (
                  <tr key={item.product_id}
                    onClick={() => setSelectedId(item.product_id)}
                    className={`border-b border-gray-100 cursor-pointer ${
                      selectedId === item.product_id
                        ? 'bg-emerald-100/70 outline outline-2 -outline-offset-2 outline-emerald-500'
                        : 'hover:bg-emerald-50/40'
                    }`}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-gray-900 truncate">{item.product.name}</span>
                        {hasPromo && (
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] bg-violet-100 text-violet-700 font-bold px-1.5 py-0.5 rounded">
                            <Tag size={9} />
                            {item.promo!.type === '2x1' ? '2×1' : item.promo!.type === 'percentage' ? `${item.promo!.value}%` : `-₡${item.promo!.value}`}
                          </span>
                        )}
                        {/* Nota de la línea: se abre con el botón y se guarda con Enter. */}
                        {onSetItemNotes && notingId !== item.product_id && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); openNote(item); }}
                            title={item.notes ? `Nota: ${item.notes}` : 'Agregar nota (ej. sin cebolla)'}
                            className={`shrink-0 p-1 rounded transition ${
                              item.notes ? 'text-amber-600 hover:bg-amber-100' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <StickyNote size={14} />
                          </button>
                        )}
                      </div>
                      {/* Nota guardada, visible bajo el nombre. */}
                      {item.notes && notingId !== item.product_id && (
                        <p className="text-[11px] text-amber-700 font-semibold truncate pl-0.5">↳ {item.notes}</p>
                      )}
                      {notingId === item.product_id && (
                        <input
                          autoFocus
                          value={noteDraft}
                          onChange={e => setNoteDraft(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onBlur={commitNote}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitNote(); }
                            else if (e.key === 'Escape') { e.preventDefault(); setNotingId(null); setNoteDraft(''); }
                          }}
                          placeholder="Nota: sin cebolla, para llevar…"
                          className="mt-1 w-full text-[12px] border border-amber-300 bg-amber-50 rounded px-2 py-1 outline-none focus:border-amber-500"
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {(() => {
                        // Existencias que QUEDARÍAN al cobrar esta venta. Los productos
                        // sin control de stock (tracks_stock=false) muestran ∞.
                        const p: any = item.product ?? {};
                        if (p.tracks_stock === false) {
                          return <span className="text-blue-600 font-bold">∞</span>;
                        }
                        const left = Number(p.stock_quantity ?? 0) - Number(item.quantity ?? 0);
                        return (
                          <span className={`font-bold tabular-nums ${
                            left < 0 ? 'text-red-600' : left === 0 ? 'text-amber-600' : 'text-gray-500'
                          }`}>
                            {Number.isInteger(left) ? left : left.toFixed(2)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onPointerDown={() => onChangeQuantity(item.product_id, item.quantity - 1)}
                          className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 flex items-center justify-center"
                        >
                          <Minus size={14} />
                        </button>
                        <QtyInput
                          value={item.quantity}
                          onCommit={(n) => onChangeQuantity(item.product_id, n)}
                          className="w-10 text-center font-black text-gray-900 tabular-nums bg-transparent rounded-md focus:outline-none focus:bg-emerald-50 focus:ring-2 focus:ring-emerald-300"
                        />
                        <button
                          onPointerDown={() => onChangeQuantity(item.product_id, item.quantity + 1)}
                          className="w-7 h-7 rounded-md bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white flex items-center justify-center"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 font-semibold">
                      ₡{money(item.unit_price)}
                    </td>
                    {canDiscount && (
                      <td className="px-2 py-1.5 text-center">
                        {hasPromo ? (
                          <span className="text-[10px] text-gray-300">—</span>
                        ) : (
                          <input
                            type="number" inputMode="decimal" min={0} max={Math.min(100, maxDiscountPercent)}
                            value={discountInputs[item.product_id] ?? (item.discount_percent ? String(item.discount_percent) : '')}
                            onChange={(e) => handleDiscountChange(item.product_id, e.target.value)}
                            placeholder="0"
                            className="w-14 text-center px-1 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-emerald-400"
                          />
                        )}
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {showOriginal && (
                        <div className="text-[10px] text-gray-300 line-through leading-none">
                          ₡{money(originalSubtotal)}
                        </div>
                      )}
                      <div className={`font-black ${showOriginal ? 'text-violet-600' : 'text-emerald-600'}`}>
                        ₡{money(item.subtotal)}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onPointerDown={() => onRemoveFromCart(item.product_id)}
                        className="w-7 h-7 rounded-md bg-red-50 hover:bg-red-100 text-red-500 inline-flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <ul className="divide-y divide-gray-100 px-3">
            {cartItems.map((item) => {
              const hasDiscount = (item.discount_percent ?? 0) > 0;
              const hasPromo    = !!item.promo;
              const originalSubtotal = item.unit_price * item.quantity;
              const showOriginal = hasDiscount || hasPromo;

              return (
              <li key={item.product_id}
                onClick={() => setSelectedId(item.product_id)}
                className={`py-1.5 px-1.5 -mx-1.5 rounded-lg cursor-pointer ${
                  selectedId === item.product_id ? 'bg-emerald-100/70 ring-2 ring-emerald-500' : ''
                }`}>
                {/* Fila 1: nombre + subtotal + eliminar */}
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-gray-900 text-sm font-bold leading-tight truncate">
                    {item.product.name}
                    {hasPromo && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] bg-violet-100 text-violet-700 font-bold px-1 py-0.5 rounded align-middle">
                        <Tag size={9} /> {item.promo!.type === '2x1' ? '2×1' : item.promo!.type === 'percentage' ? `${item.promo!.value}%` : `-₡${item.promo!.value}`}
                      </span>
                    )}
                  </span>
                  {showOriginal && (
                    <span className="text-gray-300 text-[11px] line-through shrink-0">₡{money(originalSubtotal)}</span>
                  )}
                  <span className={`font-black text-sm shrink-0 tabular-nums ${showOriginal ? 'text-violet-600' : 'text-emerald-600'}`}>
                    ₡{money(item.subtotal)}
                  </span>
                  <button
                    onPointerDown={() => onRemoveFromCart(item.product_id)}
                    className="w-7 h-7 rounded-md bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-500 flex items-center justify-center transition shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Fila 2: cantidad + precio unitario + (descuento) */}
                <div className="flex items-center gap-1.5 mt-1">
                  <button
                    onPointerDown={() => onChangeQuantity(item.product_id, item.quantity - 1)}
                    className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 flex items-center justify-center transition shrink-0"
                  >
                    <Minus size={14} />
                  </button>
                  <QtyInput
                    value={item.quantity}
                    onCommit={(n) => onChangeQuantity(item.product_id, n)}
                    className="w-9 text-center text-gray-900 font-black text-base bg-transparent rounded-md focus:outline-none focus:bg-emerald-50 focus:ring-2 focus:ring-emerald-300"
                  />
                  <button
                    onPointerDown={() => onChangeQuantity(item.product_id, item.quantity + 1)}
                    className="w-7 h-7 rounded-md bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white flex items-center justify-center transition shrink-0"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="text-gray-400 text-[11px] font-medium ml-1 truncate">₡{money(item.unit_price)} c/u</span>

                  {canDiscount && !hasPromo && (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-gray-400 font-medium" title={`Máximo ${Math.min(100, maxDiscountPercent)}%`}>Desc%</span>
                      <input
                        type="number" min="0" max={Math.min(100, maxDiscountPercent)} step="1"
                        value={discountInputs[item.product_id] ?? (item.discount_percent ? String(item.discount_percent) : '')}
                        onChange={e => handleDiscountChange(item.product_id, e.target.value)}
                        placeholder="0"
                        className="w-11 text-center border border-gray-200 rounded-md px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </span>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Cobro: resumen de la venta + botón (todo junto).
          sticky bottom-0 → el botón "Cobrar" queda SIEMPRE visible abajo. ── */}
      <div className="sticky bottom-0 z-10 px-3 py-2.5 bg-white border-t-2 border-gray-100 shrink-0 space-y-2 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.15)]">
        {/* Estado de la caja */}
        {cashDisabled ? (
          (!currentSession || currentSession.status !== 'open') ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-center">
              <p className="text-gray-500 text-sm font-bold">Preparando caja…</p>
            </div>
          ) : null
        ) : !currentSession ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center">
            <p className="text-amber-700 text-sm font-bold">Abre la caja para cobrar</p>
          </div>
        ) : currentSession.status !== 'open' ? (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-center">
            <p className="text-red-700 text-sm font-bold">La caja está cerrada</p>
          </div>
        ) : null}

        {/* Resumen compacto de la venta (subtotal, IVA, descuentos, combos, redondeo).
            En formato lista se oculta: los totales ya se ven en la barra verde de arriba. */}
        {!expanded && cartItems.length > 0 && (() => {
          const grossSubtotal = Math.round(cartItems.reduce((s, i) => s + i.unit_price * i.quantity, 0));
          const totalDiscount = grossSubtotal - subtotal;
          return (
            <div className="text-xs space-y-0.5">
              {totalDiscount > 0 && (
                <div className="flex justify-between text-violet-600 font-semibold">
                  <span>Descuentos / Promos</span>
                  <span>-₡{money(totalDiscount)}</span>
                </div>
              )}
              {taxEnabled && taxAmount > 0 && (
                <>
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span className="text-gray-800 font-bold">₡{money(subtotal)}</span>
                  </div>
                  {taxBreakdown && Object.keys(taxBreakdown).length > 0 ? (
                    Object.entries(taxBreakdown)
                      .sort((a, b) => Number(b[0]) - Number(a[0]))
                      .map(([rate, amt]) => (
                        <div key={rate} className="flex justify-between text-gray-500">
                          <span>IVA {Number(rate) === 0 ? 'Exento' : `(${Number(rate)}%)`}</span>
                          <span className="text-gray-800 font-bold">₡{money(Number(amt))}</span>
                        </div>
                      ))
                  ) : (
                    <div className="flex justify-between text-gray-500">
                      <span>IVA ({(taxRate * 100).toFixed(0)}%)</span>
                      <span className="text-gray-800 font-bold">₡{money(taxAmount)}</span>
                    </div>
                  )}
                </>
              )}
              {appliedCombos.map((c, i) => (
                <div key={i} className="flex justify-between text-rose-600 font-bold">
                  <span className="inline-flex items-center gap-1"><Tag size={11} /> {c.label}{c.sets > 1 ? ` ×${c.sets}` : ''}</span>
                  <span>{c.discount >= 0 ? '-' : '+'}₡{money(Math.abs(c.discount))}</span>
                </div>
              ))}
              {roundingAdjust !== 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Redondeo</span>
                  <span className="text-gray-600 font-bold">{roundingAdjust >= 0 ? '+' : '-'}₡{money(Math.abs(roundingAdjust))}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Botón cobrar con el TOTAL A COBRAR */}
        <div className="flex gap-2">
          {onPreTicket && (
            <button
              onClick={onPreTicket}
              disabled={cartItems.length === 0}
              title="Imprimir pre-ticket (proforma, no es factura)"
              className={`h-14 w-12 flex items-center justify-center rounded-xl transition shrink-0
                ${cartItems.length > 0 ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-gray-50 text-gray-300 cursor-not-allowed'}`}
            >
              <Printer size={18} />
            </button>
          )}
          <button
            onClick={handlePaymentClick}
            disabled={!canPay}
            className={`flex-1 h-14 flex items-center justify-between px-4 rounded-xl transition ${
              canPay
                ? 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 active:scale-[0.98] text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span className="flex items-center gap-2 font-black">
              <CreditCard size={22} />
              {loading ? 'Procesando…' : 'Cobrar'}
            </span>
            <span className="font-black text-2xl tabular-nums">₡{money(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
