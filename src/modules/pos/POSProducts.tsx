'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Package, Plus, ScanBarcode, CheckCircle2, XCircle } from 'lucide-react';
import { Product, CashSession } from '@/types/Types_POS';
import { WeightInputModal } from './WeightInputModal';
import { useBarcodeScanner } from '@/hooks/POS/useBarcodeScanner';
import {
  type Promotion,
  getProductPromotion,
  promoLabel,
} from '@/services/promotions/promotionsService';

// Abbreviations that require weight input when requires_weight is not set in DB
const WEIGHT_ABBREVS = new Set(['kg', 'g', 'lb', 'lbs', 'oz', 'gr', 'kilo', 'kilos']);

function needsWeightInput(product: Product): boolean {
  const ut = product.unit_type;
  console.log('[needsWeightInput]', product.name, {
    unit_type_id: (product as any).unit_type_id,
    unit_type: ut,
    hasUnitType: !!ut,
    abbreviation: ut?.abbreviation,
    requires_weight: ut?.requires_weight,
  });
  if (!ut) return false;
  if (ut.requires_weight != null) return ut.requires_weight;
  return WEIGHT_ABBREVS.has(ut.abbreviation?.toLowerCase() || '');
}

interface ScanFeedback {
  code: string;
  found: boolean;
  productName?: string;
}

interface POSProductsPanelProps {
  filteredProducts?: Product[];
  allProducts?: Product[];          // full list for SKU lookup
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  currentSession: CashSession | null;
  productsError?: string | null;
  /** When true, stock_quantity is ignored — plan doesn't track stock */
  ignoreStock?: boolean;
  activePromotions?: Promotion[];
}

export const POSProductsPanel: React.FC<POSProductsPanelProps> = ({
  filteredProducts = [],
  allProducts = [],
  searchTerm,
  onSearchChange,
  onAddToCart,
  currentSession,
  productsError,
  ignoreStock = false,
  activePromotions = [],
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [weightProduct, setWeightProduct]   = useState<Product | null>(null);
  const [scanValue, setScanValue]           = useState('');
  const [scanFeedback, setScanFeedback]     = useState<ScanFeedback | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Look up product by exact SKU (case-insensitive), add to cart
  const handleScan = useCallback((code: string) => {
    if (!currentSession) {
      setScanFeedback({ code, found: false, productName: 'Abre una caja primero' });
      return;
    }
    const list = allProducts.length > 0 ? allProducts : filteredProducts;
    const product = list.find(
      p => p.sku?.trim().toLowerCase() === code.trim().toLowerCase()
    );
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    if (product) {
      onAddToCart(product, 1);
      setScanFeedback({ code, found: true, productName: product.name });
    } else {
      setScanFeedback({ code, found: false });
    }
    setScanValue('');
    // Clear feedback after 2.5 s
    feedbackTimerRef.current = setTimeout(() => setScanFeedback(null), 2500);
    // Keep focus on scanner input for continuous scanning
    scanInputRef.current?.focus();
  }, [allProducts, filteredProducts, currentSession, onAddToCart]);

  // Hook: global scanner listener (fires when scanner types while no other input is focused)
  useBarcodeScanner({ inputRef: scanInputRef, onScan: handleScan, enabled: true });

  // Auto-focus scanner input on mount
  useEffect(() => {
    scanInputRef.current?.focus();
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, []);

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

      {/* ── Scanner input + search ── */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-0 shrink-0">

        {/* Barcode scanner row */}
        <div className="mb-3">
          <div className={`flex items-center gap-2 rounded-2xl border-2 px-4 py-2.5 transition ${
            scanFeedback
              ? scanFeedback.found
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-red-400 bg-red-50'
              : 'border-blue-300 bg-blue-50 focus-within:border-blue-500'
          }`}>
            <ScanBarcode
              size={20}
              className={`shrink-0 transition ${
                scanFeedback
                  ? scanFeedback.found ? 'text-emerald-600' : 'text-red-500'
                  : 'text-blue-500'
              }`}
            />
            <input
              ref={scanInputRef}
              type="text"
              inputMode="none"          // Prevents mobile keyboard — scanner provides input
              value={scanValue}
              onChange={e => setScanValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (scanValue.trim()) handleScan(scanValue.trim());
                }
              }}
              placeholder="Apunta la pistola aquí · F2 para enfocar"
              className={`flex-1 bg-transparent text-sm font-semibold placeholder:font-normal focus:outline-none ${
                scanFeedback
                  ? scanFeedback.found ? 'text-emerald-700 placeholder:text-emerald-400' : 'text-red-700 placeholder:text-red-400'
                  : 'text-blue-700 placeholder:text-blue-400'
              }`}
            />

            {/* Feedback badge */}
            {scanFeedback ? (
              scanFeedback.found ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700 max-w-32 truncate">
                    {scanFeedback.productName}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <XCircle size={16} className="text-red-500" />
                  <span className="text-xs font-bold text-red-600">
                    {scanFeedback.productName ?? `"${scanFeedback.code}" no encontrado`}
                  </span>
                </div>
              )
            ) : (
              <span className="text-xs text-blue-400 shrink-0 hidden sm:block">SKU / código</span>
            )}
          </div>
        </div>

        {/* Search bar */}
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
              const stock    = product.stock_quantity ?? 0;
              const inStock  = ignoreStock || stock > 0;
              const lowStock = !ignoreStock && stock > 0 && stock <= 5;
              const isWeight = needsWeightInput(product);
              const promo    = getProductPromotion(
                product.id,
                (product as any).category_id ?? (product as any).category?.id ?? null,
                activePromotions,
              );

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
                  {/* Stock badge — hidden when plan doesn't track stock */}
                  {!ignoreStock && (
                    <span className={`absolute top-3 right-3 text-sm font-black px-2 py-1 rounded-xl ${
                      lowStock
                        ? 'bg-amber-100 text-amber-700'
                        : stock === 0
                        ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {stock}
                    </span>
                  )}

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

                  {/* Promo badge */}
                  {promo && (
                    <span className="self-start mb-1 inline-flex items-center gap-1 px-2 py-0.5 bg-violet-600 text-white text-xs font-black rounded-lg">
                      🏷️ {promoLabel(promo)}
                    </span>
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
