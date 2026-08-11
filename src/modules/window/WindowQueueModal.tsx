'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Clock, Bell, PackageCheck, Timer, RefreshCw, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * Fila de despacho de la ventanita.
 *
 * Es lo ÚNICO que la ventanita agrega al POS. Todo lo demás —abrir y cerrar
 * caja, cobrar, factura electrónica, impresión, descuentos— ya lo resuelve el
 * POS, y reimplementarlo acá habría dejado una caja paralela que no cuadra con
 * el arqueo.
 *
 * Esta pantalla responde una sola pregunta, que hoy vive en la cabeza del que
 * despacha y se traspapela apenas hay cola: qué hay en cocina, hace cuánto, y
 * qué bipper hay que hacer sonar.
 */

export interface QueueOrder {
  id: string; number: number;
  status: 'pending' | 'ready' | 'delivered' | 'cancelled';
  customer_name?: string | null; items_summary?: string | null;
  bipper?: string | null; notes?: string | null;
  total: number; created_at: string; ready_at?: string | null;
}

const minsSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/** Pedidos vivos del día. Se usa también desde el POS para el contador. */
export function useWindowQueue(enabled: boolean) {
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [available, setAvailable] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await apiFetch<{ rows: QueueOrder[]; available: boolean }>('/window-orders');
      setQueue(r?.rows ?? []);
      setAvailable(r?.available !== false);
    } catch { /* la fila nunca debe tumbar la caja */ }
  }, [enabled]);

  useEffect(() => { void reload(); }, [reload]);

  // Se refresca sola: en cocina marcan «listo» desde otro aparato y en el
  // mostrador tiene que aparecer sin que nadie toque nada.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, 8000);
    return () => clearInterval(t);
  }, [enabled, reload]);

  /** Bippers que están en la calle ahora mismo, por etiqueta normalizada. */
  const bippersEnUso = useMemo(
    () => new Map(queue.filter(o => o.bipper).map(o => [String(o.bipper).trim().toLowerCase(), o])),
    [queue]);

  return { queue, available, reload, bippersEnUso };
}

interface Props {
  queue: QueueOrder[];
  available: boolean;
  onReload: () => void;
  onClose: () => void;
}

export const WindowQueueModal: React.FC<Props> = ({ queue, available, onReload, onClose }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState(queue);
  useEffect(() => { setRows(queue); }, [queue]);

  const move = async (o: QueueOrder, status: QueueOrder['status']) => {
    // Se mueve en pantalla de una y se confirma contra el servidor: en el
    // mostrador, esperar la respuesta antes de que el botón reaccione se siente
    // roto y termina en dobles toques.
    setRows(prev => prev
      .map(x => x.id === o.id ? { ...x, status } : x)
      .filter(x => x.status !== 'delivered' && x.status !== 'cancelled'));
    setBusy(o.id);
    try {
      await apiFetch(`/window-orders/${o.id}/status`, {
        method: 'POST', body: JSON.stringify({ status }),
      });
    } catch { onReload(); }
    finally { setBusy(null); }
  };

  const pending = rows.filter(o => o.status === 'pending');
  const ready = rows.filter(o => o.status === 'ready');

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 shrink-0">
          <Clock size={18} className="text-orange-600" />
          <h2 className="text-lg font-black text-gray-900 flex-1">Fila de despacho</h2>
          <button onClick={onReload} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <RefreshCw size={16} />
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {!available ? (
          <div className="p-5">
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
              La fila no está disponible: falta correr la migración 87. Se puede cobrar igual, pero
              los pedidos no quedan registrados acá.
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Column title="En cocina" icon={Clock} tone="amber" orders={pending} busy={busy}
              action={{ label: 'Listo', icon: Bell, onClick: o => void move(o, 'ready') }} />
            <Column title="Listos para entregar" icon={Bell} tone="emerald" orders={ready} busy={busy}
              action={{ label: 'Entregado', icon: PackageCheck, onClick: o => void move(o, 'delivered') }} />
          </div>
        )}
      </div>
    </div>
  );
};

function Column({ title, icon: Icon, tone, orders, busy, action }: {
  title: string; icon: React.ElementType; tone: 'amber' | 'emerald';
  orders: QueueOrder[]; busy: string | null;
  action: { label: string; icon: React.ElementType; onClick: (o: QueueOrder) => void };
}) {
  const ActionIcon = action.icon;
  const s = tone === 'amber'
    ? { head: 'bg-amber-50 border-amber-200 text-amber-800', btn: 'bg-amber-600 hover:bg-amber-700' }
    : { head: 'bg-emerald-50 border-emerald-200 text-emerald-800', btn: 'bg-emerald-600 hover:bg-emerald-700' };

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${s.head}`}>
        <Icon size={15} />
        <h3 className="text-sm font-black flex-1">{title}</h3>
        <span className="text-sm font-black tabular-nums">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-8">Nada por acá.</p>
      ) : (
        <div className="divide-y divide-gray-50 max-h-[54vh] overflow-y-auto">
          {orders.map(o => {
            const waited = minsSince(o.created_at);
            return (
              <div key={o.id} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {/* Con bipper, ES el dato principal: cuando el pedido está
                      listo lo que se busca es qué aparato hacer sonar, no el
                      número de orden. */}
                  {o.bipper ? (
                    <span className="shrink-0 w-12 h-11 rounded-xl bg-gray-900 text-white flex flex-col items-center justify-center leading-none">
                      <Bell size={11} className="opacity-60" />
                      <span className="text-sm font-black mt-0.5">{o.bipper}</span>
                    </span>
                  ) : (
                    <span className="text-2xl font-black text-gray-900 tabular-nums w-12 shrink-0">#{o.number}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {o.bipper ? <span className="text-gray-400 font-black mr-1">#{o.number}</span> : null}
                      {o.customer_name}
                      {o.notes ? <span className="ml-1 text-[10px] font-black text-orange-600 uppercase">{o.notes}</span> : null}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">{o.items_summary}</p>
                  </div>
                  {/* La espera en rojo pasados 15 minutos: es el dato que decide
                      a quién apurar cuando la fila crece. */}
                  <span className={`text-[11px] font-bold tabular-nums shrink-0 flex items-center gap-0.5 ${
                    waited >= 15 ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    <Timer size={11} /> {waited}′
                  </span>
                </div>
                <button onClick={() => action.onClick(o)} disabled={busy === o.id}
                  className={`mt-2 w-full py-1.5 rounded-lg text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 ${s.btn}`}>
                  {busy === o.id ? <Loader2 size={13} className="animate-spin" /> : <ActionIcon size={13} />} {action.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WindowQueueModal;
