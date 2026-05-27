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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2">
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
            <CreditCard size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-gray-900 font-black text-lg leading-tight">Procesar Pago</h2>
            <p className="text-gray-400 text-xs">{cartItems.length} producto{cartItems.length !== 1 ? 's' : ''} en el carrito</p>
          </div>
          <button
            onClick={onCancel}
            className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">

          {/* Subtotal / IVA — solo si hay impuesto */}
          {showTax && (
            <div className="bg-blue-500 rounded-xl px-4 py-2 flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-xs font-semibold">Subtotal</p>
                <p className="text-blue-100 text-xs font-semibold">IVA</p>
              </div>
              <div className="text-right">
                <p className="text-blue-100 text-xs">₡{subtotal.toLocaleString()}</p>
                <p className="text-blue-100 text-xs">₡{taxAmount.toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* Grand total */}
          <div className="bg-white border-2 border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-gray-700 text-base font-black">Total a cobrar</span>
            <span className="text-blue-600 text-3xl font-black">₡{total.toLocaleString()}</span>
          </div>

          {/* ── Método de pago ── */}
          <div>
            <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-2 px-1">Método de pago</p>
            <div className={`grid gap-2 ${availableMethods.length === 1 ? 'grid-cols-1' : availableMethods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {availableMethods.map((m) => {
                const Icon = m.icon;
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    onPointerDown={() => { setMethod(m.id); setError(''); setVoucherNumber(''); }}
                    className={`h-16 flex flex-col items-center justify-center gap-1 rounded-xl border-2 font-bold text-sm transition active:scale-95 ${
                      active ? m.activeClass : m.idleClass
                    }`}
                  >
                    <Icon size={20} className={active ? m.iconActiveClass : m.iconIdleClass} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Efectivo: monto recibido ── */}
          {method === 'cash' && (
            <div className="space-y-2">
              {/* Quick amounts */}
              <div>
                <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-1.5 px-1">Billetes rápidos</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {QUICK_AMOUNTS.map(amt => (
                    <button
                      key={amt}
                      onPointerDown={() => applyQuick(amt)}
                      className={`h-10 rounded-lg border-2 font-bold text-sm transition active:scale-95 ${
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
                <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-1 px-1">Monto recibido</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={received}
                  onChange={e => { setReceived(e.target.value); setError(''); }}
                  placeholder={`₡${total.toLocaleString()}`}
                  className="w-full text-right text-2xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-400 transition"
                />
              </div>

              {/* Change */}
              {receivedNum > 0 && (
                <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 border-2 ${
                  change >= 0
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-red-50 border-red-300'
                }`}>
                  <span className={`text-sm font-black ${change >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {change >= 0 ? 'Vuelto' : 'Falta'}
                  </span>
                  <span className={`text-2xl font-black ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ₡{Math.abs(change).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* SINPE — comprobante */}
          {method === 'sinpe' && (
            <div className="space-y-2">
              <div className="bg-violet-50 border-2 border-violet-200 rounded-xl px-3 py-2 text-center">
                <p className="text-violet-700 font-black text-sm">SINPE Móvil</p>
                <p className="text-violet-500 text-xs mt-0.5">Pide al cliente el comprobante</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-1 px-1">N° de comprobante</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={voucherNumber}
                  onChange={e => { setVoucherNumber(e.target.value); setError(''); }}
                  placeholder="Ej: 123456789"
                  className="w-full text-center text-2xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-400 tracking-widest transition"
                />
              </div>
            </div>
          )}

          {/* Tarjeta — comprobante */}
          {method === 'card' && (
            <div className="space-y-2">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl px-3 py-2 text-center">
                <p className="text-blue-700 font-black text-sm">Datáfono</p>
                <p className="text-blue-500 text-xs mt-0.5">Pasa la tarjeta e ingresa el comprobante</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-black uppercase tracking-wider mb-1 px-1">N° de comprobante</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={voucherNumber}
                  onChange={e => { setVoucherNumber(e.target.value); setError(''); }}
                  placeholder="Ej: 123456789"
                  className="w-full text-center text-2xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-400 tracking-widest transition"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 font-semibold text-sm rounded-xl px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t border-gray-200 px-3 py-3 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="h-12 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-50 active:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onPointerDown={handleConfirm}
              disabled={loading || !cashOk}
              className="h-12 rounded-xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm transition flex items-center justify-center gap-1 shadow-sm"
            >
              {loading ? 'Procesando...' : (
                <>Confirmar <ChevronRight size={18} /></>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
