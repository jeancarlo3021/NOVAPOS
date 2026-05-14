import React, { useState } from 'react';
import { X, RefreshCw, Check, Bell } from 'lucide-react';
import { recurringExpensesService, calcOverduePeriods, getNextDueDate } from '@/services/expenses/expensesService';
import type { RegisterRecurringModalProps } from './types';

function RegisterRecurringModal({ recurring, tenantId, onClose, onRegistered }: RegisterRecurringModalProps) {
  const dueDate = getNextDueDate(recurring);
  const overdue = calcOverduePeriods(recurring);

  const [amount, setAmount] = useState(String(recurring.default_amount));
  const [date,   setDate]   = useState(dueDate);
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const diff  = parseFloat(amount) - recurring.default_amount;
  const pct   = recurring.default_amount > 0 ? (diff / recurring.default_amount) * 100 : 0;

  const handleRegister = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Monto inválido'); return; }
    setSaving(true);
    setError('');
    try {
      await recurringExpensesService.register(tenantId, recurring, amt, date, notes || undefined);
      onRegistered();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="bg-amber-500 px-5 py-4 rounded-t-2xl flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Bell size={16} className="text-amber-100" />
              <h2 className="text-white font-black text-base">Registrar pago</h2>
            </div>
            <p className="text-amber-100 text-sm">{recurring.description}</p>
            {overdue > 1 && (
              <p className="text-amber-200 text-xs mt-1">
                {overdue} {overdue === 1 ? 'período pendiente' : 'períodos pendientes'} — registrando el más reciente
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Monto real (₡)
              <span className="ml-1 font-normal text-gray-400">— ajusta si el recibo cambió</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">₡</span>
              <input type="number" min="0" step="1" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-lg font-black text-right" />
            </div>

            {/* Change indicator */}
            {parseFloat(amount) > 0 && parseFloat(amount) !== recurring.default_amount && (
              <div className={`mt-2 flex items-center gap-2 text-sm font-semibold rounded-lg px-3 py-2 ${
                diff > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                {diff > 0 ? '↑' : '↓'}
                {Math.abs(diff).toLocaleString('es-CR', { minimumFractionDigits: 0 })} vs monto base
                <span className="text-xs font-normal opacity-70">({Math.abs(pct).toFixed(1)}%)</span>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha de pago</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notas <span className="font-normal text-gray-400">(opcional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Referencia de pago, observaciones..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleRegister} disabled={saving}
            className="flex-1 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 transition flex items-center justify-center gap-2">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Registrando...' : 'Registrar Pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RegisterRecurringModal;
