import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck, Truck, X, WifiOff, AlertTriangle, Loader,
  CheckCircle2,
} from 'lucide-react';
import { inventoryPurchasesService } from '@/services/Inventory/inventoryPurchasesService';
import { purchasesOfflineService } from '@/services/Inventory/purchasesOfflineService';
import { ReviewItem, fmt } from './types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReceiveReviewModalProps {
  purchase: any;
  tenantId: string;
  canUpdateStock: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReceiveReviewModal({ purchase, tenantId, canUpdateStock, onClose, onConfirmed }: ReceiveReviewModalProps) {
  const [items, setItems]         = useState<ReviewItem[]>([]);
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const supplierName = (purchase.supplier as any)?.name ?? '—';

  useEffect(() => {
    const loadDetail = async () => {
      try {
        // Try network; fall back to items already embedded in the list object
        let detail = purchase;
        if (navigator.onLine) {
          try {
            detail = await inventoryPurchasesService.getPurchaseById(purchase.id) ?? purchase;
          } catch {
            // use cached list data
          }
        }
        const raw: ReviewItem[] = (detail?.purchase_items ?? []).map((it: any) => ({
          id:             it.id,
          product_id:     it.product_id,
          product_name:   it.product?.name ?? it.product?.sku ?? 'Producto',
          qty_ordered:    Number(it.quantity ?? 0),
          qty_received:   Number(it.quantity ?? 0),
          price_ordered:  Number(it.unit_price ?? 0),
          price_received: Number(it.unit_price ?? 0),
        }));
        setItems(raw);
      } catch {
        setError('No se pudo cargar el detalle de la orden');
      } finally {
        setLoading(false);
      }
    };

    const handleOnline  = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    loadDetail();
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [purchase.id]);

  const updateItem = (idx: number, patch: Partial<ReviewItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const totalOrdered  = items.reduce((s, it) => s + it.qty_ordered  * it.price_ordered,  0);
  const totalReceived = items.reduce((s, it) => s + it.qty_received * it.price_received, 0);
  const hasDiff = items.some(it => it.qty_received !== it.qty_ordered || it.price_received !== it.price_ordered);

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    try {
      const receiveData = {
        purchaseId:    purchase.id,
        tenantId,
        items: items.map(it => ({
          id:             it.id,
          product_id:     it.product_id,
          qty_received:   it.qty_received,
          price_received: it.price_received,
        })),
        notes,
        canUpdateStock,
        totalReceived,
        supplierTerms: (purchase.supplier as any)?.payment_terms ?? '',
        supplierId:    purchase.supplier_id,
        purchaseNumber: purchase.purchase_number,
        supplierName,
      };

      if (!navigator.onLine) {
        await purchasesOfflineService.queueReceive(receiveData);
      } else {
        // Execute online immediately via the offline service's sync method
        await purchasesOfflineService._syncReceive({ ...receiveData, createdAt: new Date().toISOString() });
      }
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar la recepción');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="bg-emerald-600 px-6 py-4 flex items-start justify-between rounded-t-2xl shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <ClipboardCheck size={18} className="text-emerald-200" />
              <h2 className="text-white font-black text-lg">Revisión de Recepción</h2>
              {isOffline && (
                <span className="flex items-center gap-1 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">
                  <WifiOff size={10} /> offline
                </span>
              )}
            </div>
            <p className="text-emerald-200 text-sm">
              {purchase.purchase_number} · <Truck className="inline w-3 h-3 mr-0.5" />{supplierName}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
          {isOffline && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-orange-700">
              <WifiOff size={15} className="shrink-0 mt-0.5" />
              Sin conexión. La recepción se guardará localmente y se sincronizará al reconectarse.
            </div>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
            <AlertTriangle size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Ajusta las cantidades y precios según la factura del proveedor.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader size={24} className="animate-spin text-gray-400" /></div>
          ) : (
            <>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Producto</th>
                      <th className="text-center px-3 py-3 text-xs font-bold text-gray-500 uppercase">Cant. Orden</th>
                      <th className="text-center px-3 py-3 text-xs font-bold text-emerald-700 uppercase">Cant. Recibida ✎</th>
                      <th className="text-right px-3 py-3 text-xs font-bold text-gray-500 uppercase">Precio Orden</th>
                      <th className="text-right px-3 py-3 text-xs font-bold text-emerald-700 uppercase">Precio Factura ✎</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => {
                      const diffQty   = item.qty_received !== item.qty_ordered;
                      const diffPrice = item.price_received !== item.price_ordered;
                      return (
                        <tr key={item.id} className={`${diffQty || diffPrice ? 'bg-amber-50/50' : 'hover:bg-gray-50'} transition`}>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.product_name}</td>
                          <td className="px-3 py-3 text-center text-gray-500 font-mono">{item.qty_ordered}</td>
                          <td className="px-3 py-2 text-center">
                            <input type="number" min="0" step="1" value={item.qty_received}
                              onChange={e => updateItem(idx, { qty_received: parseFloat(e.target.value) || 0 })}
                              className={`w-20 text-center px-2 py-1.5 rounded-lg border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 ${diffQty ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200'}`}
                            />
                          </td>
                          <td className="px-3 py-3 text-right text-gray-400 font-mono text-xs">{fmt(item.price_ordered)}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" min="0" step="0.01" value={item.price_received}
                              onChange={e => updateItem(idx, { price_received: parseFloat(e.target.value) || 0 })}
                              className={`w-28 text-right px-2 py-1.5 rounded-lg border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 ${diffPrice ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200'}`}
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">
                            {fmt(item.qty_received * item.price_received)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-600">Totales</td>
                      <td className="px-3 py-3 text-right text-sm text-gray-400">{fmt(totalOrdered)}</td>
                      <td />
                      <td className="px-4 py-3 text-right font-black text-emerald-700">{fmt(totalReceived)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {hasDiff && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle size={15} />
                    <span className="text-sm font-semibold">Hay diferencias vs. la orden original</span>
                  </div>
                  <span className={`text-sm font-black ${totalReceived > totalOrdered ? 'text-red-600' : 'text-emerald-700'}`}>
                    {totalReceived > totalOrdered ? '+' : ''}{fmt(totalReceived - totalOrdered)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Notas de recepción <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Observaciones, daños, faltantes..."
                  rows={2} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
              </div>
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 shrink-0 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} disabled={saving}
            className="px-5 py-2.5 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition text-sm">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving || loading || items.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-400 text-white font-bold rounded-xl transition text-sm">
            {saving
              ? <><Loader size={15} className="animate-spin" /> Guardando...</>
              : isOffline
                ? <><WifiOff size={15} /> Guardar (offline)</>
                : <><CheckCircle2 size={15} /> Confirmar Recepción</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
