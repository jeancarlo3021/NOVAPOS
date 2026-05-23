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
    if (!currentSession || currentSession.status !== 'open') {
      setScanFeedback({ code: '', found: false, productName: 'Abre una caja primero' });
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setScanFeedback(null), 2500);
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
      <div className="bg-white border-b border-gray-200 px-3 pt-3 pb-0 shrink-0">

        {/* Barcode scanner row */}
        <div className="mb-2">
          <div className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 transition ${
            scanFeedback
              ? scanFeedback.found
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-red-400 bg-red-50'
              : 'border-blue-300 bg-blue-50 focus-within:border-blue-500'
          }`}>
            <ScanBarcode
              size={24}
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
              className={`flex-1 bg-transparent text-base font-semibold placeholder:font-normal focus:outline-none ${
                scanFeedback
                  ? scanFeedback.found ? 'text-emerald-700 placeholder:text-emerald-400' : 'text-red-700 placeholder:text-red-400'
                  : 'text-blue-700 placeholder:text-blue-400'
              }`}
            />

            {/* Feedback badge */}
            {scanFeedback ? (
              scanFeedback.found ? (
                <div className="flex items-center gap-2 shrink-0">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700 max-w-32 truncate">
                    {scanFeedback.productName}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <XCircle size={20} className="text-red-500" />
                  <span className="text-sm font-bold text-red-600">
                    {scanFeedback.productName ?? `"${scanFeedback.code}" no encontrado`}
                  </span>
                </div>
              )
            ) : (
              <span className="text-sm text-blue-400 shrink-0 hidden sm:block">SKU / código</span>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-2">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 text-sm font-medium transition"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
            {['Todos', ...categories].map((cat) => {
              const isAll = cat === 'Todos';
              const key = isAll ? 'all' : cat;
              const active = activeCategory === key;
              return (
                <button
                  key={key}
                  onPointerDown={() => setActiveCategory(key)}
                  className={`shrink-0 h-9 px-4 rounded-lg text-sm font-bold transition border active:scale-95 ${
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
      <div className="flex-1 overflow-y-auto p-3 pos-scroll">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
            <Package size={64} className="text-gray-300" />
            <p className="text-2xl font-semibold">No hay productos disponibles</p>
            {productsError && (
              <p className="text-base text-red-500 text-center max-w-xs">{productsError}</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
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
                  onClick={() => handleAdd(product)}
                  disabled={!inStock}
                  className={`
                    relative flex flex-col p-2 rounded-lg border text-left transition
                    active:scale-95 select-none min-h-36
                    ${inStock
                      ? 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow cursor-pointer'
                      : 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
                    }
                  `}
                >
                  {/* Stock badge — hidden when plan doesn't track stock */}
                  {!ignoreStock && (
                    <span className={`absolute top-1 right-1 text-xs font-bold px-1.5 py-0.5 rounded ${
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
                    <div className="absolute bottom-1 right-1 w-6 h-6 rounded bg-emerald-500 flex items-center justify-center">
                      {isWeight ? (
                        <span className="text-white text-[10px] font-black">
                          {product.unit_type?.abbreviation ?? 'kg'}
                        </span>
                      ) : (
                        <Plus size={12} className="text-white" />
                      )}
                    </div>
                  )}

                  {/* Name */}
                  <span className="text-gray-900 font-semibold text-xs leading-tight line-clamp-2 mb-1 pr-5 mt-0">
                    {product.name}
                  </span>

                  {product.sku && (
                    <span className="text-gray-400 text-[10px] mb-1 font-medium">{product.sku}</span>
                  )}

                  {/* Promo badge */}
                  {promo && (
                    <span className="self-start mb-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-600 text-white text-[10px] font-black rounded">
                      🏷️ {promoLabel(promo)}
                    </span>
                  )}

                  {/* Unit type badge for weight products */}
                  {isWeight && (
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 mb-0.5 self-start">
                      Por {product.unit_type?.name ?? 'peso'}
                    </span>
                  )}

                  {/* Price */}
                  <span className="text-emerald-600 font-black text-sm mt-auto">
                    ₡{product.unit_price?.toLocaleString()}
                    {isWeight && (
                      <span className="text-[10px] font-bold text-gray-400">
                        /{product.unit_type?.abbreviation ?? 'kg'}
                      </span>
                    )}
                  </span>

                  {!inStock && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg text-xs text-gray-400 font-black">
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
