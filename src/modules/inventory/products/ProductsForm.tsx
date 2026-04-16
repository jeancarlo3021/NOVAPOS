import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import { inventoryProductsService, categoriesService, unitTypesService, Category, UnitType } from '@/services/InventoryProductsService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardContent, CardFooter, Spinner } from '@/components/ui/uiComponents';

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
  const { user } = useAuth();
  const isMountedRef = useRef(true);

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

  const [submitting, setSubmitting] = useState(false);
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
    data: categories = [],
    loading: categoriesLoading,
    error: categoriesError
  } = useSafeFetch(
    () => categoriesService.getAllCategories(user!.tenant_id),
    { timeout: 8000, retries: 2 }
  );

  const {
    data: unitTypes = [],
    loading: unitTypesLoading,
    error: unitTypesError
  } = useSafeFetch(
    () => unitTypesService.getAllUnitTypes(user!.tenant_id),
    { timeout: 8000, retries: 2 }
  );

  // Cargar producto si es edición
  useEffect(() => {
    if (productId && user?.tenant_id) {
      loadProduct();
    }
  }, [productId, user?.tenant_id]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadProduct = async () => {
    try {
      const product = await inventoryProductsService.getProductById(productId!);
      if (isMountedRef.current) {
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
      }
    } catch (err) {
      if (isMountedRef.current) {
        setFormError('Error al cargar el producto');
        console.error(err);
      }
    }
  };

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
      const category = await categoriesService.createCategory(user!.tenant_id, {
        name: newCategory,
        description: '',
        color: '#3B82F6',
      });
      if (isMountedRef.current) {
        setFormData(prev => ({ ...prev, category_id: category.id }));
        setNewCategory('');
        setShowCategoryForm(false);
        setFormSuccess('Categoría creada exitosamente');
        setTimeout(() => setFormSuccess(''), 3000);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setFormError('Error al crear categoría');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setCategoryLoading(false);
      }
    }
  };

  const handleAddUnitType = async () => {
    if (!newUnit.name.trim() || !newUnit.abbreviation.trim()) return;

    setUnitLoading(true);
    try {
      const unitType = await unitTypesService.createUnitType(user!.tenant_id, {
        name: newUnit.name,
        abbreviation: newUnit.abbreviation,
        description: '',
      });
      if (isMountedRef.current) {
        setFormData(prev => ({ ...prev, unit_type_id: unitType.id }));
        setNewUnit({ name: '', abbreviation: '' });
        setShowUnitForm(false);
        setFormSuccess('Tipo de unidad creado exitosamente');
        setTimeout(() => setFormSuccess(''), 3000);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setFormError('Error al crear tipo de unidad');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setUnitLoading(false);
      }
    }
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

      const productData = {
        name: formData.name,
        sku: formData.sku,
        description: formData.description || null,
        category_id: formData.category_id || null,
        unit_type_id: formData.unit_type_id || null,
        unit_price: formData.unit_price ? parseFloat(formData.unit_price) : null,
        cost_price: formData.cost_price ? parseFloat(formData.cost_price) : null,
        stock_quantity: parseInt(formData.stock_quantity) || 0,
        min_stock_level: parseInt(formData.min_stock_level) || 10,
        max_stock_level: parseInt(formData.max_stock_level) || 100,
      };

      if (productId) {
        await inventoryProductsService.updateProduct(productId, productData);
      } else {
        await inventoryProductsService.createProduct(user!.tenant_id, productData);
      }

      if (isMountedRef.current) {
        setFormSuccess(productId ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente');
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setFormError(err instanceof Error ? err.message : 'Error al guardar el producto');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const isLoadingData = categoriesLoading || unitTypesLoading;

  if (isLoadingData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-full max-w-2xl">
          <CardContent className="flex justify-center py-8">
            <Spinner />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-screen overflow-y-auto">
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-2">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-red-800">{formError}</p>
            </div>
          )}

          {formSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-2">
              <div className="text-green-600 flex-shrink-0">✓</div>
              <p className="text-green-800">{formSuccess}</p>
            </div>
          )}

          {(categoriesError || unitTypesError) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-2">
              <AlertCircle className="text-yellow-600 flex-shrink-0" size={20} />
              <p className="text-yellow-800">Algunos datos no se pudieron cargar. Intenta de nuevo.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Fila 1: Nombre y SKU */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {/* Fila 2: Categoría y Tipo de Unidad */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <button
                    type="button"
                    onClick={() => setShowCategoryForm(!showCategoryForm)}
                    disabled={submitting || categoryLoading}
                    className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                  >
                    <Plus size={20} />
                  </button>
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
                  <button
                    type="button"
                    onClick={() => setShowUnitForm(!showUnitForm)}
                    disabled={submitting || unitLoading}
                    className="px-3 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 disabled:opacity-50"
                  >
                    <Plus size={20} />
                  </button>
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

            {/* Fila 3: Precios */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Precio Unitario</label>
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
            </div>

            {/* Fila 4: Stock */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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