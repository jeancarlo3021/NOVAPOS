'use client';

import React, { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X, ChevronRight } from 'lucide-react';
import { CartItem } from '@/types/Types_POS';

interface PaymentConfirmationModalProps {
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  taxEnabled?: boolean;
  onConfirm: (paymentData: PaymentData) => void;
  onCancel: () => void;
  loading?: boolean;
  allowCard?: boolean;
  allowSinpe?: boolean;
}

export interface PaymentData {
  paymentMethod: 'cash' | 'card' | 'sinpe';
  amountReceived?: number;
  change?: number;
  voucherNumber?: string;
}

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000];

const METHODS = [
  {
    id: 'cash' as const,
    label: 'Efectivo',
    icon: Banknote,
    activeClass: 'bg-emerald-500 border-emerald-500 text-white',
    iconActiveClass: 'text-white',
    idleClass: 'bg-white border-gray-200 text-gray-700',
    iconIdleClass: 'text-emerald-500',
  },
  {
    id: 'card' as const,
    label: 'Tarjeta',
    icon: CreditCard,
    activeClass: 'bg-blue-500 border-blue-500 text-white',
    iconActiveClass: 'text-white',
    idleClass: 'bg-white border-gray-200 text-gray-700',
    iconIdleClass: 'text-blue-500',
  },
  {
    id: 'sinpe' as const,
    label: 'SINPE',
    icon: Smartphone,
    activeClass: 'bg-violet-500 border-violet-500 text-white',
    iconActiveClass: 'text-white',
    idleClass: 'bg-white border-gray-200 text-gray-700',
    iconIdleClass: 'text-violet-500',
  },
] as const;

export const PaymentConfirmationModal: React.FC<PaymentConfirmationModalProps> = ({
  subtotal,
  taxAmount,
  total,
  taxEnabled = true,
  cartItems,
  onConfirm,
  onCancel,
  loading = false,
  allowCard = true,
  allowSinpe = true,
}) => {
  const availableMethods = METHODS.filter(m =>
    m.id === 'cash' || (m.id === 'card' && allowCard) || (m.id === 'sinpe' && allowSinpe)
  );

  const [method, setMethod] = useState<'cash' | 'card' | 'sinpe'>(availableMethods[0]?.id ?? 'cash');
  const [received, setReceived] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [error, setError] = useState('');

  const receivedNum = parseFloat(received) || 0;
  const change = receivedNum - total;
  const cashOk = method !== 'cash' || receivedNum >= total;

  const applyQuick = (amount: number) => {
    setReceived(String(amount));
    setError('');
  };

  const handleConfirm = () => {
    if (method === 'cash' && receivedNum < total) {
      setError('El monto recibido es menor al total');
      return;
    }
    if ((method === 'card' || method === 'sinpe') && !voucherNumber.trim()) {
      setError('Ingresa el número de comprobante');
      return;
    }
    onConfirm({
      paymentMethod: method,
      amountReceived: method === 'cash' ? receivedNum : undefined,
      change: method === 'cash' ? Math.max(0, change) : undefined,
      voucherNumber: voucherNumber.trim() || undefined,
    });
  };

  const showTax = taxEnabled && taxAmount > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center shrink-0">
            <CreditCard size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-gray-900 font-black text-2xl leading-tight">Procesar Pago</h2>
            <p className="text-gray-500 text-sm">{cartItems.length} producto{cartItems.length !== 1 ? 's' : ''} en el carrito</p>
          </div>
          <button
            onClick={onCancel}
            className="w-11 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition text-gray-500"
          >
            <X size={22} />
          </button>
        </div>

        {/* ── Body — 2 columnas en pantallas ≥ md ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 md:grid-cols-5 gap-5">

          {/* ─── Columna izquierda: resumen del cobro ─── */}
          <div className="md:col-span-2 space-y-4">
            {showTax && (
              <div className="bg-linear-to-br from-blue-500 to-blue-600 rounded-2xl px-5 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-blue-100 text-sm font-semibold">Subtotal</span>
                  <span className="text-white text-base font-bold tabular-nums">₡{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-blue-100 text-sm font-semibold">IVA</span>
                  <span className="text-white text-base font-bold tabular-nums">₡{taxAmount.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Total — grande */}
            <div className="bg-white border-4 border-blue-500 rounded-2xl px-5 py-6 shadow-md">
              <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-1">Total a cobrar</p>
              <p
                className="text-blue-600 font-black tabular-nums leading-none"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)' }}
              >
                ₡{total.toLocaleString()}
              </p>
            </div>

            {/* Vuelto destacado en columna izquierda cuando se está pagando en efectivo */}
            {method === 'cash' && receivedNum > 0 && (
              <div className={`rounded-2xl px-5 py-4 border-2 ${
                change >= 0
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-red-50 border-red-300'
              }`}>
                <p className={`text-xs font-black uppercase tracking-wider ${change >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {change >= 0 ? 'Vuelto' : 'Falta'}
                </p>
                <p className={`font-black tabular-nums leading-none mt-1 ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                   style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
                  ₡{Math.abs(change).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* ─── Columna derecha: método + entrada ─── */}
          <div className="md:col-span-3 space-y-4">
            {/* Método de pago */}
            <div>
              <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-2 px-1">Método de pago</p>
              <div className={`grid gap-3 ${availableMethods.length === 1 ? 'grid-cols-1' : availableMethods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {availableMethods.map((m) => {
                  const Icon = m.icon;
                  const active = method === m.id;
                  return (
                    <button
                      key={m.id}
                      onPointerDown={() => { setMethod(m.id); setError(''); setVoucherNumber(''); }}
                      className={`h-24 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 font-black text-base transition active:scale-95 ${
                        active ? m.activeClass : m.idleClass
                      }`}
                    >
                      <Icon size={32} className={active ? m.iconActiveClass : m.iconIdleClass} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Efectivo ── */}
            {method === 'cash' && (
              <div className="space-y-3">
                <div>
                  <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-2 px-1">Billetes rápidos</p>
                  <div className="grid grid-cols-5 gap-2">
                    {QUICK_AMOUNTS.map(amt => (
                      <button
                        key={amt}
                        onPointerDown={() => applyQuick(amt)}
                        className={`h-14 rounded-xl border-2 font-black text-base transition active:scale-95 ${
                          receivedNum === amt
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'
                        }`}
                      >
                        ₡{(amt / 1000).toFixed(0)}k
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-2 px-1">Monto recibido</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={received}
                    onChange={e => { setReceived(e.target.value); setError(''); }}
                    placeholder={`₡${total.toLocaleString()}`}
                    className="w-full text-right text-4xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-emerald-400 transition tabular-nums"
                  />
                </div>
              </div>
            )}

            {/* ── SINPE ── */}
            {method === 'sinpe' && (
              <div className="space-y-3">
                <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl px-4 py-3 text-center">
                  <p className="text-violet-700 font-black text-base">SINPE Móvil</p>
                  <p className="text-violet-500 text-sm mt-0.5">Pide al cliente el comprobante</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-2 px-1">N° de comprobante</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={voucherNumber}
                    onChange={e => { setVoucherNumber(e.target.value); setError(''); }}
                    placeholder="Ej: 123456789"
                    className="w-full text-center text-3xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-violet-400 tracking-widest transition"
                  />
                </div>
              </div>
            )}

            {/* ── Tarjeta ── */}
            {method === 'card' && (
              <div className="space-y-3">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-4 py-3 text-center">
                  <p className="text-blue-700 font-black text-base">Datáfono</p>
                  <p className="text-blue-500 text-sm mt-0.5">Pasa la tarjeta e ingresa el comprobante</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-2 px-1">N° de comprobante</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={voucherNumber}
                    onChange={e => { setVoucherNumber(e.target.value); setError(''); }}
                    placeholder="Ej: 123456789"
                    className="w-full text-center text-3xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-400 tracking-widest transition"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border-2 border-red-300 text-red-700 font-bold text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 shrink-0">
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="h-16 rounded-2xl border-2 border-gray-200 bg-white text-gray-600 font-black text-base hover:bg-gray-50 active:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onPointerDown={handleConfirm}
              disabled={loading || !cashOk}
              className="col-span-2 h-16 rounded-2xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-xl transition flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? 'Procesando...' : (
                <>Confirmar cobro <ChevronRight size={24} /></>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
