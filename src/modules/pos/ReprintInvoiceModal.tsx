import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Printer, WifiOff, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { invoicesService, type Invoice, type InvoiceItem } from '@/services/invoice/invoiceService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { posOfflineService } from '@/services/pos/posOfflineService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { useTenantId } from '@/hooks/useTenant';
import { formatWallClock } from '@/utils/datetime';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  issued_at: string;
  total: number;
  payment_method: string;
  payments?: { method: 'cash' | 'card' | 'sinpe'; amount: number; voucher_number?: string }[] | null;
  fe_clave?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  sinpe: 'SINPE',
};

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

interface Props {
  onClose: () => void;
  cashierName?: string;
}

/**
 * Modal para reimprimir facturas — NO está limitado a la sesión actual.
 * Lista todas las facturas completadas (hasta 300) y al tocar una se
 * vuelve a imprimir el ticket con el mismo formato que el original.
 */
export const ReprintInvoiceModal: React.FC<Props> = ({ onClose, cashierName }) => {
  const { tenantId } = useTenantId();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoadingList(true);
    try {
      let data: InvoiceRow[] = [];
      if (isOnline) {
        const params = new URLSearchParams({ status: 'completed', limit: '300' });
        const remote = await apiFetch<InvoiceRow[]>(`/invoices?${params.toString()}`);
        data = remote ?? [];

        const cached = posOfflineService.getCachedInvoices();
        const combined = [
          ...data,
          ...cached.filter(c => !data.some(a => a.id === c.id)),
        ];
        posOfflineService.cacheInvoices(combined as any);
        data = combined;
      } else {
        data = posOfflineService.getCachedInvoices() as any;
      }
      setInvoices(data);
    } catch {
      const cached = posOfflineService.getCachedInvoices();
      setInvoices(cached as any);
    } finally {
      setLoadingList(false);
    }
  }, [tenantId, isOnline]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const filtered = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(search.toLowerCase())
  );

  const handleReprint = async (row: InvoiceRow) => {
    if (!tenantId) return;
    setError('');
    setPrintingId(row.id);
    try {
      // Trae la factura con sus items (el endpoint /invoices/:id incluye items)
      const full = (await invoicesService.getInvoiceById(row.id)) as Invoice & { items: InvoiceItem[] };

      // Datos de la tienda desde el cache local de settings
      const cachedGeneral =
        cacheGet<any>(cacheKey(tenantId, 'settings_general'))
        ?? cacheGet<any>(cacheKey(tenantId, 'general_settings'));
      const general = cachedGeneral?.config ?? cachedGeneral;

      const date = new Date(full.created_at);

      await posPrinterService.printAuto(
        {
          invoiceNumber: `${full.invoice_number} (Reimpresión)`,
          date: date.toLocaleDateString('es-CR'),
          time: date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }),
          items: (full.items ?? []).map(it => ({
            name: it.product_name,
            quantity: it.quantity,
            unitPrice: it.unit_price,
            subtotal: it.subtotal,
          })),
          subtotal: full.subtotal,
          tax: full.tax_amount,
          total: full.total,
          paymentMethod: PAYMENT_LABELS[full.payment_method] ?? full.payment_method,
          payments: (full as any).payments && (full as any).payments.length > 1
            ? (full as any).payments
            : undefined,
          storeName: general?.businessName,
          storeRuc: general?.ruc,
          storeCedula: general?.cedula,
          storeAddress: general?.address,
          storeCity: general?.city,
          storePhone: general?.phone,
          cashierName,
          customerName: full.customer_name ?? undefined,
        },
        tenantId,
      );

      setDoneId(row.id);
      setTimeout(() => setDoneId(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reimprimir la factura');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Printer size={20} className="text-blue-500" />
            <h2 className="text-lg font-black text-gray-900">Reimprimir Factura</h2>
            {!isOnline && (
              <span className="inline-flex items-center gap-1 ml-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-lg">
                <WifiOff size={12} />
                Offline
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por número de factura…"
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 transition"
              autoFocus
            />
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 shrink-0">
            {error}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loadingList ? (
            <div className="flex items-center justify-center py-14">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-gray-400 text-center py-14 text-sm">
              {search ? 'No se encontraron facturas' : 'No hay facturas completadas'}
            </p>
          ) : (
            filtered.map(inv => {
              const isPrinting = printingId === inv.id;
              const isDone = doneId === inv.id;
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-200 hover:bg-blue-50 transition"
                >
                  <div>
                    <p className="font-mono font-black text-gray-900 text-sm">{inv.invoice_number}</p>
                    <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>
                        {formatWallClock(inv.issued_at, {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <span>·</span>
                      {inv.payments && inv.payments.length > 1 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-bold text-[10px]">
                          MIXTO ({inv.payments.map(p => PAYMENT_LABELS[p.method]?.[0] ?? p.method[0].toUpperCase()).join('+')})
                        </span>
                      ) : (
                        <span>{PAYMENT_LABELS[inv.payment_method] ?? inv.payment_method}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-800 text-sm">{fmt(inv.total)}</span>
                    <button
                      onClick={() => handleReprint(inv)}
                      disabled={isPrinting}
                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${
                        isDone
                          ? 'bg-emerald-500 text-white border border-emerald-500'
                          : isPrinting
                          ? 'bg-gray-200 text-gray-500'
                          : 'text-blue-600 border border-blue-300 bg-white hover:bg-blue-600 hover:text-white'
                      }`}
                    >
                      {isDone ? (
                        <><CheckCircle2 size={13} /> Impreso</>
                      ) : isPrinting ? (
                        <>Imprimiendo…</>
                      ) : (
                        <><Printer size={13} /> Reimprimir</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 shrink-0">
          <p className="text-xs text-gray-400 text-center">
            Mostrando hasta las últimas 300 facturas (independiente de la caja actual)
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReprintInvoiceModal;
