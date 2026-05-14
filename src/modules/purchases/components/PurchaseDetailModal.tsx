import React, { useState, useEffect } from 'react';
import { Loader, Printer } from 'lucide-react';
import { inventoryPurchasesService } from '@/services/Inventory/inventoryPurchasesService';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { StatusBadge } from './StatusBadge';
import { Status } from './types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PurchaseDetailModalProps {
  purchase: any;
  onClose: () => void;
  tenantId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PurchaseDetailModal({ purchase, onClose, tenantId }: PurchaseDetailModalProps) {
  const [detail, setDetail]         = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [printing, setPrinting]     = useState(false);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (navigator.onLine) {
        try {
          const d = await inventoryPurchasesService.getPurchaseById(purchase.id);
          setDetail(d ?? purchase);
        } catch {
          setDetail(purchase);
        }
      } else {
        setDetail(purchase);
      }
      setLoading(false);
    };
    load();
  }, [purchase.id]);

  const handlePrint = async () => {
    const data  = detail ?? purchase;
    const items = Array.isArray(data.items) ? data.items : [];
    setPrinting(true);
    setPrintError('');
    try {
      await posPrinterService.printPurchaseOrder({
        purchase_number:        data.purchase_number,
        purchase_date:          data.purchase_date,
        expected_delivery_date: data.expected_delivery_date,
        supplier_name:          (data.supplier as any)?.name ?? '—',
        supplier_phone:         (data.supplier as any)?.phone ?? null,
        items: items.map((it: any) => ({
          product_name: it.product?.name ?? 'Producto',
          quantity:     Number(it.quantity ?? 0),
          unit_price:   Number(it.unit_price ?? 0),
          subtotal:     Number(it.subtotal ?? 0),
        })),
        total_amount: data.total_amount ?? 0,
        notes: data.notes,
      }, tenantId);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir');
    } finally {
      setPrinting(false);
    }
  };

  const data         = detail ?? purchase;
  const supplierName = (data.supplier as any)?.name ?? '—';
  const items: any[] = Array.isArray(data.items) ? data.items : [];
  const fmt2         = (n: number) => `₡${Number(n).toLocaleString('es-CR')}`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
        <div className="bg-blue-600 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-white font-black text-lg">{purchase.purchase_number}</h2>
            <p className="text-blue-200 text-sm">{supplierName}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={purchase.status as Status} />
            <button onClick={handlePrint} disabled={printing || loading} title="Imprimir"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition">
              {printing ? <><Loader size={13} className="animate-spin" /> Imprimiendo...</> : <><Printer size={13} /> Imprimir</>}
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition">✕</button>
          </div>
        </div>
        {printError && <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-4 py-2">{printError}</div>}
        <div className="p-6 space-y-5">
          {loading && <div className="flex justify-center py-6"><Loader size={20} className="animate-spin text-gray-400" /></div>}
          {!loading && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Fecha de compra',  value: data.purchase_date          ? new Date(data.purchase_date).toLocaleDateString('es-CR')          : '—' },
                  { label: 'Entrega esperada', value: data.expected_delivery_date ? new Date(data.expected_delivery_date).toLocaleDateString('es-CR') : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 font-semibold">{label}</p>
                    <p className="font-bold text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Productos {items.length > 0 && <span className="text-gray-400 font-normal normal-case">({items.length})</span>}
                </p>
                {items.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">Sin productos registrados</div>
                ) : (
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500">Producto</th>
                          <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500">Cant.</th>
                          <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500">Precio</th>
                          <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map((item: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">{item.product?.name ?? `Producto ${i + 1}`}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600">{item.quantity}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600">{fmt2(item.unit_price ?? 0)}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmt2(item.subtotal ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center bg-blue-50 border border-blue-100 rounded-xl px-5 py-3">
                <span className="font-bold text-gray-700">Total</span>
                <span className="text-2xl font-black text-blue-700">{fmt2(data.total_amount ?? 0)}</span>
              </div>
              {data.notes && (
                <div className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-gray-400 mb-1">Notas</p>
                  <p className="text-sm text-gray-700">{data.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
