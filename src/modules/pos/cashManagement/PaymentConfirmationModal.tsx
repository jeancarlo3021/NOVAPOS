'use client';

import React, { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X, ChevronRight, Layers } from 'lucide-react';
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

export interface PaymentSplit {
  method: 'cash' | 'card' | 'sinpe';
  amount: number;
  voucher_number?: string;
}

export interface PaymentData {
  paymentMethod: 'cash' | 'card' | 'sinpe';
  amountReceived?: number;
  change?: number;
  voucherNumber?: string;
  /** Si es pago mixto: array de splits. La suma debe igualar `total`. */
  payments?: PaymentSplit[];
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
  // Modo mixto estilo Eleventa: un monto por cada método disponible.
  const [isMixed, setIsMixed] = useState(false);
  const [mixed, setMixed] = useState<Record<string, string>>({});

  const mixedAmount = (id: string) => parseFloat(mixed[id] || '') || 0;
  const mixedTotal = availableMethods.reduce((s, m) => s + mixedAmount(m.id), 0);
  const mixedDiff  = Math.round((total - mixedTotal) * 100) / 100;  // >0 falta, <0 sobra (vuelto)
  // Válido: la suma cubre el total (puede sobrar = vuelto en efectivo).
  const mixedValid = mixedTotal >= total - 0.5;

  const receivedNum = parseFloat(received) || 0;
  const change = receivedNum - total;
  const cashOk = method !== 'cash' || receivedNum >= total;

  const applyQuick = (amount: number) => {
    setReceived(String(amount));
    setError('');
  };

  const handleConfirm = () => {
    if (isMixed) {
      if (!mixedValid) {
        setError(`Falta cubrir ₡${mixedDiff.toLocaleString('es-CR')}`);
        return;
      }
      // Solo métodos con monto > 0
      const splits = availableMethods
        .filter(m => mixedAmount(m.id) > 0)
        .map(m => ({ method: m.id, amount: mixedAmount(m.id) }));

      // El método dominante (mayor monto) para reportes legacy.
      const dominant = [...splits].sort((a, b) => b.amount - a.amount)[0];
      const cashAmt = mixedAmount('cash');
      onConfirm({
        paymentMethod: dominant.method,
        amountReceived: cashAmt > 0 ? cashAmt : undefined,
        // Si sobra, el excedente se asume vuelto en efectivo.
        change: mixedDiff < 0 ? Math.abs(mixedDiff) : 0,
        payments: splits,
      });
      return;
    }

    if (method === 'cash' && receivedNum < total) {
      setError('El monto recibido es menor al total');
      return;
    }
    // Comprobante de tarjeta/SINPE es opcional.
    onConfirm({
      paymentMethod: method,
      amountReceived: method === 'cash' ? receivedNum : undefined,
      change: method === 'cash' ? Math.max(0, change) : undefined,
      voucherNumber: voucherNumber.trim() || undefined,
    });
  };

  // Autocompleta el método con el saldo restante (botón "resto").
  const fillRest = (id: string) => {
    const others = availableMethods.reduce((s, m) => m.id === id ? s : s + mixedAmount(m.id), 0);
    const rest = Math.max(0, Math.round((total - others) * 100) / 100);
    setMixed(prev => ({ ...prev, [id]: String(rest) }));
    setError('');
  };

  const showTax = taxEnabled && taxAmount > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-3">
      <div className="bg-gray-50 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2.5 sm:py-4 flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-2xl bg-blue-500 flex items-center justify-center shrink-0">
            <CreditCard size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-gray-900 font-black text-lg sm:text-2xl leading-tight">Procesar Pago</h2>
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
            {/* Toggle Único / Mixto */}
            {availableMethods.length > 1 && (
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                <button onPointerDown={() => { setIsMixed(false); setError(''); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-black transition ${
                    !isMixed ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
                  }`}>
                  Pago único
                </button>
                <button onPointerDown={() => { setIsMixed(true); setError(''); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-black transition flex items-center justify-center gap-1.5 ${
                    isMixed ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
                  }`}>
                  <Layers size={14} /> Pago mixto
                </button>
              </div>
            )}

            {/* Método de pago — solo en modo único */}
            {!isMixed && (
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
            )}

            {/* ── Modo MIXTO (estilo Eleventa: un campo por método) ── */}
            {isMixed && (
              <div className="space-y-2.5">
                <p className="text-gray-500 text-xs font-black uppercase tracking-wider px-1">
                  ¿Con cuánto paga en cada uno?
                </p>
                {availableMethods.map((m) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.id} className="flex items-center gap-3 bg-white border-2 border-gray-200 rounded-2xl px-3 py-2.5">
                      <Icon size={22} className={m.iconIdleClass} />
                      <span className="font-black text-gray-700 w-20">{m.label}</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₡</span>
                        <input type="number" inputMode="decimal" min={0}
                          value={mixed[m.id] ?? ''}
                          onChange={e => { setMixed(prev => ({ ...prev, [m.id]: e.target.value })); setError(''); }}
                          placeholder="0"
                          className="w-full text-right text-xl font-black bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-violet-400 tabular-nums" />
                      </div>
                      <button type="button" onPointerDown={() => fillRest(m.id)}
                        title="Poner el resto aquí"
                        className="px-2.5 py-2 rounded-lg bg-violet-50 text-violet-700 text-xs font-black hover:bg-violet-100">
                        Resto
                      </button>
                    </div>
                  );
                })}

                {/* Resumen pagado / falta / vuelto */}
                <div className={`rounded-2xl px-4 py-3 ${
                  mixedTotal === 0    ? 'bg-gray-50 border-2 border-gray-200' :
                  mixedDiff > 0.5     ? 'bg-amber-50 border-2 border-amber-300' :
                                        'bg-emerald-50 border-2 border-emerald-300'
                }`}>
                  <div className="flex justify-between text-sm font-bold text-gray-600">
                    <span>Pagado</span>
                    <span className="tabular-nums">₡{mixedTotal.toLocaleString('es-CR')}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className={`text-sm font-black uppercase tracking-wider ${mixedDiff > 0.5 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {mixedDiff > 0.5 ? 'Falta' : mixedDiff < -0.5 ? 'Vuelto' : '✓ Exacto'}
                    </span>
                    <span className={`text-2xl font-black tabular-nums ${mixedDiff > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      ₡{Math.abs(mixedDiff).toLocaleString('es-CR')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Efectivo ── */}
            {!isMixed && method === 'cash' && (
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
            {!isMixed && method === 'sinpe' && (
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
                    placeholder="N° comprobante (opcional)"
                    className="w-full text-center text-3xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-violet-400 tracking-widest transition"
                  />
                </div>
              </div>
            )}

            {/* ── Tarjeta ── */}
            {!isMixed && method === 'card' && (
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
                    placeholder="N° comprobante (opcional)"
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
              disabled={loading || (isMixed ? !mixedValid : !cashOk)}
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
