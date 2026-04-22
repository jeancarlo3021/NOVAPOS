import React, { useState, useEffect } from 'react';
import { X, Package, Truck, Calendar, FileText } from 'lucide-react';
import { Card, CardHeader, CardContent, Badge } from '@/components/ui/uiComponents';

interface PurchaseDetailProps {
  purchaseId: number;
  onClose: () => void;
}

interface PurchaseItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  received_quantity: number;
}

interface Purchase {
  id: number;
  purchase_number: string;
  supplier_name: string;
  purchase_date: string;
  expected_delivery_date: string;
  actual_delivery_date: string;
  status: string;
  total_amount: number;
  notes: string;
  items: PurchaseItem[];
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'completed': return 'success';
    case 'pending': return 'warning';
    case 'cancelled': return 'error';
    default: return 'info';
  }
};

const getStatusLabel = (status: string) => {
  const labels: { [key: string]: string } = {
    'completed': 'Completada',
    'pending': 'Pendiente',
    'cancelled': 'Cancelada',
    'in_transit': 'En tránsito'
  };
  return labels[status] || status;
};

export const PurchaseDetail: React.FC<PurchaseDetailProps> = ({ purchaseId, onClose }) => {
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPurchaseDetail();
  }, [purchaseId]);

  const fetchPurchaseDetail = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/purchases/${purchaseId}`);
      const data = await response.json();
      setPurchase(data);
    } catch (error) {
      console.error('Error fetching purchase detail:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-96">
          <CardContent className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            <span className="ml-3 text-gray-600">Cargando detalles...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!purchase) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
      <Card className="w-full max-w-3xl my-8">
        {/* Header */}
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Compra #{purchase.purchase_number}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition">
            <X size={24} />
          </button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between pb-4 border-b">
            <span className="text-gray-600">Estado:</span>
            <Badge variant={getStatusBadgeVariant(purchase.status)}>
              {getStatusLabel(purchase.status)}
            </Badge>
          </div>

          {/* Supplier & Dates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Truck className="text-brand-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="text-sm text-gray-600">Proveedor</p>
                  <p className="font-semibold text-gray-900">{purchase.supplier_name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="text-brand-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="text-sm text-gray-600">Fecha de Compra</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(purchase.purchase_date).toLocaleDateString('es-ES', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Truck className="text-orange-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="text-sm text-gray-600">Entrega Esperada</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(purchase.expected_delivery_date).toLocaleDateString('es-ES', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>

              {purchase.actual_delivery_date && (
                <div className="flex items-start gap-3">
                  <Truck className="text-green-500 mt-1 flex-shrink-0" size={20} />
                  <div>
                    <p className="text-sm text-gray-600">Entrega Real</p>
                    <p className="font-semibold text-gray-900">
                      {new Date(purchase.actual_delivery_date).toLocaleDateString('es-ES', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="border-t pt-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package size={18} className="text-brand-500" />
              Productos ({purchase.items.length})
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Producto</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Cantidad</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Precio Unit.</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Recibido</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchase.items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-900 font-medium">{item.product_name}</td>
                      <td className="text-right px-4 py-3 text-gray-600">{item.quantity}</td>
                      <td className="text-right px-4 py-3 text-gray-600">${item.unit_price.toFixed(2)}</td>
                      <td className="text-right px-4 py-3">
                        <Badge variant={item.received_quantity === item.quantity ? 'success' : 'warning'}>
                          {item.received_quantity}/{item.quantity}
                        </Badge>
                      </td>
                      <td className="text-right px-4 py-3 font-semibold text-gray-900">${item.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total */}
          <div className="bg-gradient-to-r from-brand-50 to-brand-100 rounded-lg p-4 flex items-center justify-between border border-brand-200">
            <span className="font-semibold text-gray-900">Total de Compra:</span>
            <span className="text-2xl font-bold text-brand-600">${purchase.total_amount.toFixed(2)}</span>
          </div>

          {/* Notes */}
          {purchase.notes && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileText className="text-blue-600 mt-1 flex-shrink-0" size={18} />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Notas</p>
                  <p className="text-sm text-blue-800 mt-1">{purchase.notes}</p>
                </div>
              </div>
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
          >
            Cerrar
          </button>
        </CardContent>
      </Card>
    </div>
  );
};