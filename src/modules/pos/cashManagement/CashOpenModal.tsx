'use client';

import React, { useState } from 'react';
import { DollarSign, X } from 'lucide-react';
import { cashSessionService } from '@/services/cashManagement/cashSessionsService';
import { CashSession } from '@/types/Types_POS';

interface CashOpenModalProps {
  tenantId: string;
  userId: string;
  onSuccess: (session: CashSession) => void;
  onCancel: () => void;
}

const DENOMINATIONS = [
  { value: 50000, label: '₡50.000', type: 'billete' },
  { value: 20000, label: '₡20.000', type: 'billete' },
  { value: 10000, label: '₡10.000', type: 'billete' },
  { value: 5000,  label: '₡5.000',  type: 'billete' },
  { value: 2000,  label: '₡2.000',  type: 'billete' },
  { value: 1000,  label: '₡1.000',  type: 'billete' },
  { value: 500,   label: '₡500',    type: 'moneda'  },
  { value: 100,   label: '₡100',    type: 'moneda'  },
  { value: 50,    label: '₡50',     type: 'moneda'  },
  { value: 25,    label: '₡25',     type: 'moneda'  },
  { value: 10,    label: '₡10',     type: 'moneda'  },
];

export const CashOpenModal: React.FC<CashOpenModalProps> = ({
  tenantId,
  userId,
  onSuccess,
  onCancel,
}) => {
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map(d => [d.value, 0]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (value: number, qty: number) =>
    setQuantities(prev => ({ ...prev, [value]: Math.max(0, qty) }));

  const totalAmount = DENOMINATIONS.reduce(
    (sum, d) => sum + d.value * (quantities[d.value] ?? 0), 0
  );

  const billetes = DENOMINATIONS.filter(d => d.type === 'billete');
  const monedas  = DENOMINATIONS.filter(d => d.type === 'moneda');

  const handleConfirm = async () => {
    if (totalAmount <= 0) { setError('Ingresa al menos una denominación'); return; }
    setLoading(true);
    setError('');
    try {
      const session = await cashSessionService.createCashSession({
        tenant_id: tenantId,
        user_id: userId,
        opening_amount: totalAmount,
      });
      onSuccess(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir caja');
    } finally {
      setLoading(false);
    }
  };

  const DenomCard = ({ d }: { d: typeof DENOMINATIONS[0] }) => {
    const qty = quantities[d.value] ?? 0;
    const subtotal = d.value * qty;
    const active = qty > 0;

    return (
      <div
        className={`rounded-2xl border-2 p-4 flex flex-col gap-3 transition-all select-none ${
          active
            ? 'bg-emerald-50 border-emerald-400 shadow-sm'
            : 'bg-white border-gray-200'
        }`}
      >
        {/* Top: label + subtotal */}
        <div className="flex items-center justify-between min-h-[28px]">
          <span className={`text-xl font-black leading-none ${active ? 'text-emerald-700' : 'text-gray-800'}`}>
            {d.label}
          </span>
          <span className={`text-base font-bold transition-opacity ${active ? 'text-emerald-600 opacity-100' : 'opacity-0'}`}>
            ₡{subtotal.toLocaleString()}
          </span>
        </div>

        {/* Counter row */}
        <div className="flex items-center gap-2">
          {/* − button */}
          <button
            type="button"
            onPointerDown={() => set(d.value, qty - 1)}
            disabled={qty === 0}
            className={`h-14 w-14 rounded-xl flex items-center justify-center text-3xl font-black transition active:scale-90 shrink-0 ${
              qty > 0
                ? 'bg-red-500 text-white shadow-sm active:bg-red-600'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
          >
            −
          </button>

          {/* Quantity */}
          <span className={`flex-1 text-center text-5xl font-black leading-none transition ${
            active ? 'text-emerald-600' : 'text-gray-200'
          }`}>
            {qty}
          </span>

          {/* + button */}
          <button
            type="button"
            onPointerDown={() => set(d.value, qty + 1)}
            className="h-14 w-14 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 active:scale-90 text-white flex items-center justify-center text-3xl font-black transition shrink-0 shadow-sm"
          >
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
            <DollarSign size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-gray-900 font-black text-2xl leading-tight">Apertura de Caja</h2>
            <p className="text-gray-400 text-sm">Cuenta el efectivo y toca + para cada denominación</p>
          </div>
          <button
            onClick={onCancel}
            className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition text-gray-500"
          >
            <X size={22} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 font-semibold text-base rounded-2xl px-5 py-4">
              {error}
            </div>
          )}

          {/* Billetes */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">💵</span>
              <h3 className="text-lg font-black text-gray-700 uppercase tracking-wide">Billetes</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {billetes.map(d => <DenomCard key={d.value} d={d} />)}
            </div>
          </section>

          {/* Monedas */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🪙</span>
              <h3 className="text-lg font-black text-gray-700 uppercase tracking-wide">Monedas</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {monedas.map(d => <DenomCard key={d.value} d={d} />)}
            </div>
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t border-gray-200 px-6 py-5 shrink-0 space-y-4">
          {/* Total */}
          <div className="flex items-center justify-between bg-emerald-500 rounded-2xl px-6 py-4">
            <span className="text-emerald-100 text-lg font-bold">Total en caja</span>
            <span className="text-white text-4xl font-black">₡{totalAmount.toLocaleString()}</span>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="h-16 rounded-2xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-lg hover:bg-gray-50 active:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || totalAmount <= 0}
              className="h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-lg transition shadow-sm"
            >
              {loading ? 'Abriendo...' : 'Abrir Caja ✓'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
