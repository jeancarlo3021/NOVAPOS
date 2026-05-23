import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Minus, ShoppingBag, CreditCard, Tag } from 'lucide-react';
import { CartItem, CashSession } from '@/types/Types_POS';

interface POSCartPanelProps {
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  taxEnabled?: boolean;
  taxRate?: number;
  currentSession: CashSession | null;
  loading: boolean;
  onRemoveFromCart: (productId: string) => void;
  onChangeQuantity: (productId: string, quantity: number) => void;
  canDiscount?: boolean;
  onApplyDiscount?: (productId: string, discountPct: number) => void;
  onPayment: () => void;
}

export const POSCartPanel: React.FC<POSCartPanelProps> = ({
  cartItems,
  subtotal,
  taxAmount,
  total,
  taxEnabled = true,
  taxRate = 0.13,
  currentSession,
  loading,
  onRemoveFromCart,
  onChangeQuantity,
  canDiscount,
  onApplyDiscount,
  onPayment,
}) => {
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const canPay = cartItems.length > 0 && currentSession?.status === 'open' && !loading;


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
    setDiscountInputs(prev => ({ ...prev, [productId]: value }));
    const pct = Math.min(100, Math.max(0, parseFloat(value) || 0));
    onApplyDiscount?.(productId, pct);
  };

  return (
    <div className="w-96 shrink-0 flex flex-col bg-white border-l-2 border-gray-200">

      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 bg-white shrink-0">
        <ShoppingBag size={20} className="text-emerald-500" />
        <h2 className="text-gray-900 font-black text-lg">Carrito</h2>
        {cartItems.length > 0 && (
          <span className="ml-auto bg-emerald-500 text-white text-sm font-black w-7 h-7 rounded-full flex items-center justify-center">
            {cartItems.length}
          </span>
        )}
      </div>

      {/* ── Items ── */}
      <div className="flex-1 overflow-y-auto pos-scroll">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-10">
            <ShoppingBag size={64} className="text-gray-200" />
            <p className="text-xl font-semibold text-center text-gray-400 leading-snug">
              El carrito está vacío.<br />Toca un producto para agregar.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 px-5 py-2">
            {cartItems.map((item) => {
              const hasDiscount = (item.discount_percent ?? 0) > 0;
              const hasPromo    = !!item.promo;
              const originalSubtotal = item.unit_price * item.quantity;
              const showOriginal = hasDiscount || hasPromo;

              return (
              <li key={item.product_id} className="py-3">
                {/* Name row */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-900 text-sm font-bold leading-snug">
                      {item.product.name}
                    </span>
                    {/* Promo badge */}
                    {hasPromo && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-xs bg-violet-100 text-violet-700 font-bold px-1.5 py-0.5 rounded">
                        <Tag size={10} /> {item.promo!.type === '2x1' ? '2×1' : item.promo!.type === 'percentage' ? `${item.promo!.value}% desc.` : `-₡${item.promo!.value}`}
                      </span>
                    )}
                  </div>
                  <button
                    onPointerDown={() => onRemoveFromCart(item.product_id)}
                    className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-500 flex items-center justify-center transition shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Discount input (only when canDiscount and no promo active) */}
                {canDiscount && !hasPromo && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-gray-400 font-medium">Descuento %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={discountInputs[item.product_id] ?? (item.discount_percent ? String(item.discount_percent) : '')}
                      onChange={e => handleDiscountChange(item.product_id, e.target.value)}
                      placeholder="0"
                      className="w-24 text-center border border-gray-200 rounded-lg px-2 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    {hasDiscount && (
                      <span className="text-sm text-emerald-600 font-semibold">
                        -{item.discount_percent}%
                      </span>
                    )}
                  </div>
                )}

                {/* Controls + price */}
                <div className="flex items-center justify-between gap-2">
                  {/* Qty controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onPointerDown={() => onChangeQuantity(item.product_id, item.quantity - 1)}
                      className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 active:scale-90 text-gray-700 flex items-center justify-center transition"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-10 text-center text-gray-900 font-black text-xl select-none">
                      {item.quantity}
                    </span>
                    <button
                      onPointerDown={() => onChangeQuantity(item.product_id, item.quantity + 1)}
                      className="w-10 h-10 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 active:scale-90 text-white flex items-center justify-center transition"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  {/* Price */}
                  <div className="text-right">
                    <p className="text-gray-400 text-xs font-medium">
                      ₡{item.unit_price.toLocaleString()} c/u
                    </p>
                    {showOriginal && (
                      <p className="text-gray-300 text-xs line-through">
                        ₡{originalSubtotal.toLocaleString()}
                      </p>
                    )}
                    <p className={`font-black text-base ${showOriginal ? 'text-violet-600' : 'text-emerald-600'}`}>
                      ₡{item.subtotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Totals ── */}
      <div className="border-t-2 border-gray-100 px-4 py-3 bg-gray-50 shrink-0 space-y-1.5">
        {/* Show gross subtotal and discount line if any item has a discount or promo */}
        {(() => {
          const grossSubtotal = Math.round(cartItems.reduce((s, i) => s + i.unit_price * i.quantity, 0));
          const totalDiscount = grossSubtotal - subtotal;
          if (totalDiscount > 0) {
            return (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-xs font-medium">Precio original</span>
                  <span className="text-gray-400 text-xs line-through">₡{grossSubtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-violet-600 text-xs font-semibold">Descuentos / Promos</span>
                  <span className="text-violet-600 text-xs font-semibold">-₡{totalDiscount.toLocaleString()}</span>
                </div>
              </>
            );
          }
          return null;
        })()}
        {taxEnabled && taxAmount > 0 && (
          <>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm font-semibold">Subtotal</span>
              <span className="text-gray-800 text-sm font-bold">₡{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm font-semibold">
                IVA ({(taxRate * 100).toFixed(0)}%)
              </span>
              <span className="text-gray-800 text-sm font-bold">₡{taxAmount.toLocaleString()}</span>
            </div>
          </>
        )}
        <div className="flex justify-between items-center pt-2 border-t-2 border-gray-200">
          <span className="text-gray-900 font-black text-lg">Total</span>
          <span className="text-emerald-600 font-black text-2xl">₡{total.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Pay button ── */}
      <div className="px-3 py-3 bg-white border-t border-gray-200 shrink-0">
        {!currentSession ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 text-center">
            <p className="text-amber-700 text-sm font-bold">
              Abre la caja para cobrar
            </p>
          </div>
        ) : currentSession.status !== 'open' ? (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2 text-center">
            <p className="text-red-700 text-sm font-bold">
              La caja está cerrada
            </p>
          </div>
        ) : null}
        <button
          onClick={handlePaymentClick}
          disabled={!canPay}
          className={`
            w-full h-16 flex items-center justify-center gap-2 font-black text-xl rounded-xl transition
            ${canPay
              ? 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 active:scale-[0.98] text-white shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          <CreditCard size={24} />
          {loading ? 'Procesando...' : 'Cobrar'}
        </button>
      </div>
    </div>
  );
};
