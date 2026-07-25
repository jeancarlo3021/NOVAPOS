'use client';

import React, { useEffect, useState } from 'react';
import { MessageCircle, X, Save, Send, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { OwnerData } from './RenewModal';

/**
 * Modal (Panel Admin) para guardar el número de WhatsApp que recibe los
 * RECORDATORIOS DE PAGO y los ERRORES DE HACIENDA de un negocio. Se guarda en
 * settings.general.notify_phone y tiene prioridad sobre el teléfono del emisor.
 */
export const NotifyPhoneModal: React.FC<{ owner: OwnerData; onClose: () => void }> = ({ owner, onClose }) => {
  const [phone, setPhone] = useState('');
  const [emisorPhone, setEmisorPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiFetch<{ notify_phone: string; emisor_phone: string }>(`/admin/whatsapp-qr/notify-phone?tenant=${owner.id}`)
      .then(r => { setPhone(r.notify_phone || ''); setEmisorPhone(r.emisor_phone || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner.id]);

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch('/admin/whatsapp-qr/notify-phone', {
        method: 'POST',
        body: JSON.stringify({ tenant: owner.id, phone: phone.trim() }),
      });
      flash(true, 'Número guardado ✓');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  const sendTest = async () => {
    const to = phone.trim() || emisorPhone.trim();
    if (!to) { flash(false, 'No hay número'); return; }
    setSending(true);
    try {
      const r = await apiFetch<{ ok: boolean; error?: string }>('/admin/whatsapp-qr/send', {
        method: 'POST',
        body: JSON.stringify({ to, text: `✅ *ColónClick*\n\nPrueba de avisos para "${owner.name}". Este número recibirá recordatorios de pago y errores de facturación.` }),
      });
      if (r.ok) flash(true, 'Mensaje de prueba enviado ✓');
      else flash(false, r.error === 'no_whatsapp' ? 'Ese número no tiene WhatsApp' : (r.error || 'No se pudo enviar'));
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Error al enviar'); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center"><MessageCircle size={18} className="text-white" /></div>
            <div>
              <h3 className="font-black text-gray-900 text-sm">Número de avisos WhatsApp</h3>
              <p className="text-xs text-gray-500 truncate max-w-[16rem]">{owner.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          {msg && (
            <div className={`rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {msg.text}
            </div>
          )}
          <p className="text-sm text-gray-600">Recibe <b>recordatorios de pago</b> y <b>errores de Hacienda</b> de este negocio.</p>

          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 py-4"><Loader2 className="animate-spin" size={16} /> Cargando…</div>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold text-gray-500">Número (WhatsApp)</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej. 8888 8888"
                  className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400" />
                <p className="text-xs text-gray-400 mt-1">
                  CR: 8 dígitos se completan con 506. Si lo dejás vacío, se usa el del emisor{emisorPhone ? ` (${emisorPhone})` : ''}.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={save} disabled={saving}
                  className="flex-1 h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-sm disabled:bg-gray-300 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Guardar
                </button>
                <button onClick={sendTest} disabled={sending}
                  className="h-11 px-4 rounded-xl border-2 border-green-200 text-green-700 hover:bg-green-50 font-bold text-sm disabled:opacity-50 flex items-center gap-2">
                  {sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Probar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotifyPhoneModal;
