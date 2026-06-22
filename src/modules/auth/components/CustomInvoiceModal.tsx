import { useState } from 'react';
import { X, Plus, Trash2, Mail } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { OwnerData } from './RenewModal';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

interface Line { description: string; amount: string; }

export function CustomInvoiceModal({ owner, onClose, onSent, onError }: {
  owner: OwnerData;
  onClose: () => void;
  onSent: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const planPrice = owner.custom_price ?? owner.plan_price ?? 0;
  const [lines, setLines] = useState<Line[]>([
    { description: `Plan ${owner.plan_name ?? ''} — primer mes`.trim(), amount: planPrice ? String(planPrice) : '' },
  ]);
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 8); return d.toISOString().slice(0, 10); });
  const [notes, setNotes] = useState('');
  const [paymentInfo, setPaymentInfo] = useState('');
  const [includePlan, setIncludePlan] = useState(true);
  const [sending, setSending] = useState(false);

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLines(ls => [...ls, { description: '', amount: '' }]);
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));

  const send = async () => {
    const items = lines.filter(l => l.description.trim() && Number(l.amount) > 0)
      .map(l => ({ description: l.description.trim(), amount: Number(l.amount) }));
    if (items.length === 0) { onError('Agregá al menos una línea con monto'); return; }
    setSending(true);
    try {
      await apiFetch('/admin/send-custom-invoice', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: owner.id, items,
          due_date: dueDate || null, notes: notes.trim() || null,
          payment_info: paymentInfo.trim() || null, include_plan_features: includePlan,
        }),
      });
      onSent(`Cobro enviado por correo a "${owner.name}"`);
    } catch (e: any) {
      onError(e?.message || 'No se pudo enviar el cobro');
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-90 p-0 sm:p-3" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900">Cobro personalizado</h2>
            <p className="text-xs text-gray-400">{owner.name} · {owner.plan_name ?? 'Sin plan'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Líneas */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Conceptos</label>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input value={l.description} onChange={e => setLine(i, { description: e.target.value })}
                    placeholder="Descripción" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <input type="number" inputMode="decimal" value={l.amount} onChange={e => setLine(i, { amount: e.target.value })}
                    placeholder="₡" className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right" />
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(i)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={15} /></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addLine} className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800">
              <Plus size={13} /> Agregar línea
            </button>
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-bold text-gray-600">Total a cobrar</span>
            <span className="text-xl font-black text-blue-600">{fmt(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Fecha límite</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <label className="flex items-end gap-2 pb-2 cursor-pointer">
              <input type="checkbox" checked={includePlan} onChange={e => setIncludePlan(e.target.checked)} className="w-4 h-4 rounded text-emerald-600" />
              <span className="text-sm text-gray-700 font-semibold">Incluir lo que trae el plan</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Cómo pagar <span className="text-gray-400 font-normal">(opcional)</span></label>
            <textarea value={paymentInfo} onChange={e => setPaymentInfo(e.target.value)} rows={2}
              placeholder="Ej: SINPE 8888-8888 · Cuenta IBAN CR..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={send} disabled={sending}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black py-3 rounded-xl text-sm">
            {sending ? 'Enviando…' : <><Mail size={16} /> Enviar cobro por correo</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomInvoiceModal;
