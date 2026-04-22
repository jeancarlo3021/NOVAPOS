import React, { useState } from 'react';
import { Trash2, Plus, Minus, ShoppingBag, CreditCard, Percent } from 'lucide-react';
import { CartItem, CashSession } from '@/types/Types_POS';

interface POSCartPanelProps {
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currentSession: CashSession | null;
  loading: boolean;
  canDiscount?: boolean;
  onRemoveFromCart: (productId: string) => void;
  onChangeQuantity: (productId: string, quantity: number) => void;
  onApplyDiscount?: (productId: string, discountPct: number) => void;
  onPayment: () => void;
}

export const POSCartPanel: React.FC<POSCartPanelProps> = ({
  cartItems,
  subtotal,
  taxAmount,
  total,
  currentSession,
  loading,
  canDiscount = false,
  onRemoveFromCart,
  onChangeQuantity,
  onApplyDiscount,
  onPayment,
}) => {
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const canPay = cartItems.length > 0 && !!currentSession && !loading;

  const handleDiscountChange = (productId: string, value: string) => {
    setDiscounts(prev => ({ ...prev, [productId]: value }));
    const pct = Math.min(100, Math.max(0, parseFloat(value) || 0));
    onApplyDiscount?.(productId, pct);
  };

  return (
    <div className="w-105 shrink-0 flex flex-col bg-white border-l-2 border-gray-200">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-3 bg-white shrink-0">
        <ShoppingBag size={22} className="text-emerald-500" />
        <h2 className="text-gray-900 font-black text-xl">Carrito</h2>
        {cartItems.length > 0 && (
          <span className="ml-auto bg-emerald-500 text-white text-sm font-black w-8 h-8 rounded-full flex items-center justify-center">
            {cartItems.length}
          </span>
        )}
      </div>

      {/* ── Items ── */}
      <div className="flex-1 overflow-y-auto">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-10">
            <ShoppingBag size={56} className="text-gray-200" />
            <p className="text-lg font-semibold text-center text-gray-400 leading-snug">
              El carrito está vacío.<br />Toca un producto para agregar.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 px-4 py-2">
            {cartItems.map((item) => (
              <li key={item.product_id} className="py-4">
                {/* Name row */}
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-gray-900 text-base font-black flex-1 leading-snug">
                    {item.product.name}
                  </span>
                  <button
                    onPointerDown={() => onRemoveFromCart(item.product_id)}
                    className="w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-500 flex items-center justify-center transition shrink-0"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* Controls + price */}
                <div className="flex items-center justify-between gap-3">
                  {/* Qty controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onPointerDown={() => onChangeQuantity(item.product_id, item.quantity - 1)}
                      className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 active:scale-90 text-gray-700 flex items-center justify-center transition"
                    >
                      <Minus size={20} />
                    </button>
                    <span className="w-12 text-center text-gray-900 font-black text-2xl select-none">
                      {item.quantity}
                    </span>
                    <button
                      onPointerDown={() => onChangeQuantity(item.product_id, item.quantity + 1)}
                      className="w-12 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 active:scale-90 text-white flex items-center justify-center transition"
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  {/* Price */}
                  <div className="text-right">
                    <p className="text-gray-400 text-sm font-medium">
                      ₡{item.unit_price.toLocaleString()} c/u
                    </p>
                    <p className="text-emerald-600 font-black text-xl">
                      ₡{item.subtotal.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Discount row — plan-gated */}
                {canDiscount && (
                  <div className="flex items-center gap-2 mt-2">
                    <Percent size={14} className="text-orange-400 shrink-0" />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={discounts[item.product_id] ?? (item.discount_percent ? String(item.discount_percent) : '')}
                      onChange={e => handleDiscountChange(item.product_id, e.target.value)}
                      placeholder="Descuento %"
                      className="w-full text-sm px-3 py-1.5 border border-orange-200 rounded-lg focus:outline-none focus:border-orange-400 bg-orange-50 text-orange-800 font-semibold"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Totals ── */}
      <div className="border-t-2 border-gray-100 px-5 py-4 bg-gray-50 shrink-0 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-base font-semibold">Subtotal</span>
          <span className="text-gray-800 text-base font-bold">₡{subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500 text-base font-semibold">IVA (13%)</span>
          <span className="text-gray-800 text-base font-bold">₡{taxAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t-2 border-gray-200">
          <span className="text-gray-900 font-black text-xl">Total</span>
          <span className="text-emerald-600 font-black text-3xl">₡{total.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Pay button ── */}
      <div className="px-4 py-4 bg-white border-t border-gray-200 shrink-0">
        {!currentSession && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-4 py-3 mb-3 text-center">
            <p className="text-amber-700 text-base font-bold">
              Abre la caja para cobrar
            </p>
          </div>
        )}
        <button
          onPointerDown={onPayment}
          disabled={!canPay}
          className={`
            w-full h-20 flex items-center justify-center gap-3 font-black text-2xl rounded-2xl transition
            ${canPay
              ? 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 active:scale-[0.98] text-white shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          <CreditCard size={28} />
          {loading ? 'Procesando...' : 'Cobrar'}
        </button>
      </div>
    </div>
  );
};
