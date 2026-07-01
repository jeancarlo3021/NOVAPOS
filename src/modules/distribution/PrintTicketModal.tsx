import { useEffect, useState } from 'react';
import { CheckCircle2, Printer, Loader2, AlertTriangle, X, Bluetooth } from 'lucide-react';
import { btConnectFor, btRequestDevice, serialRequestPort, btIsSupported } from '@/services/pos/bluetoothPrinterService';
import { posPrinterService } from '@/services/pos/posPrinterService';

/**
 * Modal post-cobro: intenta imprimir el ticket y muestra el resultado, con
 * botones "Reintentar" (si falló o quieren otra copia) y "Cerrar".
 */
interface ReceiptPreview {
  invoiceNumber?: string;
  date?: string;
  time?: string;
  customerName?: string;
  paymentMethod?: string;
  items?: Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }>;
  subtotal?: number;
  total?: number;
}

export function PrintTicketModal({ invoiceNumber, total, tenantId, printFn, onClose, receipt }: {
  invoiceNumber?: string;
  total?: number;
  tenantId?: string;
  printFn: () => Promise<void>;
  onClose: () => void;
  receipt?: ReceiptPreview;
}) {
  const [status, setStatus] = useState<'printing' | 'ok' | 'error'>('printing');
  const [connecting, setConnecting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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
          {receipt && (
            <button onClick={() => setShowPreview(v => !v)}
              className="w-full text-center text-xs font-bold text-cyan-700 underline">
              {showPreview ? 'Ocultar factura' : 'Ver factura'}
            </button>
          )}
          {receipt && showPreview && (
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 font-mono text-[11px] leading-snug max-h-56 overflow-y-auto">
              <p className="text-center font-black">TICKET DE VENTA</p>
              {receipt.invoiceNumber && <p className="text-center">#{receipt.invoiceNumber}</p>}
              {(receipt.date || receipt.time) && <p className="text-center text-gray-500">{receipt.date} {receipt.time}</p>}
              {receipt.customerName && <p className="text-center">{receipt.customerName}</p>}
              <div className="border-t border-dashed border-gray-300 my-1.5" />
              {(receipt.items ?? []).map((it, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{it.quantity} × {it.name}</span>
                  <span>{fmt(it.subtotal)}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-gray-300 my-1.5" />
              <div className="flex justify-between font-black text-xs"><span>TOTAL</span><span>{fmt(receipt.total ?? 0)}</span></div>
              {receipt.paymentMethod && <p className="text-center mt-1">{receipt.paymentMethod}</p>}
            </div>
          )}
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
