'use client';

import React, { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X, ChevronRight } from 'lucide-react';
import { CartItem } from '@/types/Types_POS';

interface PaymentConfirmationModalProps {
  cartItems: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
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

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000];

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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center shrink-0">
            <CreditCard size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-gray-900 font-black text-2xl leading-tight">Procesar Pago</h2>
            <p className="text-gray-400 text-sm">{cartItems.length} producto{cartItems.length !== 1 ? 's' : ''} en el carrito</p>
          </div>
          <button
            onClick={onCancel}
            className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition text-gray-500"
          >
            <X size={22} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-6">

          {/* Total */}
          <div className="bg-blue-500 rounded-2xl px-6 py-3 flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-semibold">Subtotal</p>
              <p className="text-blue-100 text-sm font-semibold">IVA (13%)</p>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-sm">₡{subtotal.toLocaleString()}</p>
              <p className="text-blue-100 text-sm">₡{taxAmount.toLocaleString()}</p>
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl px-6 py-4 flex items-center justify-between">
            <span className="text-gray-700 text-xl font-black">Total a cobrar</span>
            <span className="text-blue-600 text-4xl font-black">₡{total.toLocaleString()}</span>
          </div>

          {/* ── Método de pago ── */}
          <div>
            <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-3 px-1">Método de pago</p>
            <div className={`grid gap-3 ${availableMethods.length === 1 ? 'grid-cols-1' : availableMethods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {availableMethods.map((m) => {
                const Icon = m.icon;
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    onPointerDown={() => { setMethod(m.id); setError(''); setVoucherNumber(''); }}
                    className={`h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 font-black text-lg transition active:scale-95 ${
                      active ? m.activeClass : m.idleClass
                    }`}
                  >
                    <Icon size={28} className={active ? m.iconActiveClass : m.iconIdleClass} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Efectivo: monto recibido ── */}
          {method === 'cash' && (
            <div className="space-y-4">
              {/* Quick amounts */}
              <div>
                <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-3 px-1">Billetes rápidos</p>
                <div className="grid grid-cols-4 gap-2">
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

              {/* Amount input */}
              <div>
                <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-2 px-1">Monto recibido</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={received}
                  onChange={e => { setReceived(e.target.value); setError(''); }}
                  placeholder={`₡${total.toLocaleString()}`}
                  className="w-full text-right text-3xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-emerald-400 transition"
                />
              </div>

              {/* Change */}
              {receivedNum > 0 && (
                <div className={`flex items-center justify-between rounded-2xl px-6 py-4 border-2 ${
                  change >= 0
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-red-50 border-red-300'
                }`}>
                  <span className={`text-lg font-black ${change >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {change >= 0 ? 'Vuelto' : 'Falta'}
                  </span>
                  <span className={`text-4xl font-black ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ₡{Math.abs(change).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* SINPE — comprobante */}
          {method === 'sinpe' && (
            <div className="space-y-3">
              <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl px-5 py-4 text-center">
                <p className="text-violet-700 font-black text-lg">SINPE Móvil</p>
                <p className="text-violet-500 text-base mt-1">Pide al cliente el comprobante e ingresa el número</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-2 px-1">N° de comprobante</p>
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

          {/* Tarjeta — comprobante */}
          {method === 'card' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-5 py-4 text-center">
                <p className="text-blue-700 font-black text-lg">Datáfono</p>
                <p className="text-blue-500 text-base mt-1">Pasa la tarjeta e ingresa el número de comprobante</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-2 px-1">N° de comprobante</p>
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

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 font-semibold text-base rounded-2xl px-5 py-4">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t border-gray-200 px-4 py-4 shrink-0">
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
              onPointerDown={handleConfirm}
              disabled={loading || !cashOk}
              className="h-16 rounded-2xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-lg transition flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? 'Procesando...' : (
                <>Confirmar <ChevronRight size={22} /></>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
