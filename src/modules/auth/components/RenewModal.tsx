import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { X, RefreshCw, CheckCircle, Receipt as ReceiptIcon, AlertTriangle } from 'lucide-react';
import { paymentReceiptsService } from '@/services/admin/paymentReceiptsService';

export interface OwnerData {
  id: string;
  name: string;
  owner_id: string;
  is_demo: boolean;
  status: string;
  created_at: string;
  plan_id?: string;
  plan_name?: string;
  plan_price?: number;
  subscription_id?: string;
  subscription_status?: string;
  started_at?: string;
  ends_at?: string;
}

export interface RenewModalProps {
  owner: OwnerData;
  onClose: () => void;
  onDone: () => void;
}

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDate = (s: string | undefined) =>
  s ? new Date(s + (s.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-CR', { dateStyle: 'medium' }) : '—';

const today = () => new Date().toISOString().slice(0, 10);

function addMonths(dateStr: string | undefined, months = 1): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setMonth(base.getMonth() + months);
  return base.toISOString().slice(0, 10);
}

function addDaysFromToday(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type Mode = 'months' | 'days';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  sinpe: 'SINPE',
  card: 'Tarjeta',
  other: 'Otro',
};

export function RenewModal({ owner, onClose, onDone }: RenewModalProps) {
  const [mode, setMode] = useState<Mode>('months');
  const [months, setMonths] = useState(1);
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [warning, setWarning] = useState('');

  // ── Comprobante (vinculado a la renovación) ──
  const [registerReceipt, setRegisterReceipt] = useState(true);
  const [receiptAmount, setReceiptAmount]     = useState<string>('');
  const [receiptMethod, setReceiptMethod]     = useState<string>('transfer');
  const [receiptReference, setReceiptReference] = useState('');
  const [receiptNotes, setReceiptNotes]       = useState('');
  const [receiptDate, setReceiptDate]         = useState(today());
  // Si el usuario edita el monto manualmente, no lo pisamos al cambiar mode/meses.
  const [amountTouched, setAmountTouched]     = useState(false);

  const newDate = mode === 'months'
    ? addMonths(owner.ends_at ?? today(), months)
    : addDaysFromToday(days);

  // Monto sugerido por defecto.
  const suggestedAmount = useMemo(() => {
    if (mode === 'months' && owner.plan_price) return owner.plan_price * months;
    return 0;
  }, [mode, months, owner.plan_price]);

  // Si el usuario no ha tocado el monto, lo seguimos sincronizando con el sugerido.
  useEffect(() => {
    if (amountTouched) return;
    setReceiptAmount(suggestedAmount > 0 ? String(suggestedAmount) : '');
  }, [suggestedAmount, amountTouched]);

  // Periodo cubierto por la renovación.
  const periodStart = (owner.ends_at && new Date(owner.ends_at) > new Date())
    ? owner.ends_at
    : today();
  const periodEnd = newDate;

  const handleRenew = async () => {
    setSaving(true);
    setError('');
    setWarning('');
    try {
      // 1. Renovar suscripción
      const data = await apiFetch<{ subscription_id?: string } | null>('/admin/renew', {
        method: 'POST',
        body: JSON.stringify({
          p_tenant_id: owner.id,
          p_plan_id:   owner.plan_id ?? null,
          p_ends_at:   newDate,
        }),
      });

      if (data?.subscription_id) {
        try {
          await apiFetch(`/admin/tenants/${owner.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ subscription_id: data.subscription_id }),
          });
        } catch { /* column may not exist — ignore */ }
      }

      // 2. Si está marcado, registrar el comprobante de pago
      if (registerReceipt) {
        const amt = parseFloat(receiptAmount);
        if (!amt || amt <= 0) {
          // No bloquea la renovación; solo advierte.
          setWarning('Se renovó la suscripción pero el monto del comprobante era inválido. No se registró el comprobante.');
          onDone();
          // Mantenemos el modal abierto para que el usuario corrija el comprobante si quiere.
          return;
        }

        try {
          await paymentReceiptsService.create({
            tenant_id: owner.id,
            type: 'subscription',
            amount: amt,
            payment_date: receiptDate,
            period_start: periodStart,
            period_end: periodEnd,
            payment_method: receiptMethod || null,
            reference: receiptReference.trim() || null,
            notes: receiptNotes.trim() || `Renovación: ${owner.plan_name ?? ''}`.trim(),
          });
        } catch (recErr) {
          // La renovación sí pasó. Avisamos que el comprobante falló.
          setWarning(
            'Se renovó la suscripción, pero no se pudo registrar el comprobante: '
            + (recErr instanceof Error ? recErr.message : String(recErr))
            + '. Puedes registrarlo manualmente desde el tab Comprobantes.'
          );
          onDone();
          return;
        }
      }

      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="bg-emerald-600 px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-white font-black text-lg">Renovar suscripción</h2>
            <p className="text-emerald-200 text-sm">{owner.name}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}
          {warning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Plan actual</span>
              <span className="font-bold">{owner.plan_name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Precio mensual</span>
              <span className="font-bold">{owner.plan_price ? fmt(owner.plan_price) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vence actualmente</span>
              <span className={`font-bold ${owner.ends_at && new Date(owner.ends_at) < new Date() ? 'text-red-600' : ''}`}>
                {fmtDate(owner.ends_at)}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1 mb-3 bg-gray-100 rounded-xl p-1">
              <button type="button" onClick={() => setMode('months')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  mode === 'months' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                Por meses (desde vencimiento)
              </button>
              <button type="button" onClick={() => setMode('days')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  mode === 'days' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                Por días desde hoy
              </button>
            </div>

            {mode === 'months' ? (
              <>
                <label className="block text-sm font-bold text-gray-700 mb-2">Extender por</label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(m => (
                    <button key={m} type="button" onClick={() => { setMonths(m); setAmountTouched(false); }}
                      className={`py-2 rounded-xl border-2 text-sm font-bold transition ${
                        months === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                      }`}>
                      {m} {m === 1 ? 'mes' : 'meses'}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="block text-sm font-bold text-gray-700 mb-2">Renovar por</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[7, 15, 30, 60].map(d => (
                    <button key={d} type="button" onClick={() => setDays(d)}
                      className={`py-2 rounded-xl border-2 text-sm font-bold transition ${
                        days === d ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                      }`}>
                      {d}d
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-semibold">o personalizado:</span>
                  <input type="number" min={1} value={days}
                    onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-300 focus:outline-none" />
                  <span className="text-xs text-gray-500">días</span>
                </div>
              </>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm font-semibold text-emerald-700">Nueva fecha de vencimiento</span>
            <span className="text-emerald-700 font-black">{fmtDate(newDate)}</span>
          </div>

          {owner.plan_price && mode === 'months' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-blue-700">Total a cobrar</span>
              <span className="text-blue-700 font-black text-xl">{fmt(owner.plan_price * months)}</span>
            </div>
          )}

          {/* ── Comprobante de pago (vinculado) ── */}
          <div className={`rounded-xl border-2 transition ${registerReceipt ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-gray-50'}`}>
            <label className="flex items-center gap-3 p-4 cursor-pointer">
              <input type="checkbox" checked={registerReceipt}
                onChange={e => setRegisterReceipt(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500" />
              <ReceiptIcon size={16} className="text-emerald-600" />
              <div className="flex-1">
                <p className="font-bold text-gray-800 text-sm">Registrar comprobante de este cobro</p>
                <p className="text-xs text-gray-500">Se guarda como pago tipo "Plan Software"</p>
              </div>
            </label>

            {registerReceipt && (
              <div className="px-4 pb-4 space-y-3 border-t border-emerald-100 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Monto</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₡</span>
                      <input type="number" min="0" step="0.01" value={receiptAmount}
                        onChange={e => { setReceiptAmount(e.target.value); setAmountTouched(true); }}
                        placeholder="0"
                        className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fecha de pago</label>
                    <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Método</label>
                  <div className="grid grid-cols-5 gap-1">
                    {(['cash', 'transfer', 'sinpe', 'card', 'other'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setReceiptMethod(m)}
                        className={`px-1.5 py-1.5 rounded-md border text-[10px] font-bold transition ${
                          receiptMethod === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        {METHOD_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Referencia</label>
                  <input type="text" value={receiptReference}
                    onChange={e => setReceiptReference(e.target.value)}
                    placeholder="N° comprobante, SINPE, etc."
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Notas</label>
                  <textarea value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} rows={2}
                    placeholder={`Renovación: ${owner.plan_name ?? ''}`.trim()}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs resize-none focus:outline-none focus:border-emerald-400" />
                </div>

                <div className="text-[10px] text-gray-500 bg-white border border-gray-100 rounded-md px-2.5 py-1.5">
                  <span className="font-semibold">Periodo cubierto:</span> {fmtDate(periodStart)} → {fmtDate(periodEnd)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
            Cancelar
          </button>
          <button onClick={handleRenew} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl transition text-sm">
            {saving
              ? <><RefreshCw size={14} className="animate-spin" /> Renovando...</>
              : <><CheckCircle size={14} /> Confirmar Renovación</>}
          </button>
        </div>
      </div>
    </div>
  );
}
