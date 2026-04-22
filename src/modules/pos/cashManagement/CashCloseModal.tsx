'use client';

import React, { useState } from 'react';
import { LockKeyhole, X, TrendingUp, TrendingDown, Plus, Trash2, CreditCard, Smartphone, Banknote } from 'lucide-react';
import { cashSessionService } from '@/services/cashManagement/cashSessionsService';
import { CashSession } from '@/types/Types_POS';

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
  { value: 5,     label: '₡5',      type: 'moneda'  },
];

type Tab = 'cash' | 'card' | 'sinpe';

interface SinpeEntry {
  id: number;
  reference: string;
  amount: string;
}

interface CashCloseModalProps {
  session: CashSession;
  onSuccess: (session: CashSession) => void;
  onCancel: () => void;
}

export const CashCloseModal: React.FC<CashCloseModalProps> = ({ session, onSuccess, onCancel }) => {
  const [activeTab, setActiveTab] = useState<Tab>('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Efectivo ──
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(DENOMINATIONS.map(d => [d.value, 0]))
  );

  // ── Tarjeta ──
  const [cardAmount, setCardAmount] = useState('');

  // ── SINPE ──
  const [sinpeEntries, setSinpeEntries] = useState<SinpeEntry[]>([
    { id: Date.now(), reference: '', amount: '' },
  ]);

  // ── Totals ──
  const cashTotal = DENOMINATIONS.reduce((s, d) => s + d.value * (quantities[d.value] ?? 0), 0);
  const cardTotal = parseFloat(cardAmount) || 0;
  const sinpeTotal = sinpeEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const grandTotal = cashTotal + cardTotal + sinpeTotal;
  const difference = grandTotal - session.opening_amount;

  // ── Denomination helpers ──
  const setQty = (value: number, qty: number) =>
    setQuantities(prev => ({ ...prev, [value]: Math.max(0, qty) }));

  const billetes = DENOMINATIONS.filter(d => d.type === 'billete');
  const monedas  = DENOMINATIONS.filter(d => d.type === 'moneda');

  // ── SINPE helpers ──
  const addSinpe = () =>
    setSinpeEntries(prev => [...prev, { id: Date.now(), reference: '', amount: '' }]);

  const removeSinpe = (id: number) =>
    setSinpeEntries(prev => prev.filter(e => e.id !== id));

  const updateSinpe = (id: number, field: 'reference' | 'amount', value: string) =>
    setSinpeEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  // ── Submit ──
  const handleConfirm = async () => {
    if (grandTotal <= 0) { setError('El total debe ser mayor a ₡0'); return; }
    setLoading(true);
    setError('');
    try {
      const breakdown = JSON.stringify({ cash: cashTotal, card: cardTotal, sinpe: sinpeTotal, sinpeEntries });
      const updatedSession = await cashSessionService.closeCashSession({
        id: session.id,
        closing_amount: grandTotal,
        notes: `Desglose: ${breakdown}`,
      });
      onSuccess(updatedSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar caja');
    } finally {
      setLoading(false);
    }
  };

  // ── Difference badge ──
  const diffState = grandTotal === 0 ? null : difference === 0 ? 'exact' : difference > 0 ? 'over' : 'under';

  const DenomCard = ({ d }: { d: typeof DENOMINATIONS[0] }) => {
    const qty = quantities[d.value] ?? 0;
    const active = qty > 0;
    return (
      <div className={`rounded-2xl border-2 p-3 flex flex-col gap-2 transition-all select-none ${active ? 'bg-rose-50 border-rose-400 shadow-sm' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between min-h-[24px]">
          <span className={`text-lg font-black leading-none ${active ? 'text-rose-700' : 'text-gray-800'}`}>{d.label}</span>
          <span className={`text-sm font-bold transition-opacity ${active ? 'text-rose-600 opacity-100' : 'opacity-0'}`}>
            ₡{(d.value * qty).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onPointerDown={() => setQty(d.value, qty - 1)} disabled={qty === 0}
            className={`h-12 w-12 rounded-xl flex items-center justify-center text-2xl font-black transition active:scale-90 shrink-0 ${qty > 0 ? 'bg-red-500 text-white shadow-sm' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>−</button>
          <span className={`flex-1 text-center text-4xl font-black leading-none ${active ? 'text-rose-600' : 'text-gray-200'}`}>{qty}</span>
          <button type="button" onPointerDown={() => setQty(d.value, qty + 1)}
            className="h-12 w-12 rounded-xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 active:scale-90 text-white flex items-center justify-center text-2xl font-black transition shrink-0 shadow-sm">+</button>
        </div>
      </div>
    );
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode; total: number; color: string }[] = [
    { id: 'cash',  label: 'Efectivo',  icon: <Banknote size={18} />,    total: cashTotal,  color: 'emerald' },
    { id: 'card',  label: 'Tarjeta',   icon: <CreditCard size={18} />,  total: cardTotal,  color: 'blue' },
    { id: 'sinpe', label: 'SINPE',     icon: <Smartphone size={18} />,  total: sinpeTotal, color: 'violet' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-rose-500 flex items-center justify-center shrink-0">
            <LockKeyhole size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-gray-900 font-black text-2xl leading-tight">Cierre de Caja</h2>
            <p className="text-gray-400 text-sm">Ingresa los montos por método de pago</p>
          </div>
          <button onClick={onCancel} className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition text-gray-500">
            <X size={22} />
          </button>
        </div>

        {/* ── Session summary ── */}
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 shrink-0 flex-wrap">
          <div className="text-sm text-gray-500">Monto de apertura: <span className="font-black text-gray-800">₡{session.opening_amount.toLocaleString()}</span></div>
          <div className="flex-1" />
          {TABS.map(t => (
            <div key={t.id} className="text-sm text-gray-500">
              {t.label}: <span className="font-black text-gray-800">₡{t.total.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="bg-white border-b border-gray-200 px-6 flex gap-2 shrink-0">
          {TABS.map(t => (
            <button key={t.id} onPointerDown={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-sm border-b-2 transition whitespace-nowrap ${
                activeTab === t.id
                  ? `border-${t.color}-500 text-${t.color}-600`
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>
              {t.icon}{t.label}
              {t.total > 0 && (
                <span className={`bg-${t.color}-100 text-${t.color}-700 text-xs font-black px-2 py-0.5 rounded-full`}>
                  ₡{t.total.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 font-semibold text-base rounded-2xl px-5 py-4">{error}</div>
          )}

          {/* EFECTIVO */}
          {activeTab === 'cash' && (
            <div className="space-y-4">
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">💵</span>
                  <h3 className="text-base font-black text-gray-700 uppercase tracking-wide">Billetes</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {billetes.map(d => <DenomCard key={d.value} d={d} />)}
                </div>
              </section>
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🪙</span>
                  <h3 className="text-base font-black text-gray-700 uppercase tracking-wide">Monedas</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {monedas.map(d => <DenomCard key={d.value} d={d} />)}
                </div>
              </section>
              <div className="flex items-center justify-between bg-emerald-500 rounded-2xl px-6 py-4">
                <span className="text-emerald-100 text-lg font-bold">Total efectivo</span>
                <span className="text-white text-3xl font-black">₡{cashTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* TARJETA */}
          {activeTab === 'card' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-5 py-4 text-center">
                <p className="text-blue-700 font-black text-lg">Datáfono</p>
                <p className="text-blue-500 text-sm mt-1">Ingresa el total cobrado por tarjeta</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm font-black uppercase tracking-wider mb-2">Monto total tarjeta</p>
                <input
                  type="number"
                  inputMode="numeric"
                  value={cardAmount}
                  onChange={e => setCardAmount(e.target.value)}
                  placeholder="₡0"
                  className="w-full text-right text-4xl font-black text-gray-900 bg-white border-2 border-gray-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-400 transition"
                />
              </div>
              {cardTotal > 0 && (
                <div className="flex items-center justify-between bg-blue-500 rounded-2xl px-6 py-4">
                  <span className="text-blue-100 text-lg font-bold">Total tarjeta</span>
                  <span className="text-white text-3xl font-black">₡{cardTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {/* SINPE */}
          {activeTab === 'sinpe' && (
            <div className="space-y-4">
              <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl px-5 py-4 text-center">
                <p className="text-violet-700 font-black text-lg">SINPE Móvil</p>
                <p className="text-violet-500 text-sm mt-1">Agrega cada transferencia recibida</p>
              </div>

              <div className="space-y-3">
                {sinpeEntries.map((entry, idx) => (
                  <div key={entry.id} className="bg-white border-2 border-gray-200 rounded-2xl p-4 flex gap-3 items-center">
                    <span className="text-gray-400 font-black text-sm w-6 shrink-0 text-center">{idx + 1}</span>
                    <div className="flex-1 flex gap-3 flex-wrap">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={entry.reference}
                        onChange={e => updateSinpe(entry.id, 'reference', e.target.value)}
                        placeholder="N° comprobante (opcional)"
                        className="flex-1 min-w-0 bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 font-semibold focus:outline-none focus:border-violet-400 transition text-sm"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={entry.amount}
                        onChange={e => updateSinpe(entry.id, 'amount', e.target.value)}
                        placeholder="₡ Monto"
                        className="w-36 shrink-0 bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-800 font-black text-right focus:outline-none focus:border-violet-400 transition text-base"
                      />
                    </div>
                    {sinpeEntries.length > 1 && (
                      <button onPointerDown={() => removeSinpe(entry.id)}
                        className="w-10 h-10 shrink-0 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button onPointerDown={addSinpe}
                className="w-full h-14 rounded-2xl border-2 border-dashed border-violet-300 text-violet-600 font-bold flex items-center justify-center gap-2 hover:bg-violet-50 active:bg-violet-100 transition">
                <Plus size={20} />Agregar otro SINPE
              </button>

              {sinpeTotal > 0 && (
                <div className="flex items-center justify-between bg-violet-500 rounded-2xl px-6 py-4">
                  <span className="text-violet-100 text-lg font-bold">Total SINPE ({sinpeEntries.filter(e => parseFloat(e.amount) > 0).length} transacciones)</span>
                  <span className="text-white text-3xl font-black">₡{sinpeTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bg-white border-t border-gray-200 px-6 py-5 shrink-0 space-y-3">
          {/* Difference */}
          {diffState && diffState !== 'exact' && (
            <div className={`flex items-center gap-3 rounded-2xl px-5 py-3 border-2 ${diffState === 'over' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-amber-50 border-amber-300 text-amber-700'}`}>
              {diffState === 'over' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <span className="font-black">{diffState === 'over' ? `Sobrante: ₡${difference.toLocaleString()}` : `Faltante: ₡${Math.abs(difference).toLocaleString()}`}</span>
            </div>
          )}
          {diffState === 'exact' && (
            <div className="flex items-center gap-3 rounded-2xl px-5 py-3 border-2 bg-emerald-50 border-emerald-300 text-emerald-700">
              <span className="text-lg">✓</span><span className="font-black">Monto exacto</span>
            </div>
          )}

          {/* Grand total */}
          <div className="flex items-center justify-between bg-rose-500 rounded-2xl px-6 py-4">
            <div>
              <p className="text-rose-100 text-sm font-semibold">Total contado</p>
              <p className="text-rose-200 text-xs">Efectivo + Tarjeta + SINPE</p>
            </div>
            <span className="text-white text-4xl font-black">₡{grandTotal.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button type="button" onClick={onCancel} disabled={loading}
              className="h-16 rounded-2xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-lg hover:bg-gray-50 active:bg-gray-100 transition">
              Cancelar
            </button>
            <button type="button" onClick={handleConfirm} disabled={loading || grandTotal <= 0}
              className="h-16 rounded-2xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-lg transition shadow-sm">
              {loading ? 'Cerrando...' : 'Cerrar Caja ✓'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
