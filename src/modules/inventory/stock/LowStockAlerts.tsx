import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { inventoryProductsService } from '@/services/InventoryProductsService';
import { useAuth } from '@/context/AuthContext';

export const LowStockAlerts: React.FC = () => {
  const { user } = useAuth();
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id) {
      fetchLowStockProducts();
    }
  }, [user?.tenant_id]);

  const fetchLowStockProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryProductsService.getLowStockProducts(user!.tenant_id);
      setLowStockProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar alertas');
      console.error('Error fetching low stock products:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Cargando alertas...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={fetchLowStockProducts}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Reintentar
        </button>
      </div>
    );
  }

  if (lowStockProducts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-green-800">✓ Todos los productos tienen stock suficiente</p>
      </div>
    );
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="text-yellow-600" size={20} />
        <h3 className="font-semibold text-yellow-900">
          {lowStockProducts.length} Producto(s) con Stock Bajo
        </h3>
      </div>
      <div className="space-y-2">
        {lowStockProducts.map((product: any) => (
          <div key={product.id} className="text-sm text-yellow-800 bg-white bg-opacity-50 p-2 rounded">
            <p className="font-medium">{product.name}</p>
            <p className="text-xs">
              Stock: {product.quantity_on_hand} / Mínimo: {product.reorder_level}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};