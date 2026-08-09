import React, { useEffect, useState } from 'react';
import { Ban, Lock, AlertCircle, Loader2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { invoicesService } from '@/services/invoice/invoiceService';

/**
 * Confirmación de anulación de UNA venta ya identificada.
 *
 * Existe aparte de `VoidInvoiceModal` porque ese modal resuelve otro problema:
 * BUSCAR la factura entre las últimas 300 del POS, con cola offline y la opción
 * de pasar a crédito. Cuando la venta ya está en pantalla —el detalle de un
 * reporte, por ejemplo— esa búsqueda estorba, pero el resto del procedimiento es
 * el mismo y no debería divergir: PIN, motivo, anular, y Nota de Crédito si el
 * comprobante salió a Hacienda.
 *
 * Requiere conexión a propósito: la cola offline vive en el servicio del POS y
 * anular desde un reporte sin saber si se aplicó es peor que no poder hacerlo.
 */
export interface VoidableSale {
  id: string;
  invoice_number: string;
  total: number;
  /** Si tiene, el comprobante salió a Hacienda y hay que anularlo con NC. */
  fe_clave?: string | null;
  /** Si tiene, ya se le emitió la Nota de Crédito. */
  fe_nc_clave?: string | null;
}

interface Props {
  sale: VoidableSale;
  /** Texto que acompaña al número de factura ("Venta de delivery", …). */
  label?: string;
  onClose: () => void;
  /** Se llama cuando la anulación quedó aplicada. */
  onVoided: (sale: VoidableSale, warning?: string) => void;
}

const fmt = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR')}`;

export const VoidSaleDialog: React.FC<Props> = ({ sale, label, onClose, onVoided }) => {
  const [storedPin, setStoredPin] = useState<string>('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('Anulación por error en facturación');
  const [busy, setBusy] = useState(false);

  // El PIN es el MISMO de Ajustes → General que usa el POS: si el negocio ya
  // protegió las anulaciones ahí, no tiene por qué configurarlo otra vez acá.
  useEffect(() => {
    let alive = true;
    apiFetch<any>('/settings/general')
      .then(s => { if (alive) setStoredPin(s?.void_pin ?? s?.voidPin ?? ''); })
      .catch(() => { /* sin PIN configurado */ });
    return () => { alive = false; };
  }, []);

  const needsNote = !!sale.fe_clave && !sale.fe_nc_clave;

  const submit = async () => {
    if (storedPin && pin !== storedPin) { setError('PIN incorrecto'); setPin(''); return; }
    if (!navigator.onLine) { setError('Necesitás conexión para anular.'); return; }
    const motivo = reason.trim() || 'Anulación por error en facturación';
    setBusy(true);
    try {
      await invoicesService.cancelInvoice(sale.id);
      // La factura YA quedó anulada en el sistema. Si la Nota de Crédito falla,
      // no se deshace nada: se avisa, porque queda pendiente ante Hacienda.
      if (needsNote) {
        try {
          const { haciendaService } = await import('@/services/hacienda/haciendaService');
          await haciendaService.creditNote(sale.id, motivo);
        } catch (e) {
          onVoided(sale, `Venta anulada, pero falló la Nota de Crédito en Hacienda: ${
            e instanceof Error ? e.message : 'error'}. Emitila desde FE Facturas.`);
          return;
        }
      }
      onVoided(sale);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 flex items-center gap-2">
            <Ban size={18} className="text-red-500" /> Anular venta
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4" onKeyDown={e => { if (e.key === 'Enter') void submit(); }}>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
            <p className="text-red-800 font-bold text-sm">¿Anular esta venta?</p>
            <p className="text-red-700 text-sm">
              <span className="font-mono font-black">{sale.invoice_number}</span> — {fmt(sale.total)}
              {label ? <span className="block text-xs">{label}</span> : null}
            </p>
            <p className="text-xs text-red-500">
              Se devuelve el stock y se revierte el movimiento de caja. No se puede deshacer.
            </p>
            {needsNote && (
              <p className="text-xs text-red-700 font-semibold pt-1 border-t border-red-200 mt-1">
                Comprobante electrónico: se emitirá una <b>Nota de Crédito</b> a Hacienda.
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Motivo</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 160))}
              rows={2}
              placeholder="Ej. El cliente rechazó el pedido…"
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-xl text-sm outline-none focus:border-red-500 resize-none"
            />
            {needsNote && (
              <p className="text-[11px] text-gray-400 mt-1">Se usará como razón de la Nota de Crédito.</p>
            )}
          </div>

          {storedPin ? (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                <Lock size={14} /> PIN de autorización
              </label>
              <input
                type="password" inputMode="numeric" maxLength={8}
                value={pin} autoFocus
                onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="••••"
                className={`w-full text-center text-2xl tracking-[0.4em] font-mono px-4 py-3 border-2 rounded-xl outline-none ${
                  error ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-red-500'
                }`}
              />
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-amber-800 font-semibold text-xs flex items-center gap-1.5">
                <AlertCircle size={13} /> Sin PIN configurado
              </p>
              <p className="text-amber-600 text-[11px] mt-0.5">
                Poné uno en Configuración → General para proteger esta acción.
              </p>
            </div>
          )}

          {error && (
            <p className="text-red-600 text-xs flex items-center gap-1"><AlertCircle size={12} /> {error}</p>
          )}

          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={submit} disabled={busy || (!!storedPin && pin.length === 0)}
              className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-bold flex items-center justify-center gap-2">
              {busy ? <><Loader2 size={15} className="animate-spin" /> Anulando…</> : 'Anular venta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoidSaleDialog;
