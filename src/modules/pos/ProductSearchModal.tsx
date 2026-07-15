import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Package, Plus } from 'lucide-react';
import type { Product } from '@/types/Types_POS';
import {
  type Promotion,
  getProductPromotion,
  promoLabel,
} from '@/services/promotions/promotionsService';

interface Props {
  products: Product[];
  onPick: (product: Product) => void;
  onClose: () => void;
  ignoreStock?: boolean;
  activePromotions?: Promotion[];
}

/**
 * Modal de búsqueda de productos para el POS (modo lista).
 * Búsqueda por nombre, SKU o código de barras. El usuario toca un producto
 * y vuelve al POS con el producto agregado al carrito.
 */
export const ProductSearchModal: React.FC<Props> = ({
  products,
  onPick,
  onClose,
  ignoreStock = false,
  activePromotions = [],
}) => {
  const [term, setTerm] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Categorías derivadas de los productos
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      const cat = (p as any).category;
      if (cat?.id && cat?.name) map.set(cat.id, cat.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCat !== 'all' && (p as any).category_id !== activeCat) return false;
      if (!t) return true;
      return (
        p.name?.toLowerCase().includes(t) ||
        p.sku?.toLowerCase().includes(t) ||
        (p as any).barcode?.toLowerCase().includes(t)
      );
    });
  }, [products, term, activeCat]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-linear-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2">
            <Search size={22} className="text-emerald-600" />
            <h2 className="text-xl font-black text-gray-900">Buscar producto</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-5 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar por nombre, SKU o código..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-lg font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white transition"
            />
          </div>

          {/* Category chips */}
          {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pt-3 pb-1">
              {[{ id: 'all', name: 'Todas' }, ...categories].map((c) => {
                const active = activeCat === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCat(c.id)}
                    className={`shrink-0 h-8 px-3 rounded-lg text-xs font-bold transition border ${
                      active
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
              <Package size={48} className="text-gray-300" />
              <p className="text-base font-semibold">Sin resultados</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200">
              {filtered.slice(0, 80).map((product) => {
                const stock = product.stock_quantity ?? 0;
                // Misma lógica que POSProducts: solo bloqueamos si tracks_stock
                // está explícitamente en true. Faltante/null/false => sin bloqueo.
                const tracksStock = (product as any).tracks_stock === true;
                const effectiveIgnore = ignoreStock || !tracksStock;
                const inStock = effectiveIgnore || stock > 0;
                const promo = getProductPromotion(
                  product.id,
                  (product as any).category_id ?? (product as any).category?.id ?? null,
                  activePromotions,
                );
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => inStock && onPick(product)}
                      disabled={!inStock}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                        inStock ? 'hover:bg-emerald-50 active:bg-emerald-100' : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      {(product as any).image_url ? (
                        <img
                          src={(product as any).image_url}
                          alt=""
                          loading="lazy"
                          className="w-12 h-12 rounded-lg object-cover bg-gray-50 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Package size={20} className="text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-black text-gray-900 truncate">{product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {product.sku && (
                            <span className="text-xs text-gray-400 font-mono">{product.sku}</span>
                          )}
                          {!ignoreStock && tracksStock && (
                            <span className="text-xs text-gray-500 font-bold">Stock: {stock}</span>
                          )}
                          {!ignoreStock && !tracksStock && (
                            <span className="text-xs text-blue-600 font-bold">∞</span>
                          )}
                          {promo && (
                            <span className="text-xs text-violet-600 font-bold">🏷️ {promoLabel(promo)}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xl font-black text-emerald-600 shrink-0">
                        ₡{Math.round(Number(product.unit_price ?? 0)).toLocaleString('es-CR')}
                      </span>
                      {inStock && (
                        <span className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                          <Plus size={18} className="text-white" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex justify-between shrink-0">
          <span>{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded font-mono">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
};

export default ProductSearchModal;
