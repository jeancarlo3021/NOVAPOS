'use client';

import React, { useState } from 'react';
import { Search, Package, Plus } from 'lucide-react';
import { Product, CashSession } from '@/types/Types_POS';
import { WeightInputModal } from './WeightInputModal';

// Abbreviations that require weight input when requires_weight is not set in DB
const WEIGHT_ABBREVS = new Set(['kg', 'g', 'lb', 'lbs', 'oz', 'gr', 'kilo', 'kilos']);

function needsWeightInput(product: Product): boolean {
  const ut = product.unit_type;
  if (!ut) return false;
  if (ut.requires_weight != null) return ut.requires_weight;
  return WEIGHT_ABBREVS.has(ut.abbreviation.toLowerCase());
}

interface POSProductsPanelProps {
  filteredProducts?: Product[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  currentSession: CashSession | null;
  productsError?: string | null;
}

export const POSProductsPanel: React.FC<POSProductsPanelProps> = ({
  filteredProducts = [],
  searchTerm,
  onSearchChange,
  onAddToCart,
  currentSession,
  productsError,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [weightProduct, setWeightProduct] = useState<Product | null>(null);

  const products = Array.isArray(filteredProducts) ? filteredProducts : [];

  const categories = Array.from(
    new Set(products.map((p) => (p as any).category?.name).filter(Boolean))
  ) as string[];

  const displayed =
    activeCategory === 'all'
      ? products
      : products.filter((p) => (p as any).category?.name === activeCategory);

  const handleAdd = (product: Product) => {
    if (!currentSession) {
      alert('⚠️ Abre una caja primero');
      return;
    }
    if (needsWeightInput(product)) {
      setWeightProduct(product);
    } else {
      onAddToCart(product, 1);
    }
  };

  const handleWeightConfirm = (weight: number) => {
    if (weightProduct) {
      onAddToCart(weightProduct, weight);
      setWeightProduct(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">

      {/* ── Search + categories ── */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-0 shrink-0">
        <div className="relative mb-4">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl pl-12 pr-4 py-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 text-lg font-medium transition"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-4">
            {['Todos', ...categories].map((cat) => {
              const isAll = cat === 'Todos';
              const key = isAll ? 'all' : cat;
              const active = activeCategory === key;
              return (
                <button
                  key={key}
                  onPointerDown={() => setActiveCategory(key)}
                  className={`shrink-0 h-12 px-5 rounded-2xl text-base font-bold transition border-2 active:scale-95 ${
                    active
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Products Grid ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
            <Package size={56} className="text-gray-300" />
            <p className="text-lg font-semibold">No hay productos disponibles</p>
            {productsError && (
              <p className="text-sm text-red-500 text-center max-w-xs">{productsError}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayed.map((product) => {
              const stock = product.stock_quantity ?? 0;
              const inStock = stock > 0;
              const lowStock = stock > 0 && stock <= 5;
              const isWeight = needsWeightInput(product);

              return (
                <button
                  key={product.id}
                  onPointerDown={() => handleAdd(product)}
                  disabled={!inStock}
                  className={`
                    relative flex flex-col p-5 rounded-2xl border-2 text-left transition
                    active:scale-95 select-none
                    ${inStock
                      ? 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-lg cursor-pointer shadow-sm'
                      : 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
                    }
                  `}
                >
                  {/* Stock badge */}
                  <span className={`absolute top-3 right-3 text-sm font-black px-2 py-1 rounded-xl ${
                    lowStock
                      ? 'bg-amber-100 text-amber-700'
                      : stock === 0
                      ? 'bg-red-100 text-red-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {stock}
                  </span>

                  {/* Add / Scale indicator */}
                  {inStock && (
                    <div className="absolute bottom-3 right-3 w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center">
                      {isWeight ? (
                        <span className="text-white text-xs font-black">
                          {product.unit_type?.abbreviation ?? 'kg'}
                        </span>
                      ) : (
                        <Plus size={16} className="text-white" />
                      )}
                    </div>
                  )}

                  {/* Name */}
                  <span className="text-gray-900 font-black text-lg leading-snug line-clamp-3 mb-3 pr-8 mt-1">
                    {product.name}
                  </span>

                  {product.sku && (
                    <span className="text-gray-400 text-sm mb-2 font-medium">{product.sku}</span>
                  )}

                  {/* Unit type badge for weight products */}
                  {isWeight && (
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 rounded-lg px-2 py-0.5 mb-1 self-start">
                      Por {product.unit_type?.name ?? 'peso'}
                    </span>
                  )}

                  {/* Price */}
                  <span className="text-emerald-600 font-black text-2xl mt-auto pb-1">
                    ₡{product.unit_price?.toLocaleString()}
                    {isWeight && (
                      <span className="text-sm font-bold text-gray-400">
                        /{product.unit_type?.abbreviation ?? 'kg'}
                      </span>
                    )}
                  </span>

                  {!inStock && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-2xl text-base text-gray-400 font-black">
                      Sin stock
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Weight input modal */}
      {weightProduct && (
        <WeightInputModal
          product={weightProduct}
          onConfirm={handleWeightConfirm}
          onClose={() => setWeightProduct(null)}
        />
      )}
    </div>
  );
};
