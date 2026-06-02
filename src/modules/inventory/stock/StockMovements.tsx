import React, { useState } from 'react';
import { RotateCw, Sliders } from 'lucide-react';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useTenantId } from '@/hooks/useTenant';
import { StockAdjustModal } from '../products/StockAdjustModal';
import {
  Card,
  CardContent,
  Spinner,
  Button,
  Badge,
  Divider
} from '@/components/ui/uiComponents';

export const StockMovements: React.FC = () => {
  const { tenantId } = useTenantId();
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);

  const {
    data: productsData,
    loading,
    error,
    retry
  } = useSafeFetch(
    () => inventoryProductsService.getAllProducts(tenantId),
    { timeout: 10000, retries: 2, retryDelay: 1000, key: tenantId }
  );

  const products = Array.isArray(productsData) ? productsData : [];

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Stock de Productos</h2>
        <p className="text-gray-500 mt-1">Revisa el stock actual y realiza ajustes con motivo</p>
      </div>

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-red-800">🚨 {error}</span>
          </div>
          <Button
            onClick={retry}
            size="sm"
            className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
          >
            <RotateCw size={16} />
            Reintentar
          </Button>
        </div>
      )}

      {products.length > 0 && (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Stock Actual de Productos</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
              const isLowStock = product.stock_quantity <= (product.min_stock_level ?? 0);
              const isCritical = product.stock_quantity === 0;

              return (
                <Card
                  key={product.id}
                  className={`border-2 transition-all hover:shadow-md ${
                    isCritical
                      ? 'border-red-300 bg-red-50'
                      : isLowStock
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-gray-900">{product.name}</h4>
                        <p className="text-xs text-gray-500">SKU: {product.sku}</p>
                      </div>
                      {isCritical && (
                        <Badge variant="error" className="text-xs">
                          CRÍTICO
                        </Badge>
                      )}
                      {isLowStock && !isCritical && (
                        <Badge variant="warning" className="text-xs">
                          BAJO
                        </Badge>
                      )}
                    </div>

                    <Divider className="my-3" />

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Stock Actual:</span>
                        <span
                          className={`text-2xl font-bold ${
                            isCritical
                              ? 'text-red-600'
                              : isLowStock
                              ? 'text-orange-600'
                              : 'text-green-600'
                          }`}
                        >
                          {product.stock_quantity}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Mínimo:</span>
                        <span className="font-semibold text-gray-900">{product.min_stock_level}</span>
                      </div>
                    </div>

                    <div className="mt-4 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isCritical
                            ? 'bg-red-500'
                            : isLowStock
                            ? 'bg-orange-500'
                            : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            (product.min_stock_level ?? 0) > 0
                              ? (product.stock_quantity / (product.min_stock_level ?? 1)) * 100
                              : 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setAdjustProductId(product.id)}
                      className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition"
                    >
                      <Sliders size={14} /> Ajustar stock
                    </button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {adjustProductId && (() => {
        const p = products.find(x => x.id === adjustProductId);
        if (!p) return null;
        return (
          <StockAdjustModal
            product={{ id: p.id, name: p.name, sku: p.sku, stock_quantity: p.stock_quantity }}
            onClose={() => setAdjustProductId(null)}
            onSuccess={async () => {
              setAdjustProductId(null);
              await retry();
            }}
          />
        );
      })()}
    </div>
  );
};
