import React, { useState } from 'react';
import { Edit2, Trash2, AlertTriangle, TrendingUp, Package, Check, X, Loader, Printer } from 'lucide-react';
import { PrintLabelModal } from '@/modules/labels/PrintLabelModal';
import { Card, Badge } from '@/components/ui/uiComponents';
import { Product } from '@/types/Types_POS';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { cacheGet, cacheKey } from '@/utils/offlineCache';
import { calcMargin, MARGIN_TEXT, MARGIN_BG } from '@/utils/priceUtils';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';

interface ProductWithRelations extends Product {
  category?: { id: string; name: string } | null;
  unit_type?: { id: string; name: string; abbreviation: string; requires_weight?: boolean } | null;
}

interface ProductCardProps {
  product: ProductWithRelations;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdated?: () => void;
  /** Modo selección para impresión masiva de etiquetas. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete, onUpdated, selectable, selected, onToggleSelect }) => {
  const { planFeatures, isReadOnly } = useAuth();
  const { tenantId } = useTenantId();
  const isProductsOnly = planFeatures?.inventory_products_only ?? false;

  // IVA activado en la configuración → mostramos el IVA por producto.
  const taxEnabled = (() => {
    try {
      const c = cacheGet<any>(cacheKey(tenantId ?? '', 'settings_general')) ?? cacheGet<any>(cacheKey(tenantId ?? '', 'general_settings'));
      const cfg = c?.config ?? c;
      return cfg?.taxEnabled !== false;   // por defecto activado
    } catch { return true; }
  })();
  const ivaRate = (product as any).iva_rate;
  const showIva = taxEnabled && ivaRate != null && ivaRate !== '';

  // ── Inline price editor ─────────────────────────────────────────────────────
  const [editingPrice, setEditingPrice] = useState(false);
  const [showPrint, setShowPrint]       = useState(false);
  const [priceInput, setPriceInput]     = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');

  const startPriceEdit = () => {
    setPriceInput(product.unit_price.toFixed(2));
    setSaveError('');
    setEditingPrice(true);
  };

  const cancelPriceEdit = () => {
    setEditingPrice(false);
    setPriceInput('');
    setSaveError('');
  };

  const savePrice = async () => {
    const newPrice = parseFloat(priceInput);
    if (isNaN(newPrice) || newPrice < 0) { cancelPriceEdit(); return; }
    setSaving(true);
    setSaveError('');
    try {
      await inventoryProductsService.updateProduct(product.id, { unit_price: newPrice });
      setEditingPrice(false);
      setPriceInput('');
      onUpdated?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Preview price while editing — recalculates margin live
  const displayPrice = editingPrice
    ? (parseFloat(priceInput) || 0)
    : product.unit_price;

  // Margen = (precio_venta - costo) / costo × 100
  const { label: margin, profit, color: marginCol } =
    calcMargin(displayPrice, product.cost_price);
  const marginColor = MARGIN_TEXT[marginCol];
  const marginBg    = MARGIN_BG[marginCol];

  const minStock = product.min_stock_level ?? 0;
  const productTracksStock = (product as any).tracks_stock !== false;
  const isLowStock = productTracksStock && product.stock_quantity < minStock;
  const stockPercentage = minStock > 0 ? (product.stock_quantity / minStock) * 100 : 100;
  const stockStatus = stockPercentage > 100 ? 'optimal' : stockPercentage > 50 ? 'warning' : 'critical';

  return (
    <Card
      onClick={selectable ? onToggleSelect : undefined}
      className={`hover:shadow-xl transition-all duration-300 overflow-hidden group border-0 relative ${
      selectable ? 'cursor-pointer' : ''
    } ${selected ? 'ring-2 ring-fuchsia-500' : ''} ${
      isLowStock && !isProductsOnly
        ? 'bg-linear-to-br from-orange-50 to-orange-100'
        : 'bg-linear-to-br from-white to-gray-50'
    }`}>
      {selectable && (
        <div className={`absolute top-3 left-3 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center ${selected ? 'bg-fuchsia-600 border-fuchsia-600' : 'bg-white border-gray-300'}`}>
          {selected && <Check size={15} className="text-white" />}
        </div>
      )}
      <div className="p-5">

        {/* Header */}
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

          {(onEdit || onDelete) && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity ml-2">
              {planFeatures?.labels && (
                <button onClick={() => setShowPrint(true)} className="p-2 text-fuchsia-600 hover:bg-fuchsia-100 rounded-lg transition" title="Imprimir etiqueta">
                  <Printer size={16} />
                </button>
              )}
              {onEdit && (
                <button onClick={onEdit} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Editar">
                  <Edit2 size={16} />
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition" title="Eliminar">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Categoría */}
        {!isProductsOnly && product.category && (
          <div className="mb-4">
            <Badge variant="info" className="text-xs">{product.category.name}</Badge>
          </div>
        )}

        <div className="h-px bg-linear-to-r from-gray-200 to-transparent mb-4" />

        {/* Precios */}
        <div className="space-y-3 mb-4">

          {/* Precio de venta — editable inline */}
          <div className="flex justify-between items-start">
            <span className="text-sm text-gray-600 font-medium pt-1">Precio</span>

            {!editingPrice ? (
              /* Vista normal — clic para editar (deshabilitado en solo-lectura) */
              <div className="flex items-baseline gap-2">
                <button
                  onClick={(isReadOnly || selectable) ? undefined : startPriceEdit}
                  disabled={isReadOnly || selectable}
                  title={isReadOnly ? 'Modo solo lectura' : 'Clic para ajustar el precio'}
                  className="flex items-baseline gap-1.5 group/price disabled:cursor-not-allowed"
                >
                  <span className="text-2xl font-bold text-blue-600 group-hover/price:text-blue-700 transition">
                    ₡{product.unit_price.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                  </span>
                  <Edit2 size={12} className="text-gray-300 group-hover/price:text-blue-400 transition mb-0.5" />
                </button>
                {(product.cost_price ?? 0) > 0 && (
                  <span className="text-xs text-gray-400">
                    costo ₡{product.cost_price!.toLocaleString('es-CR', { minimumFractionDigits: 0 })}
                  </span>
                )}
                {showIva && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">
                    IVA {Number(ivaRate) === 0 ? 'Exento' : `${Number(ivaRate)}%`}
                  </span>
                )}
              </div>
            ) : (
              /* Modo edición */
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-500 font-medium">₡</span>
                  <input
                    type="number"
                    value={priceInput}
                    onChange={e => setPriceInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  savePrice();
                      if (e.key === 'Escape') cancelPriceEdit();
                    }}
                    autoFocus
                    step="0.01"
                    min="0"
                    className="w-32 px-2 py-1 text-right text-xl font-bold border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-blue-600"
                  />
                  <button
                    onClick={savePrice}
                    disabled={saving}
                    className="p-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 text-white rounded-lg transition"
                    title="Guardar"
                  >
                    {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                  </button>
                  <button
                    onClick={cancelPriceEdit}
                    disabled={saving}
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition"
                    title="Cancelar"
                  >
                    <X size={13} />
                  </button>
                </div>
                {saveError && (
                  <p className="text-xs text-red-500">{saveError}</p>
                )}
              </div>
            )}
          </div>

          {/* Margen — solo lectura */}
          <div className={`flex justify-between items-center bg-linear-to-r ${marginBg} to-transparent p-3 rounded-lg`}>
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className={marginColor} />
              <span className="text-sm text-gray-700 font-medium">Margen</span>
              {profit !== null && (
                <span className={`text-xs font-semibold ${marginColor}`}>
                  · ₡{Math.abs(profit).toLocaleString('es-CR', { minimumFractionDigits: 0 })}
                  {profit < 0 ? ' pérdida' : ' ganancia'}
                </span>
              )}
            </div>
            <span className={`text-lg font-bold ${marginColor}`}>{margin}</span>
          </div>
        </div>

        <div className="h-px bg-linear-to-r from-gray-200 to-transparent mb-4" />

        {/* Stock */}
        {!isProductsOnly && productTracksStock && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">Stock</span>
              <div className="flex items-center gap-2">
                {isLowStock && <AlertTriangle size={16} className="text-orange-600 animate-pulse" />}
                <span className={`text-sm font-bold ${
                  stockStatus === 'optimal' ? 'text-green-600' :
                  stockStatus === 'warning'  ? 'text-orange-600' : 'text-red-600'
                }`}>
                  {product.stock_quantity} unidades
                </span>
              </div>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  stockStatus === 'optimal' ? 'bg-green-500' :
                  stockStatus === 'warning'  ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(stockPercentage, 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <span>Mínimo: {minStock}</span>
              <span>Actual: {product.stock_quantity}</span>
            </div>
          </div>
        )}

        {/* Badge "Sin control de stock" — visible si el producto NO maneja stock */}
        {!isProductsOnly && !productTracksStock && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-blue-600 text-xl font-black">∞</span>
            <div>
              <p className="text-blue-800 font-bold text-xs">Stock ilimitado</p>
              <p className="text-blue-500 text-[10px]">No descuenta del inventario</p>
            </div>
          </div>
        )}

        {/* Badge global de estado de stock — solo si el producto trackea stock.
            Antes aparecía "✕ Stock Crítico" en productos con tracks_stock=false
            porque stock_quantity siempre vale 0 y stockPercentage→0. */}
        {!isProductsOnly && productTracksStock && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <Badge variant={
              stockStatus === 'optimal' ? 'success' :
              stockStatus === 'warning'  ? 'warning' : 'error'
            } className="w-full text-center justify-center">
              {stockStatus === 'optimal' ? '✓ Stock Óptimo' :
               stockStatus === 'warning'  ? '⚠ Stock Bajo' : '✕ Stock Crítico'}
            </Badge>
          </div>
        )}
      </div>

      {showPrint && tenantId && (
        <PrintLabelModal
          tenantId={tenantId}
          product={{
            name: product.name,
            price: product.unit_price,
            sku: product.sku || '',
            sku2: (product as any).sku2 || '',
          }}
          onClose={() => setShowPrint(false)}
        />
      )}
    </Card>
  );
};
