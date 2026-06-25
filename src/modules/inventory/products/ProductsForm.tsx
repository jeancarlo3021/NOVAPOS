import React, { useState, useEffect } from 'react';
import { X, AlertCircle, TrendingUp, Upload, Loader, Trash2, Image as ImageIcon, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { calcMargin, MARGIN_TEXT } from '@/utils/priceUtils';
import { inventoryProductsService, categoriesService, unitTypesService } from '@/services/Inventory/InventoryProductsService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useAuth } from '@/context/AuthContext';
import { useTenantId } from '@/hooks/useTenant';
import { Card, CardHeader, CardContent, CardFooter, Spinner } from '@/components/ui/uiComponents';
import { storageService } from '@/services/storage/storageService';
import { cacheGet, cacheKey } from '@/utils/offlineCache';

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
  cabys_code: string;
  iva_rate: string;
}

export const ProductForm: React.FC<ProductFormProps> = ({ productId, onSuccess, onCancel }) => {
  const { user, planFeatures } = useAuth();
  const { tenantId } = useTenantId();
  const isProductsOnly = planFeatures?.inventory_products_only ?? false;
  // Resolved tenantId: works for both owners (user.tenant_id) and staff (via useTenantId lookup)
  const tid = tenantId ?? user?.tenant_id ?? '';

  // IVA "guía" desde la configuración general (no es un default fijo: solo el
  // valor sugerido al crear un producto). Si no hay guía, queda vacío.
  const ivaGuide = (() => {
    try {
      const c = cacheGet<any>(cacheKey(tid, 'settings_general'));
      const v = (c?.config ?? c)?.taxPercentage;
      return v != null ? String(v) : '';
    } catch { return ''; }
  })();

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
    cabys_code: '',
    iva_rate: ivaGuide,
  });

  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [tracksStock, setTracksStock] = useState<boolean>(true);
  // Modificadores / adicionales del producto (grupos con opciones)
  const [modGroups, setModGroups] = useState<import('@/services/Inventory/modifiersService').ModifierGroup[]>([]);
  const [showModifiers, setShowModifiers] = useState(false);

  // El stock infinito (tracks_stock=false) está disponible en todas las
  // cuentas con inventario, independiente del plan.

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
  // Modo simple por defecto al crear, modo avanzado al editar (para no esconder
  // datos ya configurados). Botón para mostrar/ocultar campos opcionales.
  const [showAdvanced, setShowAdvanced] = useState<boolean>(!!productId);

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
          cabys_code: (product as any).cabys_code ?? '',
          iva_rate: (product as any).iva_rate?.toString() ?? ivaGuide,
        });
        setImageUrl((product as any).image_url || undefined);
        // Si el plan no permite mezclar, siempre true. Si permite, usa el del producto.
        setTracksStock((product as any).tracks_stock ?? true);
        // Cargar modificadores existentes
        import('@/services/Inventory/modifiersService').then(({ modifiersService }) => {
          modifiersService.forProduct(productId)
            .then(groups => { if (active && Array.isArray(groups)) { setModGroups(groups); if (groups.length > 0) setShowModifiers(true); } })
            .catch(() => {});
        });
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

      // El stock infinito está disponible en todas las cuentas con inventario.
      const finalTracksStock = tracksStock;

      const productData: any = {
        name: formData.name,
        sku: formData.sku,
        description: formData.description || undefined,
        unit_price: formData.unit_price ? parseFloat(formData.unit_price) : 0,
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : undefined,
        image_url: imageUrl ? imageUrl.split('?')[0] : null,
        tracks_stock: finalTracksStock,
        // Facturación Electrónica — CABYS opcional. IVA por producto: el que se
        // elija; si se deja vacío, se usa la guía de configuración (o 0).
        cabys_code: formData.cabys_code.trim() || null,
        iva_rate:   formData.iva_rate ? parseFloat(formData.iva_rate) : (ivaGuide ? parseFloat(ivaGuide) : 0),
      };

      // Si NO es products_only, agrega los campos de stock, categoría y tipo de unidad
      if (!isProductsOnly) {
        productData.category_id = formData.category_id || undefined;
        productData.unit_type_id = formData.unit_type_id || undefined;
        productData.stock_quantity = parseInt(formData.stock_quantity) || 0;
        productData.min_stock_level = parseInt(formData.min_stock_level) || 10;
        productData.max_stock_level = parseInt(formData.max_stock_level) || 100;
      }

      let savedId = productId;
      if (productId) {
        await inventoryProductsService.updateProduct(productId, productData);
      } else {
        const created = await inventoryProductsService.createProduct(tid, productData);
        savedId = (created as any)?.id ?? null;
      }

      // Guardar modificadores (adicionales) del producto si hay grupos definidos
      if (savedId) {
        try {
          const { modifiersService } = await import('@/services/Inventory/modifiersService');
          await modifiersService.saveForProduct(savedId, modGroups);
        } catch (e) {
          console.warn('[ProductForm] no se pudieron guardar modificadores:', e);
        }
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
        <CardHeader className="bg-linear-to-r from-blue-600 to-blue-700 text-white flex justify-between items-center">
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
              <AlertCircle className="text-red-600 shrink-0" size={32} />
              <div className="flex-1">
                <p className="text-red-900 font-black text-xl leading-tight">No se pudo guardar el producto</p>
                <p className="text-red-800 mt-1 text-base font-semibold">{formError}</p>
              </div>
            </div>
          )}

          {formSuccess && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 flex gap-3">
              <div className="text-green-600 shrink-0 text-2xl">✓</div>
              <p className="text-green-800 font-semibold">{formSuccess}</p>
            </div>
          )}

          {(categoriesError || unitTypesError) && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex gap-3">
              <AlertCircle className="text-yellow-600 shrink-0" size={22} />
              <p className="text-yellow-800 font-semibold">Algunos datos no se pudieron cargar. Intenta de nuevo.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── BLOQUE ESENCIAL — siempre visible, campos grandes ─────────── */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-4 items-start">
                {/* Imagen compacta */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt="Producto" className="w-full h-full object-contain p-1" />
                    ) : (
                      <ImageIcon size={32} className="text-gray-300" />
                    )}
                  </div>
                  <label className={`text-xs font-bold cursor-pointer transition ${
                    uploadingImage ? 'text-gray-400' : 'text-blue-600 hover:underline'
                  }`}>
                    {uploadingImage ? (
                      <span className="inline-flex items-center gap-1"><Loader size={12} className="animate-spin" /> Subiendo…</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Upload size={12} /> {imageUrl ? 'Cambiar' : 'Subir foto'}</span>
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
                      className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                    >
                      <Trash2 size={11} /> Quitar
                    </button>
                  )}
                </div>

                {/* Nombre + SKU + Precio (los 3 esenciales) */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-base font-black text-gray-800 mb-1.5">Nombre del producto *</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Ej: Coca-Cola 600ml"
                      required
                      autoFocus
                      disabled={submitting}
                      className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">SKU / Código *</label>
                      <input
                        type="text"
                        name="sku"
                        value={formData.sku}
                        onChange={handleChange}
                        placeholder="Ej: 7501055309948"
                        required
                        disabled={submitting}
                        className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">Precio de venta *</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-lg">₡</span>
                        <input
                          type="number"
                          name="unit_price"
                          value={formData.unit_price}
                          onChange={handleChange}
                          placeholder="0"
                          step="0.01"
                          min="0"
                          disabled={submitting}
                          className="w-full pl-8 pr-4 py-2.5 text-lg font-black border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Facturación Electrónica ────────────────────────────────── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">
                        CABYS <span className="text-xs text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        name="cabys_code"
                        value={formData.cabys_code}
                        onChange={handleChange}
                        placeholder="Código CABYS de Hacienda"
                        disabled={submitting}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1.5">IVA %</label>
                      <select
                        name="iva_rate"
                        value={formData.iva_rate}
                        onChange={handleChange}
                        disabled={submitting}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      >
                        <option value="">— Elegir IVA —</option>
                        <option value="13">13% (General)</option>
                        <option value="4">4% (Servicios médicos)</option>
                        <option value="2">2% (Medicamentos/educación)</option>
                        <option value="1">1% (Canasta básica)</option>
                        <option value="0">Exento</option>
                      </select>
                      {ivaGuide && !formData.iva_rate && (
                        <p className="text-[11px] text-gray-400 mt-1">Sugerido por configuración: {ivaGuide}%</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Adicionales / Modificadores (solo restaurante) ── */}
              {(planFeatures?.restaurant || planFeatures?.tables) && (
              <div className="rounded-xl border-2 border-gray-200">
                <button type="button"
                  onClick={() => setShowModifiers(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left">
                  <span className="font-black text-gray-800 text-sm flex items-center gap-1.5">
                    🍽️ Adicionales / Modificadores
                    {modGroups.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                        {modGroups.length} grupo{modGroups.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  {showModifiers ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showModifiers && (
                  <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-500">
                      Definí grupos de opciones (ej. "Punto de cocción", "Salsas extra"). En el POS de restaurante
                      se pedirán al agregar este plato.
                    </p>
                    {modGroups.map((g, gi) => (
                      <div key={gi} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/60">
                        <div className="flex items-center gap-2">
                          <input value={g.name}
                            onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, name: e.target.value } : x))}
                            placeholder="Nombre del grupo (ej. Salsas)"
                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                          <button type="button"
                            onClick={() => setModGroups(prev => prev.filter((_, i) => i !== gi))}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          <label className="flex items-center gap-1">
                            Mín:
                            <input type="number" min={0} value={g.min_select}
                              onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, min_select: parseInt(e.target.value) || 0 } : x))}
                              className="w-14 px-1.5 py-1 border border-gray-200 rounded text-center" />
                          </label>
                          <label className="flex items-center gap-1">
                            Máx:
                            <input type="number" min={1} value={g.max_select}
                              onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, max_select: parseInt(e.target.value) || 1 } : x))}
                              className="w-14 px-1.5 py-1 border border-gray-200 rounded text-center" />
                          </label>
                          <span className="text-gray-400">{g.min_select > 0 ? 'Obligatorio' : 'Opcional'}</span>
                        </div>
                        {/* Opciones del grupo */}
                        <div className="space-y-1.5">
                          {g.modifiers.map((m, mi) => (
                            <div key={mi} className="flex items-center gap-2">
                              <input value={m.name}
                                onChange={e => setModGroups(prev => prev.map((x, i) => i === gi
                                  ? { ...x, modifiers: x.modifiers.map((y, j) => j === mi ? { ...y, name: e.target.value } : y) } : x))}
                                placeholder="Opción (ej. Extra queso)"
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm" />
                              <div className="relative w-24">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">+₡</span>
                                <input type="number" value={m.price_delta || ''}
                                  onChange={e => setModGroups(prev => prev.map((x, i) => i === gi
                                    ? { ...x, modifiers: x.modifiers.map((y, j) => j === mi ? { ...y, price_delta: parseFloat(e.target.value) || 0 } : y) } : x))}
                                  placeholder="0"
                                  className="w-full pl-7 pr-1 py-1 border border-gray-200 rounded text-sm text-right" />
                              </div>
                              <button type="button"
                                onClick={() => setModGroups(prev => prev.map((x, i) => i === gi
                                  ? { ...x, modifiers: x.modifiers.filter((_, j) => j !== mi) } : x))}
                                className="p-1 text-gray-400 hover:text-red-500">
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                          <button type="button"
                            onClick={() => setModGroups(prev => prev.map((x, i) => i === gi
                              ? { ...x, modifiers: [...x.modifiers, { name: '', price_delta: 0 }] } : x))}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                            <Plus size={12} /> Agregar opción
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button"
                      onClick={() => setModGroups(prev => [...prev, { name: '', min_select: 0, max_select: 1, modifiers: [] }])}
                      className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 text-sm font-bold hover:border-emerald-400 hover:text-emerald-700 flex items-center justify-center gap-1.5">
                      <Plus size={14} /> Agregar grupo de adicionales
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* ── Stock infinito vs Stock actual — ESENCIAL, siempre visible ── */}
              {!isProductsOnly && (
                <div className={`rounded-xl border-2 p-3 transition ${
                  !tracksStock
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!tracksStock}
                      onChange={e => setTracksStock(!e.target.checked)}
                      disabled={submitting}
                      className="mt-1 w-5 h-5 rounded text-blue-600 focus:ring-2 focus:ring-blue-400"
                    />
                    <div className="flex-1">
                      <p className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                        Stock infinito (∞)
                        {!tracksStock && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-600 text-white rounded uppercase tracking-wider">
                            Activo
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {!tracksStock
                          ? 'Las ventas NO descontarán inventario. Útil para servicios, comidas preparadas o productos hechos al momento.'
                          : 'Marcá esta opción si el producto no necesita control de stock (servicios, comidas, etc.)'}
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Stock actual — solo si lleva control de stock */}
              {!isProductsOnly && tracksStock && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Stock actual</label>
                  <input
                    type="number"
                    name="stock_quantity"
                    value={formData.stock_quantity}
                    onChange={handleChange}
                    placeholder="0"
                    min="0"
                    disabled={submitting}
                    className="w-full px-4 py-2.5 text-lg font-bold border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* ── Botón "Más opciones" ───────────────────────────────────── */}
            <button
              type="button"
              onClick={() => setShowAdvanced(s => !s)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-sm transition"
            >
              {showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              {showAdvanced ? 'Ocultar opciones avanzadas' : 'Más opciones (categoría, costo, unidad, descripción…)'}
            </button>

            {/* ── BLOQUE AVANZADO — colapsable ─────────────────────────── */}
            {showAdvanced && (
              <div className="lg:columns-2 lg:gap-6 space-y-4 *:break-inside-avoid *:mb-4 lg:*:mb-0 lg:[&>*+*]:mt-4 pt-2 border-t border-gray-100">

                {/* Descripción */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Detalle opcional…"
                    rows={2}
                    disabled={submitting}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>

                {!isProductsOnly && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                      <select
                        name="category_id"
                        value={formData.category_id}
                        onChange={handleChange}
                        disabled={submitting || categoriesLoading}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        <option value="">Sin categoría</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      {showCategoryForm && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder="Nueva categoría…"
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
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de unidad</label>
                      <select
                        name="unit_type_id"
                        value={formData.unit_type_id}
                        onChange={handleChange}
                        disabled={submitting || unitTypesLoading}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        <option value="">Sin unidad</option>
                        {unitTypes.map(unit => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name} ({unit.abbreviation})
                          </option>
                        ))}
                      </select>
                      {showUnitForm && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newUnit.name}
                            onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })}
                            placeholder="Nombre…"
                            disabled={unitLoading}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                          />
                          <input
                            type="text"
                            value={newUnit.abbreviation}
                            onChange={(e) => setNewUnit({ ...newUnit, abbreviation: e.target.value })}
                            placeholder="Abreviatura…"
                            disabled={unitLoading}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                          />
                          <button
                            type="button"
                            onClick={handleAddUnitType}
                            disabled={unitLoading}
                            className="col-span-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-50"
                          >
                            {unitLoading ? '⏳ Agregando…' : 'Agregar unidad'}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {isProductsOnly && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de unidad</label>
                    <div className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                      {unitTypeDisplay}
                    </div>
                  </div>
                )}

                {/* Precio de costo */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Precio de costo</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₡</span>
                    <input
                      type="number"
                      name="cost_price"
                      value={formData.cost_price}
                      onChange={handleChange}
                      placeholder="0"
                      step="0.01"
                      min="0"
                      disabled={submitting}
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 tabular-nums"
                    />
                  </div>
                </div>

                {/* Margen */}
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

                {/* Toggle "Stock infinito" se movió arriba al bloque esencial. */}

                {/* Min / Max stock */}
                {!isProductsOnly && tracksStock && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Stock mínimo</label>
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
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Stock máximo</label>
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
              </div>
            )}
          </form>
        </CardContent>

        <CardFooter className="bg-gray-50 border-t border-gray-200 grid grid-cols-3 gap-3 p-5">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="h-14 rounded-2xl border-2 border-gray-300 hover:bg-gray-100 font-black text-base text-gray-700 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="col-span-2 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-black text-lg disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2 transition shadow-sm"
          >
            {submitting ? 'Guardando…' : (productId ? 'Actualizar producto' : 'Guardar producto')}
          </button>
        </CardFooter>
      </Card>
    </div>
  );
};