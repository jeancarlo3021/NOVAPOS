import React, { useEffect, useState } from 'react';
import { X, Package, Loader, Printer, WifiOff } from 'lucide-react';
import { inventoryPurchasesService } from '@/services/Inventory/inventoryPurchasesService';
import { purchasesOfflineService } from '@/services/Inventory/purchasesOfflineService';
import { useTenantId } from '@/hooks/useTenant';

interface PurchaseDetailModalProps {
  purchaseId: string;
  onClose: () => void;
}

export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({ purchaseId, onClose }) => {
  const { tenantId } = useTenantId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [purchase, setPurchase] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  console.log('PurchaseDetailModal mounted with purchaseId:', purchaseId);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    console.log('useEffect triggered, calling loadPurchaseDetails for:', purchaseId);
    loadPurchaseDetails();
  }, [purchaseId, tenantId]);

  const loadPurchaseDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      let purchaseData: any = null;

      // Try online first
      if (navigator.onLine) {
        try {
          purchaseData = await inventoryPurchasesService.getPurchaseById(purchaseId);
          console.log('PurchaseDetailModal received:', purchaseData);
        } catch (err) {
          console.warn('Failed to fetch from API, trying cache:', err);
          // Fall through to cache
        }
      }

      // If not found online or offline, try cache
      if (!purchaseData && tenantId) {
        const cachedPurchases = await purchasesOfflineService.getMergedPurchases(tenantId);
        purchaseData = cachedPurchases.find((p: any) => p.id === purchaseId);
        if (purchaseData) {
          console.log('Found purchase in cache:', purchaseData);
        }
      }

      if (!purchaseData) {
        throw new Error('No se encontró la orden de compra');
      }

      setPurchase(purchaseData);

      const itemsArray = purchaseData?.purchase_items || purchaseData?.items || [];
      if (Array.isArray(itemsArray)) {
        const normalizedItems = itemsArray.map((item: any) => ({
          ...item,
          product_name: item.product_name || item.product?.name || item.product_id,
        }));
        console.log('Setting items:', normalizedItems);
        setItems(normalizedItems);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar los detalles');
      console.error('Error loading purchase:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <Loader className="animate-spin" size={32} />
          <p className="mt-4 text-gray-600">Cargando detalles...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!purchase) {
    return null;
  }

  const supplierName = (purchase as any).suppliers?.name || (purchase as any).supplier?.name || 'Proveedor desconocido';
  const purchaseItems = items;

  const getStatusLabel = (status: string) => {
    const labels: { [key: string]: string } = {
      'pending': '⏳ Pendiente',
      'received': '✓ Recibida',
      'cancelled': '✕ Cancelada',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'received':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const supplierName = (purchase as any).suppliers?.name || 'Proveedor desconocido';
    const itemsHtml = purchaseItems
      .map(
        (item: any) =>
          `<tr>
            <td style="padding: 8px; text-align: left;">${item.product_name || item.product_id}</td>
            <td style="padding: 8px; text-align: right;">${typeof item.quantity === 'string' ? parseFloat(item.quantity).toFixed(0) : item.quantity}</td>
            <td style="padding: 8px; text-align: right;">₡${typeof item.unit_price === 'string' ? parseFloat(item.unit_price).toFixed(2) : item.unit_price.toFixed(2)}</td>
            <td style="padding: 8px; text-align: right;">₡${typeof item.subtotal === 'string' ? parseFloat(item.subtotal).toFixed(2) : item.subtotal.toFixed(2)}</td>
          </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Orden de Compra #${purchase.purchase_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #1f2937; text-align: center; }
          .header { margin-bottom: 30px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-item { border: 1px solid #ddd; padding: 10px; }
          .info-item p { margin: 5px 0; }
          .label { font-weight: bold; color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; font-weight: bold; }
          td { padding: 8px; border-bottom: 1px solid #ddd; }
          .total-section { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
          .notes { margin-top: 20px; padding: 10px; background: #f9fafb; border: 1px solid #ddd; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ORDEN DE COMPRA</h1>
          <p style="text-align: center; margin: 5px 0; color: #666;">Nº ${purchase.purchase_number}</p>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <p class="label">PROVEEDOR</p>
            <p>${supplierName}</p>
          </div>
          <div class="info-item">
            <p class="label">FECHA DE COMPRA</p>
            <p>${new Date(purchase.purchase_date).toLocaleDateString('es-ES')}</p>
          </div>
          <div class="info-item">
            <p class="label">ENTREGA ESPERADA</p>
            <p>${purchase.expected_delivery_date ? new Date(purchase.expected_delivery_date).toLocaleDateString('es-ES') : '—'}</p>
          </div>
          <div class="info-item">
            <p class="label">ESTADO</p>
            <p>${getStatusLabel(purchase.status)}</p>
          </div>
        </div>

        <h3 style="margin-bottom: 10px;">PRODUCTOS</h3>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align: right;">Cantidad</th>
              <th style="text-align: right;">Precio Unit.</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="total-section">
          Total de Compra: ₡${typeof purchase.total_amount === 'string' ? parseFloat(purchase.total_amount).toFixed(2) : purchase.total_amount.toFixed(2)}
        </div>

        ${purchase.notes ? `<div class="notes"><strong>Notas:</strong><p>${purchase.notes}</p></div>` : ''}

        <script>
          window.print();
          window.onafterprint = function() { window.close(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center sticky top-0">
          <h2 className="text-xl font-bold text-white">Compra #{purchase.purchase_number}</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Información General */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Proveedor</p>
              <p className="font-semibold text-gray-900">{supplierName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Fecha de Compra</p>
              <p className="font-semibold text-gray-900">
                {new Date(purchase.purchase_date).toLocaleDateString('es-ES')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Entrega Esperada</p>
              <p className="font-semibold text-gray-900">
                {purchase.expected_delivery_date
                  ? new Date(purchase.expected_delivery_date).toLocaleDateString('es-ES')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Estado</p>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(purchase.status)}`}>
                {getStatusLabel(purchase.status)}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="border-t pt-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package size={18} className="text-blue-600" />
              Productos ({purchaseItems.length})
            </h3>

            {purchaseItems.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Sin productos registrados</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Producto</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Cantidad</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Precio Unit.</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Subtotal</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Recibido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {purchaseItems.map((item: any, idx: number) => (
                      <tr key={item.id || idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {item.product_name || item.product_id}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {typeof item.quantity === 'string' ? parseFloat(item.quantity).toFixed(0) : item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          ₡{typeof item.unit_price === 'string' ? parseFloat(item.unit_price).toFixed(2) : item.unit_price.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          ₡{typeof item.subtotal === 'string' ? parseFloat(item.subtotal).toFixed(2) : item.subtotal.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold">
                            {item.received_quantity || 0}/{typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 flex justify-between items-center">
            <span className="font-semibold text-gray-700">Total de Compra</span>
            <span className="text-2xl font-bold text-blue-700">
              ₡{typeof purchase.total_amount === 'string' ? parseFloat(purchase.total_amount).toFixed(2) : purchase.total_amount.toFixed(2)}
            </span>
          </div>

          {/* Notas */}
          {purchase.notes && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Notas</p>
              <p className="text-sm text-gray-600">{purchase.notes}</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={handlePrint}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition flex items-center gap-2"
            >
              <Printer size={18} />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
