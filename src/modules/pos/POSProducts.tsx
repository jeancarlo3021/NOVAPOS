import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Product } from '@/types/Types_POS';
import { CashSession } from '@/types/Types_POS';

interface POSProductsPanelProps {
  filteredProducts?: Product[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  currentSession: CashSession | null;
}

export const POSProductsPanel: React.FC<POSProductsPanelProps> = ({
  filteredProducts = [],
  searchTerm,
  onSearchChange,
  onAddToCart,
  currentSession,
}) => {
  const [quantity, setQuantity] = React.useState(1);
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);

  const handleAddToCart = (product: Product) => {
    if (!currentSession) {
      alert('⚠️ Abre una caja primero');
      return;
    }
    onAddToCart(product, quantity);
    setQuantity(1);
  };

  // Validar que filteredProducts sea un array
  const products = Array.isArray(filteredProducts) ? filteredProducts : [];

  return (
    <div className="flex-1 flex flex-col bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-slate-800">
        <input
          type="text"
          placeholder="Buscar productos..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3">
        {products.length === 0 ? (
          <div className="col-span-2 flex items-center justify-center h-32 text-slate-500">
            <p>No hay productos disponibles</p>
          </div>
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              className="bg-slate-800 border border-slate-700 rounded p-3 hover:border-blue-500 transition cursor-pointer"
              onClick={() => setSelectedProduct(product)}
            >
              <h3 className="text-sm font-semibold text-white truncate">
                {product.name}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                SKU: {product.sku || 'N/A'}
              </p>
              <p className="text-lg font-bold text-blue-400 mt-2">
                ${product.unit_price?.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Stock: {product.stock_quantity || 0}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToCart(product);
                }}
                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 rounded transition flex items-center justify-center gap-1"
              >
                <ShoppingCart size={14} />
                Agregar
              </button>
            </div>
          ))
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">{selectedProduct.name}</h2>
            <div className="space-y-3 mb-4">
              <p className="text-slate-400">
                <span className="text-slate-500">SKU:</span> {selectedProduct.sku}
              </p>
              <p className="text-slate-400">
                <span className="text-slate-500">Precio:</span> ${selectedProduct.unit_price?.toFixed(2)}
              </p>
              <p className="text-slate-400">
                <span className="text-slate-500">Stock:</span> {selectedProduct.stock_quantity}
              </p>
            </div>

            <div className="mb-4">
              <label className="text-sm text-slate-400">Cantidad:</label>
              <input
                type="number"
                min="1"
                max={selectedProduct.stock_quantity || 1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white mt-1"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSelectedProduct(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  handleAddToCart(selectedProduct);
                  setSelectedProduct(null);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition"
              >
                Agregar al Carrito
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};