'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, RefreshCw, LogOut, Send, CheckCircle2, AlertTriangle, Loader2, Smartphone } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';

interface Status {
  configured: boolean;
  state: 'unconfigured' | 'unreachable' | 'connecting' | 'qr' | 'open' | 'close';
  connected: boolean;
  qr: string | null;                 // data:image/png;base64,...
  me: { id: string | null; name: string | null } | null;
  error?: string;
}

/**
 * Panel admin — Vinculación de WhatsApp por QR (Baileys).
 * Un solo número ColónClick para toda la plataforma. El QR y la sesión viven en
 * el worker persistente; acá solo mostramos estado, QR y un envío de prueba.
 */
export const WhatsAppQrView: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const firstLoad = useRef(true);

  // Prueba de envío
  const [to, setTo] = useState('');
  const [text, setText] = useState('Hola 👋 Prueba desde ColónClick');
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const s = await apiFetch<Status>('/admin/whatsapp-qr/status');
      setStatus(s);
    } catch (e) {
      setStatus({ configured: true, state: 'unreachable', connected: false, qr: null, me: null, error: e instanceof Error ? e.message : 'error' });
    } finally {
      if (firstLoad.current) { setLoading(false); firstLoad.current = false; }
    }
  };

  useEffect(() => { load(); }, []);
  // Mientras NO esté conectado, refrescamos rápido (para ver el QR nuevo).
  useVisiblePolling(load, status?.connected ? 15_000 : 3_000);

  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3000); };

  const logout = async () => {
    if (!confirm('¿Desvincular el WhatsApp? Habrá que escanear el QR de nuevo para reconectar.')) return;
    setBusy(true);
    try { await apiFetch('/admin/whatsapp-qr/logout', { method: 'POST' }); flash(true, 'Sesión cerrada — generando QR nuevo…'); await load(); }
    catch (e) { flash(false, e instanceof Error ? e.message : 'No se pudo desvincular'); }
    finally { setBusy(false); }
  };

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !text.trim()) return;
    setSending(true);
    try {
      const r = await apiFetch<{ ok: boolean; error?: string }>('/admin/whatsapp-qr/send', {
        method: 'POST',
        body: JSON.stringify({ to: to.trim(), text: text.trim() }),
      });
      if (r.ok) flash(true, 'Mensaje enviado ✓');
      else flash(false, r.error === 'no_whatsapp' ? 'Ese número no tiene WhatsApp' : (r.error || 'No se pudo enviar'));
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Error al enviar'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="animate-spin mr-2" size={20} /> Cargando…</div>;

  const s = status;
  const st = s?.state ?? 'unreachable';

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-green-500 flex items-center justify-center">
            <MessageCircle size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">WhatsApp (por QR)</h2>
            <p className="text-sm text-gray-500">Número ColónClick vinculado por WhatsApp Web. Uno solo para toda la plataforma.</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Refrescar"><RefreshCw size={16} /></button>
      </div>

      {toast && (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 ${toast.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {toast.msg}
        </div>
      )}

      {/* Estado no configurado */}
      {st === 'unconfigured' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-bold">Worker de WhatsApp no configurado.</p>
            <p className="mt-1">Falta desplegar el worker Baileys (host siempre encendido) y definir en el backend las variables <code className="bg-amber-100 px-1 rounded">WHATSAPP_WORKER_URL</code> y <code className="bg-amber-100 px-1 rounded">WHATSAPP_WORKER_SECRET</code>. Ver <code className="bg-amber-100 px-1 rounded">whatsapp-worker/README</code>.</p>
          </div>
        </div>
      )}

      {/* No se pudo contactar al worker */}
      {st === 'unreachable' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm text-red-800">
            <p className="font-bold">No se pudo contactar al worker de WhatsApp.</p>
            <p className="mt-1">Verificá que esté encendido y que <code className="bg-red-100 px-1 rounded">WHATSAPP_WORKER_URL</code> sea correcto. {s?.error && <span className="opacity-70">({s.error})</span>}</p>
          </div>
        </div>
      )}

      {/* QR para escanear */}
      {st === 'qr' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-white p-2">
            {s?.qr ? <img src={s.qr} alt="QR de WhatsApp" className="w-56 h-56" /> : <div className="w-56 h-56 flex items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>}
          </div>
          <div className="text-sm text-gray-700 space-y-2">
            <p className="font-black text-gray-900 text-base flex items-center gap-2"><Smartphone size={18} className="text-green-600" /> Vinculá el número</p>
            <ol className="list-decimal ml-5 space-y-1 text-gray-600">
              <li>Abrí <b>WhatsApp</b> en el teléfono del número ColónClick.</li>
              <li>Ajustes → <b>Dispositivos vinculados</b>.</li>
              <li>Tocá <b>Vincular un dispositivo</b> y escaneá este código.</li>
            </ol>
            <p className="text-xs text-gray-400">El código se renueva solo. Si expira, aparece uno nuevo automáticamente.</p>
          </div>
        </div>
      )}

      {/* Conectando */}
      {(st === 'connecting' || st === 'close') && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex items-center gap-3 text-gray-600">
          <Loader2 className="animate-spin" size={18} /> Conectando con WhatsApp…
        </div>
      )}

      {/* Conectado */}
      {st === 'open' && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={22} className="text-emerald-600" />
              <div>
                <p className="font-black text-emerald-900">Conectado</p>
                <p className="text-sm text-emerald-700">{s?.me?.name ? `${s.me.name} · ` : ''}{(s?.me?.id || '').split(':')[0].replace(/@.*/, '') || 'número vinculado'}</p>
              </div>
            </div>
            <button onClick={logout} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 text-sm font-bold disabled:opacity-50">
              <LogOut size={15} /> Desvincular
            </button>
          </div>

          {/* Envío de prueba */}
          <form onSubmit={sendTest} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
            <p className="font-black text-gray-900 text-sm">Enviar mensaje de prueba</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="Número (ej. 8888 8888)"
                className="w-full sm:w-52 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400" />
              <input value={text} onChange={e => setText(e.target.value)} placeholder="Mensaje"
                className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400" />
              <button type="submit" disabled={sending || !to.trim() || !text.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm disabled:bg-gray-200 disabled:text-gray-400">
                {sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Enviar
              </button>
            </div>
            <p className="text-xs text-gray-400">CR: 8 dígitos se completan con 506 automáticamente.</p>
          </form>
        </>
      )}
    </div>
  );
};

export default WhatsAppQrView;
