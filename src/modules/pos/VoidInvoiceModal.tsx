import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Ban, Lock, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { invoicesService } from '@/services/invoice/invoiceService';
import { posOfflineService } from '@/services/pos/posOfflineService';
import { useTenantId } from '@/hooks/useTenant';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  issued_at: string;
  total: number;
  payment_method: string;
  status?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  sinpe: 'SINPE',
};

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

interface Props {
  sessionId: string | null;
  onClose: () => void;
  onVoided: (invoiceNumber: string) => void;
}

export const VoidInvoiceModal: React.FC<Props> = ({ sessionId, onClose, onVoided }) => {
  const { tenantId } = useTenantId();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [storedPin, setStoredPin] = useState<string>('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoadingList(true);
    try {
      const settings = await apiFetch<any>('/settings/general');

      // Try various possible PIN field names
      const pin = settings?.void_pin
        ?? settings?.voidPin
        ?? settings?.void_code
        ?? settings?.voidCode
        ?? settings?.PIN
        ?? '';

      setStoredPin(pin);

      let invoiceData: InvoiceRow[] = [];

      if (isOnline) {
        // Online: fetch from API and cache
        // Traemos todas (completadas y anuladas) para que el usuario vea cuáles
        // ya fueron anuladas. El back devuelve `status` en cada fila.
        const params = new URLSearchParams({ limit: '60' });
        if (sessionId) {
          params.set('session_id', sessionId);
        } else {
          const today = new Date().toISOString().slice(0, 10);
          params.set('from', `${today}T00:00:00`);
        }
        const data = await apiFetch<InvoiceRow[]>(`/invoices?${params.toString()}`);
        invoiceData = data ?? [];

        // Combine API invoices with cached ones (to show both)
        const cached = posOfflineService.getCachedInvoices();
        const combined = [
          ...invoiceData,
          ...cached.filter(c => !invoiceData.some(a => a.id === c.id)) // Avoid duplicates
        ];

        // Cache the invoices for offline use
        posOfflineService.cacheInvoices(combined as any);
        invoiceData = combined;
      } else {
        // Offline: use cached invoices
        invoiceData = posOfflineService.getCachedInvoices() as any;

        // Also log what's in the cache
        invoiceData.forEach(inv => {
        });
      }

      if (invoiceData.length === 0) {
      }

      setInvoices(invoiceData);
    } catch (e) {

      // Fallback to cached invoices on error
      const cached = posOfflineService.getCachedInvoices();
      setInvoices(cached as any);
    } finally {
      setLoadingList(false);
    }
  }, [tenantId, sessionId, isOnline]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const filtered = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(search.toLowerCase())
  );

  const handleVoid = async () => {
    if (!selected) return;
    if (storedPin && pin !== storedPin) {
      setPinError('PIN incorrecto');
      setPin('');
      return;
    }
    setVoiding(true);
    try {
      if (isOnline) {
        // Online: cancel immediately
        await invoicesService.cancelInvoice(selected.id);
        onVoided(selected.invoice_number);
      } else {
        // Offline: queue the void operation
        await posOfflineService.queueVoid(selected.id, selected.invoice_number);
        setPinError('');
        onVoided(selected.invoice_number);
      }
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Error al anular la factura');
      setVoiding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVoid();
    if (e.key === 'Escape') {
      if (selected) { setSelected(null); setPin(''); setPinError(''); }
      else onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Ban size={20} className="text-red-500" />
            <h2 className="text-lg font-black text-gray-900">Anular Factura</h2>
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

        {selected ? (
          /* ── PIN confirmation step ───────────────────────────────────────── */
          <div className="p-6 space-y-5" onKeyDown={handleKeyDown}>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p className="text-red-800 font-bold text-sm">¿Anular esta factura?</p>
              <p className="text-red-700 text-sm">
                <span className="font-mono font-black">{selected.invoice_number}</span>
                {' — '}{fmt(selected.total)}
              </p>
              <p className="text-xs text-red-500">Esta acción no se puede deshacer.</p>
            </div>

            {storedPin ? (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                  <Lock size={14} />
                  PIN de autorización
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
                  placeholder="••••"
                  autoFocus
                  className={`w-full text-center text-2xl tracking-[0.4em] font-mono px-4 py-3 border-2 rounded-xl outline-none transition ${
                    pinError ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-red-500'
                  }`}
                />
                {pinError && (
                  <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} />{pinError}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-800 font-semibold text-sm flex items-center gap-1.5">
                  <AlertCircle size={14} />Sin PIN configurado
                </p>
                <p className="text-amber-600 text-xs mt-1">
                  Configure un PIN en Configuración → General para proteger esta acción.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setSelected(null); setPin(''); setPinError(''); }}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Volver
              </button>
              <button
                onClick={handleVoid}
                disabled={voiding || (!!storedPin && pin.length === 0)}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold transition"
              >
                {voiding ? 'Anulando…' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Invoice list step ───────────────────────────────────────────── */
          <>
            <div className="px-6 py-3 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por número de factura…"
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-400 transition"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingList ? (
                <div className="flex items-center justify-center py-14">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-gray-400 text-center py-14 text-sm">
                  {search ? 'No se encontraron facturas' : 'No hay facturas completadas en esta sesión'}
                </p>
              ) : (
                filtered.map(inv => {
                  const isCancelled = inv.status === 'cancelled';
                  return (
                    <div
                      key={inv.id}
                      className={`flex items-center justify-between border rounded-xl px-4 py-3 transition ${
                        isCancelled
                          ? 'bg-red-50/60 border-red-200 opacity-75'
                          : 'bg-gray-50 border-gray-200 hover:border-red-200 hover:bg-red-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-mono font-black text-sm ${isCancelled ? 'text-red-700 line-through' : 'text-gray-900'}`}>
                            {inv.invoice_number}
                          </p>
                          {isCancelled && (
                            <span className="text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded uppercase tracking-wider">
                              Anulada
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {new Date(inv.issued_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{PAYMENT_LABELS[inv.payment_method] ?? inv.payment_method}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-bold text-sm ${isCancelled ? 'text-red-500 line-through' : 'text-gray-800'}`}>
                          {fmt(inv.total)}
                        </span>
                        {isCancelled ? (
                          <span className="text-xs font-bold text-gray-400 px-3 py-1.5">—</span>
                        ) : (
                          <button
                            onClick={() => setSelected(inv)}
                            className="text-xs font-bold text-red-600 border border-red-300 bg-white hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg transition"
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 shrink-0">
              <p className="text-xs text-gray-400 text-center">
                Facturas completadas de la sesión actual · máximo 60
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
