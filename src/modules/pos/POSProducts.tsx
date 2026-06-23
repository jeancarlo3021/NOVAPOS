'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Package, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { Product, CashSession } from '@/types/Types_POS';
import { WeightInputModal } from './WeightInputModal';
import { useBarcodeScanner } from '@/hooks/POS/useBarcodeScanner';
import {
  type Promotion,
  getProductPromotion,
  promoLabel,
} from '@/services/promotions/promotionsService';
import { categoriesService } from '@/services/Inventory/categoriesService';
import { useTenantId } from '@/hooks/useTenant';
import { usePOSLayout } from '@/hooks/usePOSLayout';
import { ProductSearchModal } from './ProductSearchModal';

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
  /** Modo de vista. En 'desktop' la búsqueda se divide en pestañas (código / nombre). */
  viewMode?: 'touch' | 'desktop';
  /** Habilita las pestañas de búsqueda código/nombre (controlado por el plan). */
  searchTabsEnabled?: boolean;
  /** Precios especiales del cliente seleccionado (product_id → precio). */
  customerPrices?: Record<string, number>;
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
  viewMode: _viewMode = 'touch',
  searchTabsEnabled: _searchTabsEnabled = false,
  customerPrices = {},
}) => {
  const { tenantId } = useTenantId();
  const { layout } = usePOSLayout();
  // Categoría activa: 'all' o el id de la categoría seleccionada.
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [weightProduct, setWeightProduct]   = useState<Product | null>(null);
  const [scanValue, setScanValue]           = useState('');
  const [scanFeedback, setScanFeedback]     = useState<ScanFeedback | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  // Lista de categorías cargada por separado del backend (más confiable que
  // depender del JOIN en /products que puede no estar disponible si el deploy
  // del backend es viejo o si vienen del cache offline sin la relación).
  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    categoriesService.getAllCategories(tenantId)
      .then((cats: any[]) => setAllCategories(
        (cats ?? []).map(c => ({ id: c.id, name: c.name })),
      ))
      .catch(() => setAllCategories([]));
  }, [tenantId]);

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

  // Categorías visibles: TODAS las del backend. Antes filtrábamos por las
  // que tuvieran productos en la lista actual, pero en navegadores con caché
  // stale (p. ej. Edge) los productos podían venir sin `category_id` y
  // perdíamos categorías que sí existen. Mejor mostrar el listado completo;
  // si una categoría queda vacía, simplemente no muestra productos al
  // seleccionarla — pero sí aparece como opción.
  const categories: { id: string; name: string }[] = allCategories.length > 0
    ? allCategories
    : Array.from(
        new Map(
          products
            .map((p) => (p as any).category)
            .filter((c: any) => c && c.id && c.name)
            .map((c: any) => [c.id, { id: c.id, name: c.name }]),
        ).values(),
      );

  const displayed =
    activeCategory === 'all'
      ? products
      : products.filter((p) => (p as any).category_id === activeCategory);

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

  const isListLayout = layout === 'list';

  // ── Modo LISTA: cabecera minimalista ───────────────────────────────────
  // El input del escáner permanece en el DOM (oculto fuera de pantalla) para
  // mantener el foco y permitir que la pistola siga disparando lecturas.
  // El listener global de useBarcodeScanner sigue capturando aunque no haya
  // foco. En su lugar el usuario abre un Modal de búsqueda con un botón.
  if (isListLayout) {
    return (
      <>
        <div className="shrink-0 w-full bg-white border-b border-gray-200 px-3 py-3 flex items-center gap-3">
          {/* Botón principal: abrir modal de búsqueda */}
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            className="flex-1 h-12 flex items-center gap-3 px-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 active:scale-[0.99] transition text-left"
          >
            <Search size={22} className="text-emerald-600 shrink-0" />
            <span className="flex-1 text-emerald-700 font-bold text-base">
              Buscar producto…
            </span>
            <span className="hidden sm:inline text-xs font-mono text-emerald-600/60">
              o usa la pistola
            </span>
          </button>

          {/* Feedback del escáner (toast inline) */}
          {scanFeedback && (
            <div className={`flex items-center gap-2 shrink-0 px-3 py-2 rounded-lg ${
              scanFeedback.found ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
            }`}>
              {scanFeedback.found ? (
                <>
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700 max-w-32 truncate">
                    {scanFeedback.productName}
                  </span>
                </>
              ) : (
                <>
                  <XCircle size={18} className="text-red-500" />
                  <span className="text-sm font-bold text-red-600">
                    {scanFeedback.productName ?? `"${scanFeedback.code}" no encontrado`}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Input del escáner: oculto visualmente pero funcional (mantiene foco). */}
        <input
          ref={scanInputRef}
          type="text"
          inputMode="none"
          value={scanValue}
          onChange={e => setScanValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (scanValue.trim()) handleScan(scanValue.trim());
            }
          }}
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'absolute',
            left: -9999,
            top: -9999,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />

        {showSearchModal && (
          <ProductSearchModal
            products={allProducts.length > 0 ? allProducts : products}
            onPick={(p) => {
              handleAdd(p);
              setShowSearchModal(false);
            }}
            onClose={() => setShowSearchModal(false)}
            ignoreStock={ignoreStock}
            activePromotions={activePromotions}
          />
        )}

        {/* Weight input modal — también disponible en modo lista */}
        {weightProduct && (
          <WeightInputModal
            product={weightProduct}
            onConfirm={handleWeightConfirm}
            onClose={() => setWeightProduct(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className={`flex flex-col bg-gray-100 overflow-hidden flex-1`}>

      {/* ── Scanner input + search ── */}
      <div className="bg-white border-b border-gray-200 px-2 sm:px-3 pt-2 sm:pt-3 pb-0 shrink-0">

        {/* Tabs de código/nombre eliminadas: el SKU ahora se captura sólo por
            pistola (input oculto). La barra de nombre queda siempre visible. */}

        {/* Escáner: input oculto fuera de pantalla (la pistola sigue funcionando
            por el listener global de useBarcodeScanner). Solo aparece un toast
            corto cuando se registra una lectura, sin ocupar espacio en la UI. */}
        <input
          ref={scanInputRef}
          type="text"
          inputMode="none"
          value={scanValue}
          onChange={e => setScanValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (scanValue.trim()) handleScan(scanValue.trim());
            }
          }}
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'absolute',
            left: -9999,
            top: -9999,
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
        {scanFeedback && (
          <div className={`mb-2 flex items-center gap-2 px-3 py-2 rounded-lg border ${
            scanFeedback.found
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-red-200 bg-red-50'
          }`}>
            {scanFeedback.found ? (
              <>
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span className="text-sm font-bold text-emerald-700 truncate">
                  {scanFeedback.productName}
                </span>
              </>
            ) : (
              <>
                <XCircle size={16} className="text-red-500 shrink-0" />
                <span className="text-sm font-bold text-red-600 truncate">
                  {scanFeedback.productName ?? `"${scanFeedback.code}" no encontrado`}
                </span>
              </>
            )}
          </div>
        )}

        {/* Búsqueda por nombre — siempre visible. */}
        <div className="relative mb-2">
          <Search size={16} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 sm:pl-10 pr-3 py-2 sm:py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-400 text-sm font-medium transition"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
            {[{ id: 'all', name: 'Todos' }, ...categories].map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onPointerDown={() => setActiveCategory(cat.id)}
                  className={`shrink-0 h-8 sm:h-9 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-bold transition border active:scale-95 ${
                    active
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Products area (solo layout grid) ── */}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {displayed.map((product) => {
              const stock    = product.stock_quantity ?? 0;
              // Solo bloqueamos venta cuando tracks_stock está EXPLÍCITAMENTE en true.
              // Si está en false, null o undefined (p. ej. caché vieja sin el campo
              // o producto creado antes de la columna), el producto se vende sin
              // chequear stock. Esto mantiene a Edge alineado con Inventario en
              // navegadores donde la caché del POS quedó stale.
              const productTracksStock = (product as any).tracks_stock === true;
              const effectiveIgnore = ignoreStock || !productTracksStock;
              const inStock  = effectiveIgnore || stock > 0;
              const lowStock = !effectiveIgnore && stock > 0 && stock <= 5;
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
                    relative flex flex-col p-4 rounded-xl border-2 text-left transition
                    active:scale-95 select-none min-h-60
                    ${inStock
                      ? 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-md cursor-pointer'
                      : 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
                    }
                  `}
                >
                  {/* Imagen del producto */}
                  {(product as any).image_url ? (
                    <div className="w-full h-24 mb-2 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                      <img
                        src={(product as any).image_url}
                        alt={product.name}
                        loading="lazy"
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ) : null}

                  {/* Stock badge — solo si el plan y el producto manejan stock */}
                  {!ignoreStock && productTracksStock && (
                    <span className={`absolute top-2 right-2 text-sm font-black px-2.5 py-1 rounded-lg ${
                      lowStock
                        ? 'bg-amber-100 text-amber-700'
                        : stock === 0
                        ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {stock}
                    </span>
                  )}
                  {/* Badge "∞" si el producto no maneja stock */}
                  {!ignoreStock && !productTracksStock && (
                    <span className="absolute top-2 right-2 text-sm font-black px-2.5 py-1 rounded-lg bg-blue-100 text-blue-600" title="Stock ilimitado">
                      ∞
                    </span>
                  )}

                  {/* Add / Scale indicator */}
                  {inStock && (
                    <div className="absolute bottom-2 right-2 w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm">
                      {isWeight ? (
                        <span className="text-white text-sm font-black">
                          {product.unit_type?.abbreviation ?? 'kg'}
                        </span>
                      ) : (
                        <Plus size={20} className="text-white" />
                      )}
                    </div>
                  )}

                  {/* Name */}
                  <span className="text-gray-900 font-black text-base leading-tight line-clamp-2 mb-1 pr-9 mt-0">
                    {product.name}
                  </span>

                  {product.sku && (
                    <span className="text-gray-400 text-sm mb-1.5 font-semibold">{product.sku}</span>
                  )}

                  {/* Promo badge */}
                  {promo && (
                    <span className="self-start mb-1 inline-flex items-center gap-1 px-2 py-1 bg-violet-600 text-white text-sm font-black rounded-md">
                      🏷️ {promoLabel(promo)}
                    </span>
                  )}

                  {/* Unit type badge for weight products */}
                  {isWeight && (
                    <span className="text-sm font-bold text-blue-600 bg-blue-50 rounded-md px-2 py-0.5 mb-1 self-start">
                      Por {product.unit_type?.name ?? 'peso'}
                    </span>
                  )}

                  {/* Price */}
                  {(() => {
                    const special = customerPrices[product.id];
                    const hasSpecial = special != null && special !== product.unit_price;
                    return (
                      <span className="mt-auto leading-none">
                        {hasSpecial && (
                          <span className="block text-sm font-bold text-gray-400 line-through">
                            ₡{product.unit_price?.toLocaleString()}
                          </span>
                        )}
                        <span className={`font-black text-2xl leading-none ${hasSpecial ? 'text-violet-600' : 'text-emerald-600'}`}>
                          ₡{(hasSpecial ? special : product.unit_price)?.toLocaleString()}
                          {isWeight && (
                            <span className="text-sm font-bold text-gray-400">
                              /{product.unit_type?.abbreviation ?? 'kg'}
                            </span>
                          )}
                        </span>
                        {hasSpecial && (
                          <span className="block text-[10px] font-bold text-violet-600 uppercase tracking-wide">Precio cliente</span>
                        )}
                      </span>
                    );
                  })()}

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
          ignoreStock={ignoreStock}
          customerPrice={customerPrices?.[weightProduct.id]}
          onConfirm={handleWeightConfirm}
          onClose={() => setWeightProduct(null)}
        />
      )}
    </div>
  );
};
