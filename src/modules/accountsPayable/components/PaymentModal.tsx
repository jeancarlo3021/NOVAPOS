import React, { useState } from 'react';
import { X, Loader, CheckCircle2, WifiOff } from 'lucide-react';
import {
  accountsPayableService,
  type AccountPayable,
  type APPaymentPayload,
} from '@/services/accountsPayable/accountsPayableService';
import { apOfflineService } from '@/services/accountsPayable/apOfflineService';

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const today = () => new Date().toISOString().slice(0, 10);

const PAYMENT_METHODS = [
  { value: 'cash',     label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'sinpe',    label: 'SINPE' },
  { value: 'card',     label: 'Tarjeta' },
  { value: 'check',    label: 'Cheque' },
];

export interface PaymentModalProps {
  ap: AccountPayable;
  tenantId: string;
  onClose: () => void;
  onPaid: () => void;
}

export function PaymentModal({ ap, tenantId, onClose, onPaid }: PaymentModalProps) {
  const remaining  = ap.total_amount - ap.paid_amount;
  const [amount, setAmount]   = useState(remaining.toFixed(2));
  const [method, setMethod]   = useState<APPaymentPayload['payment_method']>('transfer');
  const [date, setDate]       = useState(today());
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const isOffline = !navigator.onLine;

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0)      { setError('Monto inválido'); return; }
    if (amt > remaining + 0.01)      { setError(`El máximo a pagar es ${fmt(remaining)}`); return; }
    setSaving(true);
    setError('');
    try {
      const payload: APPaymentPayload = { amount: amt, payment_date: date, payment_method: method, notes: notes || undefined };
      if (!navigator.onLine) {
        await apOfflineService.queuePayment(tenantId, ap.id, payload);
      } else {
        await accountsPayableService.registerPayment(ap.id, payload);
      }
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-emerald-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-black text-lg">Registrar Pago</h2>
              {isOffline && (
                <span className="flex items-center gap-1 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">
                  <WifiOff size={10} /> offline
                </span>
              )}
            </div>
            <p className="text-emerald-200 text-sm">{ap.purchase_number} · {ap.supplier_name}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
          {isOffline && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-xs text-orange-700 flex items-center gap-2">
              <WifiOff size={12} /> Sin conexión — el pago se guardará localmente y se sincronizará al reconectarse.
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 flex justify-between text-sm">
            <span className="text-gray-500">Total factura</span>
            <span className="font-bold">{fmt(ap.total_amount)}</span>
          </div>
          {ap.paid_amount > 0 && (
            <div className="bg-emerald-50 rounded-xl p-4 flex justify-between text-sm">
              <span className="text-emerald-700">Ya pagado</span>
              <span className="font-bold text-emerald-700">{fmt(ap.paid_amount)}</span>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between text-sm">
            <span className="text-amber-700 font-bold">Saldo pendiente</span>
            <span className="font-black text-amber-700">{fmt(remaining)}</span>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Monto a pagar</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">₡</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                min="0.01" step="0.01"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-lg font-black text-right" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Método de pago</label>
              <select value={method} onChange={e => setMethod(e.target.value as APPaymentPayload['payment_method'])}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm">
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fecha de pago</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notas <span className="font-normal text-gray-400">(opcional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Referencia de transferencia, número de cheque..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
            Cancelar
          </button>
          <button onClick={handlePay} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl transition text-sm">
            {saving
              ? <><Loader size={15} className="animate-spin" /> Guardando...</>
              : isOffline
                ? <><WifiOff size={15} /> Guardar (offline)</>
                : <><CheckCircle2 size={15} /> Confirmar Pago</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
