import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, WifiOff, AlertTriangle, X } from 'lucide-react';
import { onQzStatus, type QzStatus } from '@/services/pos/qzTrayService';

interface ToastState {
  status: QzStatus;
  attempt?: number;
}

/**
 * Toast global de reconexión de QZ Tray. Se monta una vez (en App) y escucha los
 * cambios de estado de la conexión. Muestra los reintentos, el éxito y el fallo.
 */
export function QzReconnectToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  // Recordamos si veníamos de una desconexión para no mostrar "conectado" en la
  // primera conexión manual (solo nos interesa avisar de las RE-conexiones).
  const [wasDown, setWasDown] = useState(false);

  useEffect(() => {
    const off = onQzStatus((status, attempt) => {
      if (status === 'disconnected') {
        setWasDown(true);
        setToast({ status, attempt });
      } else if (status === 'reconnecting') {
        setWasDown(true);
        setToast({ status, attempt });
      } else if (status === 'failed') {
        setToast({ status, attempt });
      } else if (status === 'connected') {
        if (wasDown) setToast({ status });
        setWasDown(false);
      }
    });
    return off;
  }, [wasDown]);

  // Auto-ocultar los estados finales.
  useEffect(() => {
    if (!toast) return;
    if (toast.status === 'connected' || toast.status === 'failed') {
      const t = setTimeout(() => setToast(null), toast.status === 'connected' ? 3500 : 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  if (!toast) return null;

  const cfg = {
    reconnecting: { bg: 'bg-amber-500', icon: <Loader2 size={18} className="animate-spin" />, text: `Reconectando impresora… (intento ${toast.attempt ?? 1})` },
    disconnected: { bg: 'bg-amber-500', icon: <WifiOff size={18} />, text: 'Se perdió la conexión con QZ Tray' },
    connected:    { bg: 'bg-emerald-600', icon: <CheckCircle2 size={18} />, text: 'Impresora reconectada' },
    failed:       { bg: 'bg-red-600', icon: <AlertTriangle size={18} />, text: 'No se pudo reconectar la impresora' },
  }[toast.status];

  return (
    <div className="fixed bottom-4 right-4 z-[9999] animate-in slide-in-from-bottom-2">
      <div className={`${cfg.bg} text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-2.5 max-w-sm`}>
        {cfg.icon}
        <span className="text-sm font-bold flex-1">{cfg.text}</span>
        <button onClick={() => setToast(null)} className="p-1 hover:bg-white/20 rounded-lg shrink-0"><X size={15} /></button>
      </div>
    </div>
  );
}
