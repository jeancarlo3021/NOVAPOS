import React, { useCallback, useEffect, useState } from 'react';
import { X, Trash2, AlertCircle, Loader2, CloudUpload } from 'lucide-react';
import { posOfflineService, type OfflineInvoicePayload } from '@/services/pos/posOfflineService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;

/**
 * Ventas que quedaron sin subir.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Una venta que no logra subir se queda pendiente para siempre —a propósito:
 * descartarla sola sería perder plata sin que nadie se entere—. Pero eso dejaba
 * al cajero con un «1 pendiente» pegado en la pantalla que no se iba por más que
 * tocara subir, sin poder ver cuál era ni por qué fallaba.
 *
 * Acá se ve la venta, el motivo del fallo y las dos salidas honestas:
 * reintentar, o descartarla A MANO sabiendo qué se está descartando.
 */
export const PendingInvoicesModal: React.FC<{
  onClose: () => void;
  onSync: () => Promise<void>;
  syncing: boolean;
}> = ({ onClose, onSync, syncing }) => {
  const [items, setItems] = useState<OfflineInvoicePayload[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setItems(await posOfflineService.getPendingInvoices()); }
    catch { setItems([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const descartar = async (inv: OfflineInvoicePayload) => {
    const ok = window.confirm(
      `¿Descartar la venta ${inv.invoiceNumber} de ${money(inv.total)}?\n\n`
      + 'Esta venta NO está en el servidor y se va a borrar del aparato: '
      + 'no va a aparecer en los reportes ni en el cierre de caja.\n\n'
      + 'Hacelo solo si ya la cobraste de otra forma o si fue una prueba.',
    );
    if (!ok) return;
    await posOfflineService.clearFailedInvoice(inv.id);
    await cargar();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-black text-gray-900">Ventas sin subir</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cargando && (
            <p className="text-sm font-bold text-gray-400 flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" /> Cargando…
            </p>
          )}
          {!cargando && items.length === 0 && (
            <p className="text-sm font-bold text-emerald-700 py-6 text-center">
              Todo subido. No queda ninguna venta pendiente.
            </p>
          )}
          {items.map(inv => (
            <div key={inv.id} className="border-2 border-gray-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-gray-900 text-sm">
                    {inv.invoiceNumber} · {money(inv.total)}
                  </p>
                  <p className="text-[11px] font-semibold text-gray-500">
                    {new Date(inv.timestamp).toLocaleString('es-CR')}
                    {inv.customerName ? ` · ${inv.customerName}` : ''}
                  </p>
                </div>
                <button onClick={() => void descartar(inv)} title="Descartar esta venta"
                  className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* El motivo del fallo: sin esto, «no sube» no le sirve a nadie. */}
              {inv.syncError && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-red-600">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">
                    {inv.syncError}
                    {(inv.retries ?? 0) > 0 && <span className="text-gray-400"> · {inv.retries} intento(s)</span>}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 p-3">
          <button
            onClick={async () => { await onSync(); await cargar(); }}
            disabled={syncing || items.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700
                       disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm">
            {syncing ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
            {syncing ? 'Subiendo…' : 'Reintentar todas'}
          </button>
          <p className="mt-2 text-[11px] font-semibold text-gray-400 text-center">
            Una venta que no sube se queda acá hasta que entre o la descartes. Nunca se borra sola.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PendingInvoicesModal;
