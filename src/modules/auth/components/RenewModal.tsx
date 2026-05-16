import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { X, RefreshCw, CheckCircle } from 'lucide-react';

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

function addMonths(dateStr: string | undefined, months = 1): string {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setMonth(base.getMonth() + months);
  return base.toISOString().slice(0, 10);
}

export function RenewModal({ owner, onClose, onDone }: RenewModalProps) {
  const [months, setMonths] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const newDate = addMonths(owner.ends_at ?? new Date().toISOString().slice(0, 10), months);

  const handleRenew = async () => {
    setSaving(true);
    setError('');
    try {
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="bg-emerald-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="text-white font-black text-lg">Renovar suscripción</h2>
            <p className="text-emerald-200 text-sm">{owner.name}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
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
            <label className="block text-sm font-bold text-gray-700 mb-2">Extender por</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(m => (
                <button key={m} type="button" onClick={() => setMonths(m)}
                  className={`py-2 rounded-xl border-2 text-sm font-bold transition ${
                    months === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                  }`}>
                  {m} {m === 1 ? 'mes' : 'meses'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex justify-between items-center">
            <span className="text-sm font-semibold text-emerald-700">Nueva fecha de vencimiento</span>
            <span className="text-emerald-700 font-black">{fmtDate(newDate)}</span>
          </div>

          {owner.plan_price && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-blue-700">Total a cobrar</span>
              <span className="text-blue-700 font-black text-xl">{fmt(owner.plan_price * months)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
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
