import React from 'react';
import { Edit2, Trash2, AlertTriangle, TrendingUp, Package } from 'lucide-react';
import { Card, Badge } from '@/components/ui/uiComponents';
import { Product } from '@/types/Types_POS';
import { useAuth } from '@/context/AuthContext';

interface ProductWithRelations extends Product {
  category?: { id: string; name: string } | null;
  unit_type?: { id: string; name: string; abbreviation: string; requires_weight?: boolean } | null;
}

interface ProductCardProps {
  product: ProductWithRelations;
  onEdit: () => void;
  onDelete: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete }) => {
  const { planFeatures } = useAuth();
  const isProductsOnly = planFeatures?.inventory_products_only ?? false;

  const minStock = product.min_stock_level ?? 0;
  const isLowStock = product.stock_quantity < minStock;
  const margin = product.unit_price > 0
    ? ((product.unit_price - (product.cost_price || 0)) / product.unit_price * 100).toFixed(1)
    : '0';

  const stockPercentage = minStock > 0 ? (product.stock_quantity / minStock) * 100 : 100;
  const stockStatus = stockPercentage > 100 ? 'optimal' : stockPercentage > 50 ? 'warning' : 'critical';

  return (
    <Card className={`hover:shadow-xl transition-all duration-300 overflow-hidden group border-0 ${
      isLowStock && !isProductsOnly
        ? 'bg-gradient-to-br from-orange-50 to-orange-100' 
        : 'bg-gradient-to-br from-white to-gray-50'
    }`}>
      <div className="p-5">
        {/* Header con acciones */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition">
                <Package size={18} className="text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{product.name}</h3>
            </div>
            <p className="text-xs text-gray-500 font-mono">SKU: {product.sku}</p>
          </div>
          
          {/* Botones de acción */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <button 
              onClick={onEdit} 
              className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition duration-200"
              title="Editar"
            >
              <Edit2 size={16} />
            </button>
            <button 
              onClick={onDelete} 
              className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition duration-200"
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Categoría - Solo si NO es products_only */}
        {!isProductsOnly && product.category && (
          <div className="mb-4">
            <Badge variant="info" className="text-xs">
              {product.category.name}
            </Badge>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-gray-200 to-transparent mb-4"></div>

        {/* Información de precios */}
        <div className="space-y-3 mb-4">
          {/* Precio Unitario */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 font-medium">Precio</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-600">
                ₡{product.unit_price.toFixed(2)}
              </span>
              {product.cost_price && (
                <span className="text-xs text-gray-500 line-through">
                  ₡{product.cost_price.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Margen de Ganancia */}
          <div className="flex justify-between items-center bg-gradient-to-r from-green-50 to-transparent p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-green-600" />
              <span className="text-sm text-gray-700 font-medium">Margen</span>
            </div>
            <span className="text-lg font-bold text-green-600">{margin}%</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-gray-200 to-transparent mb-4"></div>

        {/* Stock Status - Solo si NO es products_only */}
        {!isProductsOnly && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">Stock</span>
              <div className="flex items-center gap-2">
                {isLowStock && (
                  <AlertTriangle size={16} className="text-orange-600 animate-pulse" />
                )}
                <span className={`text-sm font-bold ${
                  stockStatus === 'optimal' ? 'text-green-600' :
                  stockStatus === 'warning' ? 'text-orange-600' :
                  'text-red-600'
                }`}>
                  {product.stock_quantity} unidades
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  stockStatus === 'optimal' ? 'bg-green-500' :
                  stockStatus === 'warning' ? 'bg-orange-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${Math.min(stockPercentage, 100)}%` }}
              ></div>
            </div>

            {/* Stock Levels */}
            <div className="flex justify-between text-xs text-gray-500">
              <span>Mínimo: {minStock}</span>
              <span>Actual: {product.stock_quantity}</span>
            </div>
          </div>
        )}

        {/* Status Badge - Solo si NO es products_only */}
        {!isProductsOnly && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <Badge variant={
              stockStatus === 'optimal' ? 'success' :
              stockStatus === 'warning' ? 'warning' :
              'error'
            } className="w-full text-center justify-center">
              {stockStatus === 'optimal' ? '✓ Stock Óptimo' :
               stockStatus === 'warning' ? '⚠ Stock Bajo' :
               '✕ Stock Crítico'}
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
};