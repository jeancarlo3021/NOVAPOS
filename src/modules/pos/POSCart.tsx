import React from 'react';
import { Trash2, Plus, Minus } from 'lucide-react';
import { CartItem } from '@/types/Types_POS';
import { CashSession } from '@/types/Types_POS';

interface POSCartPanelProps {
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currentSession: CashSession | null;
  loading: boolean;
  onRemoveFromCart: (productId: string) => void;
  onChangeQuantity: (productId: string, quantity: number) => void;
  onPayment: () => void;
}

export const POSCartPanel: React.FC<POSCartPanelProps> = ({
  cartItems,
  subtotal,
  taxAmount,
  total,
  currentSession,
  loading,
  onRemoveFromCart,
  onChangeQuantity,
  onPayment,
}) => {
  return (
    <div className="w-80 flex flex-col bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-lg font-bold text-white">Carrito</h2>
        <p className="text-sm text-slate-400">{cartItems.length} artículos</p>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cartItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500">
            <p>Carrito vacío</p>
          </div>
        ) : (
          cartItems.map((item) => (
            <div
              key={item.product_id}
              className="bg-slate-800 border border-slate-700 rounded p-3"
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-sm font-semibold text-white">{item.product.name}</h4>
                <button
                  onClick={() => onRemoveFromCart(item.product_id)}
                  className="text-red-400 hover:text-red-300 transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">
                  ${item.unit_price?.toFixed(2)} c/u
                </span>
                <span className="text-sm font-bold text-blue-400">
                  ${(item.unit_price * item.quantity).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    onChangeQuantity(item.product_id, Math.max(1, item.quantity - 1))
                  }
                  className="bg-slate-700 hover:bg-slate-600 text-white p-1 rounded transition"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    onChangeQuantity(item.product_id, Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-center text-sm"
                />
                <button
                  onClick={() => onChangeQuantity(item.product_id, item.quantity + 1)}
                  className="bg-slate-700 hover:bg-slate-600 text-white p-1 rounded transition"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      <div className="border-t border-slate-800 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Subtotal:</span>
          <span className="text-white">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Impuesto:</span>
          <span className="text-white">${taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold border-t border-slate-700 pt-2 mt-2">
          <span className="text-white">Total:</span>
          <span className="text-blue-400">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-slate-800 space-y-2">
        <button
          onClick={onPayment}
          disabled={cartItems.length === 0 || !currentSession || loading}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded transition"
        >
          {loading ? 'Procesando...' : 'Procesar Pago'}
        </button>
        <p className="text-xs text-slate-500 text-center">
          {!currentSession && '⚠️ Abre una caja para continuar'}
        </p>
      </div>
    </div>
  );
};