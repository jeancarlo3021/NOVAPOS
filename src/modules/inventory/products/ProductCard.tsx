import React from 'react';
import { Edit2, Trash2, AlertTriangle } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit_price: number;
  cost_price: number;
  stock_quantity: number;
  min_stock_level: number;
}

interface ProductCardProps {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete }) => {
  const isLowStock = product.stock_quantity < product.min_stock_level;
  const margin = product.unit_price > 0 
    ? ((product.unit_price - product.cost_price) / product.unit_price * 100).toFixed(1)
    : '0';

  return (
    <div className={`rounded-lg shadow p-4 hover:shadow-lg transition ${isLowStock ? 'bg-yellow-50 border border-yellow-200' : 'bg-white'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
          <p className="text-sm text-gray-500">SKU: {product.sku}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="p-2 text-blue-600 hover:bg-blue-50 rounded">
            <Edit2 size={18} />
          </button>
          <button onClick={onDelete} className="p-2 text-red-600 hover:bg-red-50 rounded">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Categoría:</span>
          <span className="font-semibold">{product.category}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Precio:</span>
          <span className="font-semibold">${product.unit_price.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Margen:</span>
          <span className="font-semibold">{margin}%</span>
        </div>
        <div className="pt-2 border-t flex justify-between items-center">
          <span className="text-gray-600">Stock:</span>
          <div className="flex items-center gap-2">
            {isLowStock && <AlertTriangle size={16} className="text-yellow-600" />}
            <span className={`font-semibold ${isLowStock ? 'text-yellow-600' : 'text-green-600'}`}>
              {product.stock_quantity}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
