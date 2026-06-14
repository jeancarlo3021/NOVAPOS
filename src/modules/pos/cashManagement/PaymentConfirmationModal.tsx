'use client';

import React, { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X, ChevronRight, Plus, Trash2, Layers } from 'lucide-react';
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
  // Modo mixto: lista de splits. Solo se usa cuando isMixed = true.
  const [isMixed, setIsMixed] = useState(false);
  const [splits, setSplits] = useState<PaymentSplit[]>([
    { method: 'cash', amount: 0 },
    { method: availableMethods[1]?.id ?? 'card', amount: 0 },
  ]);

  const splitsTotal = splits.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const splitsDiff  = Math.round((total - splitsTotal) * 100) / 100;
  // Comprobante opcional: solo exigimos monto > 0 y que la suma cuadre.
  const splitsValid = splits.every(s => s.amount > 0) && Math.abs(splitsDiff) < 0.5;

  const receivedNum = parseFloat(received) || 0;
  const change = receivedNum - total;
  const cashOk = method !== 'cash' || receivedNum >= total;

  const applyQuick = (amount: number) => {
    setReceived(String(amount));
    setError('');
  };

  const handleConfirm = () => {
    if (isMixed) {
      if (!splitsValid) {
        if (Math.abs(splitsDiff) >= 0.5) setError(`La suma de los pagos no iguala el total. Faltan ₡${splitsDiff.toLocaleString('es-CR')}`);
        else setError('Cada pago debe tener un monto mayor a 0');
        return;
      }
      // El "paymentMethod" principal es el de mayor monto (para reportes legacy)
      const sortedByAmount = [...splits].sort((a, b) => b.amount - a.amount);
      const dominant = sortedByAmount[0];
      const cashSplit = splits.find(s => s.method === 'cash');
      onConfirm({
        paymentMethod: dominant.method,
        amountReceived: cashSplit?.amount,
        change: 0,  // el vuelto en mixto se asume 0 (el cliente trae el exacto)
        voucherNumber: splits.filter(s => s.method !== 'cash').map(s => s.voucher_number).join(','),
        payments: splits.map(s => ({
          method: s.method,
          amount: Number(s.amount),
          voucher_number: s.voucher_number?.trim() || undefined,
        })),
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

  // Helpers para splits
  const addSplit = () => setSplits(prev => [...prev, { method: availableMethods[0]?.id ?? 'cash', amount: 0 }]);
  const removeSplit = (i: number) => setSplits(prev => prev.filter((_, idx) => idx !== i));
  const updateSplit = (i: number, patch: Partial<PaymentSplit>) =>
    setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const autoBalance = (i: number) => {
    // Setea el monto de este split para que la suma cierre con el total
    const otherSum = splits.reduce((s, p, idx) => idx === i ? s : s + (Number(p.amount) || 0), 0);
    const diff = total - otherSum;
    updateSplit(i, { amount: Math.max(0, Math.round(diff * 100) / 100) });
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

            {/* ── Modo MIXTO ── */}
            {isMixed && (
              <div className="space-y-2">
                <p className="text-gray-500 text-xs font-black uppercase tracking-wider px-1">
                  Pagos parciales — deben sumar ₡{total.toLocaleString('es-CR')}
                </p>
                {splits.map((s, i) => {
                  const meta = METHODS.find(m => m.id === s.method)!;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="bg-white border-2 border-gray-200 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon size={18} className={meta.iconIdleClass} />
                        <select value={s.method} onChange={e => updateSplit(i, { method: e.target.value as any, voucher_number: '' })}
                          className="font-bold text-sm bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
                          {availableMethods.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                        <input type="number" inputMode="decimal" min={0} value={s.amount || ''}
                          onChange={e => updateSplit(i, { amount: parseFloat(e.target.value) || 0 })}
                          placeholder="Monto"
                          className="flex-1 text-right text-lg font-black bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                        <button type="button" onPointerDown={() => autoBalance(i)}
                          title="Llenar con el saldo restante"
                          className="px-2 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold hover:bg-violet-100">
                          =
                        </button>
                        {splits.length > 1 && (
                          <button type="button" onPointerDown={() => removeSplit(i)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      {(s.method === 'card' || s.method === 'sinpe') && (
                        <input type="text" inputMode="numeric" value={s.voucher_number ?? ''}
                          onChange={e => updateSplit(i, { voucher_number: e.target.value })}
                          placeholder="N° de comprobante (opcional)"
                          className="w-full text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-400" />
                      )}
                    </div>
                  );
                })}

                <button type="button" onPointerDown={addSplit}
                  className="w-full py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm font-bold hover:border-violet-400 hover:text-violet-700 flex items-center justify-center gap-1.5">
                  <Plus size={14} /> Agregar pago
                </button>

                {/* Resumen suma vs total */}
                <div className={`rounded-xl px-4 py-3 text-sm font-black ${
                  Math.abs(splitsDiff) < 0.5 ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-300' :
                  splitsDiff > 0           ? 'bg-amber-50 text-amber-800 border-2 border-amber-300'   :
                                              'bg-red-50 text-red-800 border-2 border-red-300'
                }`}>
                  <div className="flex justify-between">
                    <span>Suma de pagos:</span>
                    <span className="tabular-nums">₡{splitsTotal.toLocaleString('es-CR')}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold mt-0.5 opacity-80">
                    <span>{Math.abs(splitsDiff) < 0.5 ? '✓ Cuadra' : splitsDiff > 0 ? `Falta ₡${splitsDiff.toLocaleString('es-CR')}` : `Sobra ₡${Math.abs(splitsDiff).toLocaleString('es-CR')}`}</span>
                    <span>Total: ₡{total.toLocaleString('es-CR')}</span>
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
              disabled={loading || (isMixed ? !splitsValid : !cashOk)}
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
