'use client';

import React, { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, X, Check } from 'lucide-react';
import { cashMovementsService } from '@/services/cashManagement/cashManagementService';

interface Props {
  sessionId: string;
  tenantId: string;
  onSuccess: () => void;
  onCancel: () => void;
  initialType?: 'in' | 'out';
}

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000];

const REASONS_IN = [
  'Fondo adicional',
  'Cambio recibido',
  'Préstamo a caja',
  'Ajuste positivo',
];

const REASONS_OUT = [
  'Pago a proveedor',
  'Compra de insumos',
  'Cambio entregado',
  'Retiro de efectivo',
  'Gasto operativo',
  'Ajuste negativo',
];

export const CashMovementModal: React.FC<Props> = ({
  sessionId, tenantId, onSuccess, onCancel, initialType = 'in'
}) => {
  const [type, setType] = useState<'in' | 'out'>(initialType);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reasons = type === 'in' ? REASONS_IN : REASONS_OUT;
  const finalReason = reason === '__custom__' ? customReason : reason;
  const amountNum = parseFloat(amount) || 0;
  const isValid = amountNum > 0 && finalReason.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) {
      setError(amountNum <= 0 ? 'Ingresa un monto válido' : 'Selecciona un motivo');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await cashMovementsService.createMovement(
        sessionId,
        tenantId,
        // Mapeo: in=income, out=expense (compatibilidad con backend existente)
        type === 'in' ? 'income' as any : 'expense' as any,
        type === 'in' ? amountNum : -amountNum,
        `${type === 'in' ? 'Entrada' : 'Salida'}: ${finalReason}`,
      );
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al registrar movimiento');
    } finally {
      setLoading(false);
    }
  };

  const accent = type === 'in' ? 'emerald' : 'red';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className={`px-5 py-4 flex items-center justify-between shrink-0 ${
          type === 'in' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          <div className="flex items-center gap-2 text-white">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              {type === 'in'
                ? <ArrowDownCircle size={20} />
                : <ArrowUpCircle size={20} />
              }
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight">Movimiento de Caja</h3>
              <p className="text-white/80 text-xs">{type === 'in' ? 'Entrada de efectivo' : 'Salida de efectivo'}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Toggle In/Out */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('in')}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 font-bold transition ${
                type === 'in'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300'
              }`}
            >
              <ArrowDownCircle size={22} />
              <span className="text-sm">Entrada</span>
            </button>
            <button
              type="button"
              onClick={() => setType('out')}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 font-bold transition ${
                type === 'out'
                  ? 'bg-red-50 border-red-500 text-red-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'
              }`}
            >
              <ArrowUpCircle size={22} />
              <span className="text-sm">Salida</span>
            </button>
          </div>

          {/* Monto */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Monto
            </label>
            <input
              type="number"
              min="0"
              step="100"
              inputMode="numeric"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              placeholder="0"
              className={`w-full text-right text-2xl font-black px-4 py-2.5 rounded-xl border-2 focus:outline-none ${
                type === 'in' ? 'focus:border-emerald-400' : 'focus:border-red-400'
              } border-gray-200`}
            />
            <div className="grid grid-cols-5 gap-1.5 mt-2">
              {QUICK_AMOUNTS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => { setAmount(String(a)); setError(''); }}
                  className={`h-9 rounded-lg border-2 font-bold text-xs transition ${
                    amountNum === a
                      ? `bg-${accent}-500 border-${accent}-500 text-white`
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  ₡{(a / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Motivo
            </label>
            <div className="space-y-1.5">
              {reasons.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setReason(r); setError(''); }}
                  className={`w-full text-left px-3 py-2 rounded-lg border-2 text-sm font-semibold transition ${
                    reason === r
                      ? `bg-${accent}-50 border-${accent}-400 text-${accent}-800`
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setReason('__custom__'); setError(''); }}
                className={`w-full text-left px-3 py-2 rounded-lg border-2 text-sm font-semibold transition ${
                  reason === '__custom__'
                    ? `bg-${accent}-50 border-${accent}-400 text-${accent}-800`
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                ✍️ Otro motivo (escribir)
              </button>
              {reason === '__custom__' && (
                <input
                  type="text"
                  value={customReason}
                  onChange={e => { setCustomReason(e.target.value); setError(''); }}
                  placeholder="Describe el motivo..."
                  autoFocus
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg font-semibold">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 grid grid-cols-2 gap-2 shrink-0">
          <button
            onClick={onCancel}
            disabled={loading}
            className="h-12 rounded-xl border-2 border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            className={`h-12 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 transition disabled:bg-gray-200 disabled:text-gray-400 ${
              type === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {loading ? 'Guardando...' : (<><Check size={16} /> Confirmar</>)}
          </button>
        </div>
      </div>
    </div>
  );
};
