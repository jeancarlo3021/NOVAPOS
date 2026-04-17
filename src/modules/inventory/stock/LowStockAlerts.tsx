import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardContent, Spinner, Alert, Badge } from '@/components/ui/uiComponents';
import type { Product } from '@/types/Types_POS';

export const LowStockAlerts: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id) fetchLowStockProducts();
  }, [user?.tenant_id]);

  const fetchLowStockProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryProductsService.getLowStockProducts(user!.tenant_id);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex justify-center"><Spinner /></div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <Alert type="error" message={error} />
        <button
          onClick={fetchLowStockProducts}
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm"
        >
          Reintentar
        </button>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card className="p-8 text-center border-green-200 bg-green-50">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
            <Package className="text-green-600" size={24} />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-green-900">¡Excelente!</h3>
        <p className="text-green-700 mt-1">Todos los productos tienen stock suficiente</p>
      </Card>
    );
  }

  const criticalCount = products.filter(p => p.stock_quantity === 0).length;
  const warningCount = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= (p.min_stock_level ?? 0)).length;

  return (
    <Card className="border-yellow-200 bg-yellow-50 overflow-hidden">
      <CardHeader className="bg-yellow-100 border-b border-yellow-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-200 rounded-lg flex items-center justify-center">
            <AlertTriangle className="text-yellow-700" size={20} />
          </div>
          <div>
            <h3 className="font-bold text-yellow-900 text-lg">
              {products.length} Producto(s) con Stock Bajo
            </h3>
            <p className="text-sm text-yellow-800">
              {criticalCount} crítico(s), {warningCount} advertencia(s)
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="space-y-3">
          {products.map((product) => {
            const minStock = product.min_stock_level ?? 0;
            const stockPct = minStock > 0 ? (product.stock_quantity / minStock) * 100 : 100;
            const isCritical = product.stock_quantity === 0;
            const isWarning = product.stock_quantity > 0 && product.stock_quantity <= minStock;

            return (
              <div
                key={product.id}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  isCritical ? 'bg-red-50 border-red-300'
                  : isWarning ? 'bg-orange-50 border-orange-300'
                  : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-gray-900">{product.name}</h4>
                    <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                  </div>
                  <Badge variant={isCritical ? 'error' : isWarning ? 'warning' : 'default'} className="text-xs">
                    {isCritical ? 'CRÍTICO' : 'ADVERTENCIA'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    Stock actual: <span className="font-bold text-gray-900">{product.stock_quantity}</span>
                  </span>
                  <span className="text-gray-600">
                    Mínimo: <span className="font-bold text-gray-900">{minStock}</span>
                  </span>
                </div>

                <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${isCritical ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(stockPct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <div className="bg-yellow-100 border-t border-yellow-200 px-6 py-3">
        <button
          onClick={fetchLowStockProducts}
          className="w-full text-yellow-700 hover:text-yellow-900 font-medium text-sm py-2 transition-colors"
        >
          ↻ Actualizar alertas
        </button>
      </div>
    </Card>
  );
};
