import React, { useState, useEffect } from 'react';
import { X, AlertCircle, TrendingUp, Upload, Loader, Trash2, Image as ImageIcon } from 'lucide-react';
import { calcMargin, MARGIN_TEXT } from '@/utils/priceUtils';
import { inventoryProductsService, categoriesService, unitTypesService } from '@/services/Inventory/InventoryProductsService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { Card, CardHeader, CardContent, CardFooter, Spinner } from '@/components/ui/uiComponents';
import { storageService } from '@/services/storage/storageService';

// ── Form ───────────────────────────────────────────────────────────────────────

interface ProductFormProps {
  productId?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  sku: string;
  description: string;
  category_id: string;
  unit_type_id: string;
  unit_price: string;
  cost_price: string;
  stock_quantity: string;
  min_stock_level: string;
  max_stock_level: string;
}

export const ProductForm: React.FC<ProductFormProps> = ({ productId, onSuccess, onCancel }) => {
  const { user, planFeatures } = useAuth();
  const { tenantId } = useTenantId();
  const isProductsOnly = planFeatures?.inventory_products_only ?? false;
  // Resolved tenantId: works for both owners (user.tenant_id) and staff (via useTenantId lookup)
  const tid = tenantId ?? user?.tenant_id ?? '';

  const [formData, setFormData] = useState<FormData>({
    name: '',
    sku: '',
    description: '',
    category_id: '',
    unit_type_id: '',
    unit_price: '',
    cost_price: '',
    stock_quantity: '0',
    min_stock_level: '10',
    max_stock_level: '100',
  });

  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [tracksStock, setTracksStock] = useState<boolean>(true);

  // Feature de plan: si NO permite mezclar, fuerza tracks_stock = true para todos
  const canMixStock = !!planFeatures?.inventory_mixed_stock;

  const [submitting, setSubmitting] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(!!productId);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState({ name: '', abbreviation: '' });
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [unitLoading, setUnitLoading] = useState(false);

  // Cargar categorías y tipos de unidad
  const {
    data: categoriesData,
    loading: categoriesLoading,
    error: categoriesError
  } = useSafeFetch(
    () => categoriesService.getAllCategories(tid),
    { timeout: 15000, retries: 3, key: tid }
  );
  const categories = categoriesData ?? [];

  const {
    data: unitTypesData,
    loading: unitTypesLoading,
    error: unitTypesError
  } = useSafeFetch(
    () => unitTypesService.getAllUnitTypes(tid),
    { timeout: 15000, retries: 3, key: tid }
  );
  const unitTypes = unitTypesData ?? [];

  // Cargar producto si es edición
  useEffect(() => {
    if (!productId || !user?.tenant_id) {
      setLoadingProduct(false);
      return;
    }

    let active = true;
    setLoadingProduct(true);

    inventoryProductsService.getProductById(productId, user.tenant_id)
      .then((product) => {
        if (!active || !product) return;
        setFormData({
          name: product.name,
          sku: product.sku,
          description: product.description || '',
          category_id: product.category_id || '',
          unit_type_id: product.unit_type_id || '',
          unit_price: product.unit_price?.toString() || '',
          cost_price: product.cost_price?.toString() || '',
          stock_quantity: product.stock_quantity?.toString() || '0',
          min_stock_level: product.min_stock_level?.toString() || '10',
          max_stock_level: product.max_stock_level?.toString() || '100',
        });
        setImageUrl((product as any).image_url || undefined);
        // Si el plan no permite mezclar, siempre true. Si permite, usa el del producto.
        setTracksStock(canMixStock ? ((product as any).tracks_stock ?? true) : true);
      })
      .catch((err) => {
        if (!active) return;
        setFormError('Error al cargar el producto');
      })
      .finally(() => {
        if (active) setLoadingProduct(false);
      });

    return () => { active = false; };
  }, [productId, user?.tenant_id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;

    setCategoryLoading(true);
    try {
      const category = await categoriesService.createCategory(tid, {
        name: newCategory,
        color: '#3B82F6',
      });
      setFormData(prev => ({ ...prev, category_id: category.id }));
      setNewCategory('');
      setShowCategoryForm(false);
      setFormSuccess('Categoría creada exitosamente');
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err) {
      setFormError('Error al crear categoría');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleAddUnitType = async () => {
    if (!newUnit.name.trim() || !newUnit.abbreviation.trim()) return;

    setUnitLoading(true);
    try {
      const unitType = await unitTypesService.createUnitType(tid, {
        name: newUnit.name,
        abbreviation: newUnit.abbreviation,
      });
      setFormData(prev => ({ ...prev, unit_type_id: unitType.id }));
      setNewUnit({ name: '', abbreviation: '' });
      setShowUnitForm(false);
      setFormSuccess('Tipo de unidad creado exitosamente');
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err) {
      setFormError('Error al crear tipo de unidad');
    } finally {
      setUnitLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!tid) {
      setFormError('No se pudo identificar el negocio');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setFormError('El archivo debe ser una imagen');
      return;
    }

    setFormError('');
    setUploadingImage(true);
    try {
      // Borrar imagen anterior si existe
      if (imageUrl) {
        const oldPath = storageService.extractPathFromUrl(imageUrl, 'products');
        if (oldPath) await storageService.remove('products', [oldPath]).catch(() => {});
      }

      // Subir nueva imagen comprimida
      const slug = formData.sku?.trim() || formData.name?.trim() || `prod-${Date.now()}`;
      const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const url = await storageService.uploadImage('products', tid, file, safeSlug);
      setImageUrl(`${url}?t=${Date.now()}`);
    } catch (err: any) {
      setFormError(err.message || 'Error al subir la imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!imageUrl) return;
    try {
      const path = storageService.extractPathFromUrl(imageUrl, 'products');
      if (path) await storageService.remove('products', [path]);
    } catch {}
    setImageUrl(undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');

    try {
      if (!formData.name.trim()) {
        setFormError('El nombre del producto es requerido');
        return;
      }
      if (!formData.sku.trim()) {
        setFormError('El SKU es requerido');
        return;
      }

      // Si el plan no permite mezclar stock, fuerza tracks_stock = true para todos
      const finalTracksStock = canMixStock ? tracksStock : true;

      const productData: any = {
        name: formData.name,
        sku: formData.sku,
        description: formData.description || undefined,
        unit_price: formData.unit_price ? parseFloat(formData.unit_price) : 0,
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : undefined,
        image_url: imageUrl ? imageUrl.split('?')[0] : null,
        tracks_stock: finalTracksStock,
      };

      // Si NO es products_only, agrega los campos de stock, categoría y tipo de unidad
      if (!isProductsOnly) {
        productData.category_id = formData.category_id || undefined;
        productData.unit_type_id = formData.unit_type_id || undefined;
        productData.stock_quantity = parseInt(formData.stock_quantity) || 0;
        productData.min_stock_level = parseInt(formData.min_stock_level) || 10;
        productData.max_stock_level = parseInt(formData.max_stock_level) || 100;
      }

      if (productId) {
        await inventoryProductsService.updateProduct(productId, productData);
      } else {
        await inventoryProductsService.createProduct(tid, productData);
      }

      setFormSuccess(productId ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente');
      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar el producto');
    } finally {
      setSubmitting(false);
    }
  };

  const isLoadingData = categoriesLoading || unitTypesLoading || loadingProduct;

  if (isLoadingData) {
    return (
      <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex justify-center py-8">
            <Spinner />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Obtener el nombre del tipo de unidad actual
  const currentUnitType = unitTypes.find(u => u.id === formData.unit_type_id);
  const unitTypeDisplay = currentUnitType 
    ? `${currentUnitType.name} (${currentUnitType.abbreviation})`
    : 'No seleccionado';

  return (
    <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50 w-full p-4">
      <Card className="w-full max-w-6xl max-h-[95vh] overflow-y-auto">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-center">
          <h2 className="text-2xl font-bold">
            {productId ? '✏️ Editar Producto' : '➕ Nuevo Producto'}
          </h2>
          <button onClick={onCancel} className="text-white hover:bg-blue-800 p-2 rounded" disabled={submitting}>
            <X size={24} />
          </button>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-5 flex gap-4 shadow-md">
              <AlertCircle className="text-red-600 flex-shrink-0" size={32} />
              <div className="flex-1">
                <p className="text-red-900 font-black text-xl leading-tight">No se pudo guardar el producto</p>
                <p className="text-red-800 mt-1 text-base font-semibold">{formError}</p>
              </div>
            </div>
          )}

          {formSuccess && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 flex gap-3">
              <div className="text-green-600 flex-shrink-0 text-2xl">✓</div>
              <p className="text-green-800 font-semibold">{formSuccess}</p>
            </div>
          )}

          {(categoriesError || unitTypesError) && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex gap-3">
              <AlertCircle className="text-yellow-600 flex-shrink-0" size={22} />
              <p className="text-yellow-800 font-semibold">Algunos datos no se pudieron cargar. Intenta de nuevo.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="lg:columns-2 lg:gap-6 space-y-4 *:break-inside-avoid *:mb-4 lg:*:mb-0 lg:[&>*+*]:mt-4">

            {/* Imagen del producto */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Imagen del Producto</label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Producto" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon size={28} className="text-gray-300" />
                  )}
                </div>

                {/* Botones */}
                <div className="flex-1 flex flex-col gap-2">
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm cursor-pointer transition w-fit ${
                    uploadingImage
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                  }`}>
                    {uploadingImage ? (
                      <><Loader size={14} className="animate-spin" /> Subiendo...</>
                    ) : (
                      <><Upload size={14} /> {imageUrl ? 'Reemplazar' : 'Cargar imagen'}</>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageUpload}
                      disabled={uploadingImage}
                      className="hidden"
                    />
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition w-fit"
                    >
                      <Trash2 size={12} /> Eliminar
                    </button>
                  )}
                  <span className="text-xs text-gray-400">JPG, PNG o WebP · max 1 MB · se comprime automáticamente</span>
                </div>
              </div>
            </div>

            {/* Fila 1: Nombre y SKU */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Producto *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ej: Laptop Dell XPS 13"
                  required
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">SKU *</label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="Ej: DELL-XPS-001"
                  required
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Descripción detallada del producto..."
                rows={3}
                disabled={submitting}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            {/* Campos que se ocultan si es products_only */}
            {!isProductsOnly && (
              <>
                {/* Fila 2: Categoría y Tipo de Unidad */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                    <div className="flex gap-2">
                      <select
                        name="category_id"
                        value={formData.category_id}
                        onChange={handleChange}
                        disabled={submitting || categoriesLoading}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        <option value="">Seleccionar categoría...</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {showCategoryForm && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          placeholder="Nueva categoría..."
                          disabled={categoryLoading}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                        />
                        <button
                          type="button"
                          onClick={handleAddCategory}
                          disabled={categoryLoading}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-50"
                        >
                          {categoryLoading ? '⏳' : 'Agregar'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Unidad</label>
                    <div className="flex gap-2">
                      <select
                        name="unit_type_id"
                        value={formData.unit_type_id}
                        onChange={handleChange}
                        disabled={submitting || unitTypesLoading}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        <option value="">Seleccionar unidad...</option>
                        {unitTypes.map(unit => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </option>
                        ))}
                      </select>
                    </div>
                    {showUnitForm && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={newUnit.name}
                          onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })}
                          placeholder="Nombre..."
                          disabled={unitLoading}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                        />
                        <input
                          type="text"
                          value={newUnit.abbreviation}
                          onChange={(e) => setNewUnit({ ...newUnit, abbreviation: e.target.value })}
                          placeholder="Abreviatura..."
                          disabled={unitLoading}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                        />
                        <button
                          type="button"
                          onClick={handleAddUnitType}
                          disabled={unitLoading}
                          className="col-span-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-50"
                        >
                          {unitLoading ? '⏳ Agregando...' : 'Agregar Unidad'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Mostrar tipo de unidad en modo products_only */}
            {isProductsOnly && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Unidad</label>
                <div className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                  {unitTypeDisplay}
                </div>
              </div>
            )}

            {/* Fila 3: Precios */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Precio de Costo</label>
                <input
                  type="number"
                  name="cost_price"
                  value={formData.cost_price}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Precio de Venta</label>
                <input
                  type="number"
                  name="unit_price"
                  value={formData.unit_price}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  disabled={submitting}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* Margen — solo display */}
            {(() => {
              const { label, profit, color } = calcMargin(formData.unit_price, formData.cost_price);
              const mc = MARGIN_TEXT[color];
              const bg =
                color === 'gray'  ? 'bg-gray-50 border-gray-100'   :
                color === 'red'   ? 'bg-red-50 border-red-100'     :
                color === 'amber' ? 'bg-amber-50 border-amber-100' :
                                    'bg-emerald-50 border-emerald-100';
              return (
                <div className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${bg}`}>
                  <div className="flex items-center gap-2">
                    <TrendingUp size={15} className={mc} />
                    <span className="text-sm font-semibold text-gray-600">Margen</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {profit !== null && (
                      <span className={`text-xs font-semibold ${mc}`}>
                        {profit >= 0 ? '+' : ''}₡{Math.abs(profit).toLocaleString('es-CR', { minimumFractionDigits: 0 })} ganancia
                      </span>
                    )}
                    <span className={`text-lg font-black ${mc}`}>{label}</span>
                  </div>
                </div>
              );
            })()}

            {/* Toggle: Manejar Stock — solo visible si el plan permite mezclar */}
            {!isProductsOnly && canMixStock && (
              <div className={`flex items-start gap-3 p-4 rounded-xl border-2 transition ${
                tracksStock
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setTracksStock(!tracksStock)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    tracksStock ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                      tracksStock ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${tracksStock ? 'text-emerald-800' : 'text-amber-800'}`}>
                    📦 Manejar stock para este producto
                  </p>
                  <p className={`text-xs mt-0.5 ${tracksStock ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {tracksStock
                      ? 'Las ventas descontarán del inventario. Útil para productos físicos.'
                      : 'Stock ilimitado. Ideal para servicios, comidas preparadas o productos sin inventario.'}
                  </p>
                </div>
              </div>
            )}

            {/* Fila 4: Stock - Solo si NO es products_only Y maneja stock */}
            {!isProductsOnly && tracksStock && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Stock Actual</label>
                  <input
                    type="number"
                    name="stock_quantity"
                    value={formData.stock_quantity}
                    onChange={handleChange}
                    placeholder="0"
                    min="0"
                    disabled={submitting}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Stock Mínimo</label>
                  <input
                    type="number"
                    name="min_stock_level"
                    value={formData.min_stock_level}
                    onChange={handleChange}
                    placeholder="10"
                    min="0"
                    disabled={submitting}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Stock Máximo</label>
                  <input
                    type="number"
                    name="max_stock_level"
                    value={formData.max_stock_level}
                    onChange={handleChange}
                    placeholder="100"
                    min="0"
                    disabled={submitting}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
              </div>
            )}
          </form>
        </CardContent>

        <CardFooter className="bg-gray-50 border-t border-gray-200 flex justify-end gap-3 p-6">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 font-medium text-gray-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center gap-2"
          >
            {submitting ? '⏳ Guardando...' : '💾 Guardar'}
          </button>
        </CardFooter>
      </Card>
    </div>
  );
};