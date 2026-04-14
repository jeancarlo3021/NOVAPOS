import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

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
        <div className="bg-white rounded-lg p-6">Cargando...</div>
      </div>
    );
  }

  if (!purchase) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Compra #{purchase.purchase_number}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 pb-6 border-b">
          <div>
            <p className="text-sm text-gray-600">Proveedor</p>
            <p className="font-semibold">{purchase.supplier_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Estado</p>
            <p className="font-semibold">{purchase.status}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Fecha de compra</p>
            <p className="font-semibold">{new Date(purchase.purchase_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Fecha esperada</p>
            <p className="font-semibold">{new Date(purchase.expected_delivery_date).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold mb-4">Productos</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Producto</th>
                <th className="text-right py-2">Cantidad</th>
                <th className="text-right py-2">Precio</th>
                <th className="text-right py-2">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map(item => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.product_name}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">${item.unit_price.toFixed(2)}</td>
                  <td className="text-right">${item.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-6 pb-6 border-b text-right">
          <p className="text-gray-600">Total</p>
          <p className="text-2xl font-bold">${purchase.total_amount.toFixed(2)}</p>
        </div>

        {purchase.notes && (
          <div className="mb-6">
            <p className="text-sm text-gray-600">Notas</p>
            <p className="text-gray-900">{purchase.notes}</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};
