import { useEffect, useState, useCallback, useRef } from 'react';
import { Bluetooth, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { useTenantId } from '@/hooks/useTenant';

/**
 * Modal de reconexión de la impresora Bluetooth. Aparece SOLO cuando hay una
 * impresora Bluetooth configurada y está desconectada (igual estilo que el
 * modal de impresión de distribución). Al reconectar se cierra solo.
 */
export function BluetoothReconnectButton() {
  const { tenantId } = useTenantId();
  const [disconnected, setDisconnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<'idle' | 'connecting' | 'ok'>('idle');
  const wasConnected = useRef(true);

  const check = useCallback(async () => {
    if (!tenantId) return;
    const s = await posPrinterService.bluetoothStatus(tenantId);
    if (!s.configured) { setDisconnected(false); return; }
    if (s.connected) {
      // Volvió a conectar → reseteamos el "cerrado" para avisar la próxima vez.
      setDisconnected(false);
      if (!wasConnected.current) setDismissed(false);
      wasConnected.current = true;
    } else {
      setDisconnected(true);
      wasConnected.current = false;
    }
  }, [tenantId]);

  useEffect(() => {
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [check]);

  const reconnect = async () => {
    if (!tenantId) return;
    setState('connecting');
    try {
      await posPrinterService.reconnectBluetooth(tenantId);
      const s = await posPrinterService.bluetoothStatus(tenantId);
      if (s.connected) {
        setState('ok');
        setTimeout(() => { setDisconnected(false); setState('idle'); }, 1800);
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  if (!disconnected || dismissed) return null;

  const ok = state === 'ok';
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={state === 'idle' ? () => setDismissed(true) : undefined}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-6 text-center text-white ${ok ? 'bg-emerald-500' : 'bg-cyan-500'}`}>
          {state === 'connecting' && <Loader2 size={40} className="mx-auto animate-spin" />}
          {ok && <CheckCircle2 size={40} className="mx-auto" />}
          {state === 'idle' && <AlertTriangle size={40} className="mx-auto" />}
          <p className="font-black text-lg mt-2">
            {ok ? 'Impresora reconectada' : state === 'connecting' ? 'Conectando…' : 'Impresora desconectada'}
          </p>
          {!ok && <p className="text-white/90 text-sm">Se perdió la conexión Bluetooth</p>}
        </div>
        {!ok && (
          <div className="p-4 space-y-2">
            <p className="text-center text-xs text-gray-500">Encendé la impresora y tocá volver a conectar.</p>
            <button onClick={reconnect} disabled={state === 'connecting'}
              className="w-full flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl text-sm">
              {state === 'connecting' ? <Loader2 size={15} className="animate-spin" /> : <Bluetooth size={15} />} Volver a conectar
            </button>
            <button onClick={() => setDismissed(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">
              <X size={15} /> Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default BluetoothReconnectButton;
