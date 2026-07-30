'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, X, Send, Loader2, CheckCircle2, AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { OwnerData } from './RenewModal';

/**
 * Modal (Panel Admin) para enviar por WhatsApp un recordatorio de pago a un
 * negocio. Trae un mensaje FIJO pre-armado (con nombre, plan, monto y vencimiento)
 * que se puede EDITAR (personalizado). Envía por el worker de WhatsApp
 * (/admin/whatsapp-qr/send) y, como respaldo, permite abrir WhatsApp con wa.me.
 */
interface Props {
  owner: OwnerData;
  /** Días hasta el vencimiento (negativo = vencido hace N días). */
  days?: number | null;
  /** Fecha de vencimiento efectiva (para el texto). */
  endsAt?: Date | string | null;
  onClose: () => void;
}

const fmtColones = (n?: number | null) =>
  `₡${Number(n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;

const fmtDate = (d?: Date | string | null): string => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
};

export const WaReminderModal: React.FC<Props> = ({ owner, days, endsAt, onClose }) => {
  const [phone, setPhone] = useState('');
  const [emisorPhone, setEmisorPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Mensaje FIJO pre-armado (el usuario lo puede editar → personalizado).
  const fixedText = useMemo(() => {
    const price = owner.custom_price ?? owner.plan_price;
    const venc = fmtDate(endsAt);
    const d = typeof days === 'number' ? days : null;
    let estado = '';
    if (d != null) {
      if (d < 0) estado = `venció hace ${Math.abs(d)} día(s)`;
      else if (d === 0) estado = 'vence *hoy*';
      else estado = `vence en ${d} día(s)`;
    }
    const lineaVenc = venc
      ? `Su plan *${owner.plan_name ?? ''}*${estado ? ` ${estado}` : ''} (${venc}).`
      : `Le recordamos el pago de su plan *${owner.plan_name ?? ''}*.`;
    return [
      `Hola 👋, le saludamos de *ColónClick*.`,
      ``,
      lineaVenc,
      price ? `Monto a pagar: *${fmtColones(price)}*.` : '',
      ``,
      `Por favor realice el pago para mantener su servicio activo. Si ya realizó el pago, ignore este mensaje. ¡Gracias! 🙌`,
    ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
  }, [owner, days, endsAt]);

  const [text, setText] = useState(fixedText);
  // Si cambia el mensaje fijo (otro negocio), re-inicializar el textarea.
  useEffect(() => { setText(fixedText); }, [fixedText]);

  useEffect(() => {
    apiFetch<{ notify_phone: string; emisor_phone: string }>(`/admin/whatsapp-qr/notify-phone?tenant=${owner.id}`)
      .then(r => { setPhone(r.notify_phone || ''); setEmisorPhone(r.emisor_phone || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner.id]);

  const flash = (ok: boolean, t: string) => { setMsg({ ok, text: t }); setTimeout(() => setMsg(null), 3500); };

  const destino = () => (phone.trim() || emisorPhone.trim());

  // Normaliza a formato internacional para wa.me (CR: 8 dígitos → 506########).
  const waNumber = (raw: string): string => {
    const d = raw.replace(/\D/g, '');
    if (!d) return '';
    return d.length === 8 ? `506${d}` : d;
  };

  const send = async () => {
    const to = destino();
    if (!to) { flash(false, 'No hay número de WhatsApp para este negocio. Guardalo en «Número de avisos».'); return; }
    if (!text.trim()) { flash(false, 'El mensaje está vacío.'); return; }
    setSending(true);
    try {
      const r = await apiFetch<{ ok: boolean; error?: string }>('/admin/whatsapp-qr/send', {
        method: 'POST',
        body: JSON.stringify({ to, text: text.trim() }),
      });
      if (r.ok) { flash(true, 'Recordatorio enviado ✓'); setTimeout(onClose, 1200); }
      else flash(false, r.error === 'no_whatsapp' ? 'Ese número no tiene WhatsApp' : (r.error || 'No se pudo enviar'));
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Error al enviar'); }
    finally { setSending(false); }
  };

  const openWhatsApp = () => {
    const num = waNumber(destino());
    if (!num) { flash(false, 'No hay número para abrir WhatsApp.'); return; }
    const url = `https://wa.me/${num}?text=${encodeURIComponent(text.trim())}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center"><MessageCircle size={18} className="text-white" /></div>
            <div>
              <h3 className="font-black text-gray-900 text-sm">Recordatorio por WhatsApp</h3>
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

          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 py-4"><Loader2 className="animate-spin" size={16} /> Cargando…</div>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold text-gray-500">Número (WhatsApp)</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={emisorPhone || 'Ej. 8888 8888'}
                  className="w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400" />
                <p className="text-xs text-gray-400 mt-1">
                  CR: 8 dígitos se completan con 506.{emisorPhone ? ` Si lo dejás vacío se usa el del emisor (${emisorPhone}).` : ''}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-500">Mensaje</label>
                  <button onClick={() => setText(fixedText)} disabled={text === fixedText}
                    className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-gray-700 disabled:opacity-40">
                    <RotateCcw size={12} /> Mensaje fijo
                  </button>
                </div>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={7}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400 resize-none" />
                <p className="text-xs text-gray-400 mt-1">Podés editarlo para personalizarlo. *texto* se ve en negrita en WhatsApp.</p>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={send} disabled={sending}
                  className="flex-1 h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-sm disabled:bg-gray-300 flex items-center justify-center gap-2">
                  {sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Enviar
                </button>
                <button onClick={openWhatsApp} title="Abrir WhatsApp con el mensaje (por si el worker no está conectado)"
                  className="h-11 px-4 rounded-xl border-2 border-green-200 text-green-700 hover:bg-green-50 font-bold text-sm flex items-center gap-2">
                  <ExternalLink size={15} /> Abrir
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WaReminderModal;
