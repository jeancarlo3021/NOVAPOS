import { useEffect, useState } from 'react';
import { CheckCircle2, Printer, Loader2, AlertTriangle, X, Bluetooth } from 'lucide-react';
import { btConnectFor, btRequestDevice, serialRequestPort, btIsSupported } from '@/services/pos/bluetoothPrinterService';
import { posPrinterService } from '@/services/pos/posPrinterService';

/**
 * Modal post-cobro: intenta imprimir el ticket y muestra el resultado, con
 * botones "Reintentar" (si falló o quieren otra copia) y "Cerrar".
 */
export function PrintTicketModal({ invoiceNumber, total, tenantId, printFn, onClose }: {
  invoiceNumber?: string;
  total?: number;
  tenantId?: string;
  printFn: () => Promise<void>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'printing' | 'ok' | 'error'>('printing');
  const [connecting, setConnecting] = useState(false);

  const run = async () => {
    setStatus('printing');
    try { await printFn(); setStatus('ok'); }
    catch { setStatus('error'); }
  };
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connectAndPrint = async () => {
    setConnecting(true);
    try {
      // Conectar usando el MODO configurado de cada estación Bluetooth (BLE / Serial / USB).
      // Si el cliente configuró la impresora como "serial" (SPP), conectar en BLE no sirve.
      let connected = false;
      if (tenantId) {
        try {
          const cfg: any = await posPrinterService.loadReceiptConfig(tenantId);
          const stations = (cfg?.printers ?? []).filter(
            (p: any) => p.type === 'receipt' && p.is_active && p.connection === 'bluetooth',
          );
          for (const st of stations) {
            await btConnectFor(st.id, (st.bt_mode ?? 'ble'));
            connected = true;
          }
        } catch { /* seguimos al fallback */ }
      }
      // Fallback (modo simple sin estaciones): probá BLE y, si no, Serial.
      if (!connected) {
        try { await btRequestDevice(); }
        catch { await serialRequestPort().catch(() => {}); }
      }
      await run();
    } catch { /* el usuario canceló el selector */ }
    finally { setConnecting(false); }
  };

  const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-70 p-4" onClick={status !== 'printing' ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-6 text-center text-white ${status === 'error' ? 'bg-red-500' : status === 'ok' ? 'bg-emerald-500' : 'bg-cyan-500'}`}>
          {status === 'printing' && <Loader2 size={40} className="mx-auto animate-spin" />}
          {status === 'ok' && <CheckCircle2 size={40} className="mx-auto" />}
          {status === 'error' && <AlertTriangle size={40} className="mx-auto" />}
          <p className="font-black text-lg mt-2">
            {status === 'printing' ? 'Imprimiendo…' : status === 'ok' ? 'Factura impresa' : 'No se pudo imprimir'}
          </p>
          {invoiceNumber && <p className="text-white/90 text-sm">N° {invoiceNumber}</p>}
          {total != null && <p className="text-white/90 text-sm font-bold">{fmt(total)}</p>}
        </div>
        <div className="p-4 space-y-2">
          {status === 'error' && (
            <p className="text-center text-xs text-gray-500">Revisá que la impresora esté conectada y reintentá.</p>
          )}
          {status === 'error' && btIsSupported() && (
            <button onClick={connectAndPrint} disabled={connecting}
              className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl text-sm">
              {connecting ? <Loader2 size={15} className="animate-spin" /> : <Bluetooth size={15} />} Conectar impresora
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={run} disabled={status === 'printing'}
              className="flex-1 flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl text-sm">
              <Printer size={15} /> Reintentar
            </button>
            <button onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">
              <X size={15} /> Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrintTicketModal;
