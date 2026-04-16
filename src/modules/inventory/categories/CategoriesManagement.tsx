import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X } from 'lucide-react';
import { inventoryProductsService, ProductCategory, UnitType } from '@/services/InventoryProductsService';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardContent, Button, Spinner, Badge } from '@/components/ui/uiComponents';

export const CategoriesAndUnitsManagement: React.FC = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'units'>('categories');

  // Formulario de categoría
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', color: '#3B82F6', icon: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // Formulario de unidad
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: '', abbreviation: '' });
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id) {
      loadData();
    }
  }, [user?.tenant_id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesData, unitTypesData] = await Promise.all([
        inventoryProductsService.getAllCategories(user!.tenant_id),
        inventoryProductsService.getAllUnitTypes(user!.tenant_id),
      ]);
      setCategories(categoriesData);
      setUnitTypes(unitTypesData);
    } catch (err) {
      setError('Error al cargar datos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ============ CATEGORÍAS ============

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) return;

    try {
      if (editingCategoryId) {
        const updated = await inventoryProductsService.updateCategory(editingCategoryId, categoryForm);
        setCategories(categories.map(c => c.id === editingCategoryId ? updated : c));
      } else {
        const newCategory = await inventoryProductsService.createCategory(user!.tenant_id, categoryForm);
        setCategories([...categories, newCategory]);
      }
      setCategoryForm({ name: '', color: '#3B82F6', icon: '' });
      setEditingCategoryId(null);
      setShowCategoryForm(false);
    } catch (err) {
      setError('Error al guardar categoría');
      console.error(err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (window.confirm('¿Eliminar esta categoría?')) {
      try {
        await inventoryProductsService.deleteCategory(id);
        setCategories(categories.filter(c => c.id !== id));
      } catch (err) {
        setError('Error al eliminar categoría');
        console.error(err);
      }
    }
  };

  const handleEditCategory = (category: ProductCategory) => {
    setCategoryForm({
      name: category.name,
      color: category.color,
      icon: category.icon || '',
    });
    setEditingCategoryId(category.id);
    setShowCategoryForm(true);
  };

  // ============ UNIDADES ============

  const handleSaveUnit = async () => {
    if (!unitForm.name.trim() || !unitForm.abbreviation.trim()) return;

    try {
      if (editingUnitId) {
        const updated = await inventoryProductsService.updateUnitType(editingUnitId, unitForm);
        setUnitTypes(unitTypes.map(u => u.id === editingUnitId ? updated : u));
      } else {
        const newUnit = await inventoryProductsService.createUnitType(user!.tenant_id, unitForm);
        setUnitTypes([...unitTypes, newUnit]);
      }
      setUnitForm({ name: '', abbreviation: '' });
      setEditingUnitId(null);
      setShowUnitForm(false);
    } catch (err) {
      setError('Error al guardar unidad');
      console.error(err);
    }
  };

  const handleDeleteUnit = async (id: string) => {
    if (window.confirm('¿Eliminar este tipo de unidad?')) {
      try {
        await inventoryProductsService.deleteUnitType(id);
        setUnitTypes(unitTypes.filter(u => u.id !== id));
      } catch (err) {
        setError('Error al eliminar unidad');
        console.error(err);
      }
    }
  };

  const handleEditUnit = (unit: UnitType) => {
    setUnitForm({
      name: unit.name,
      abbreviation: unit.abbreviation,
    });
    setEditingUnitId(unit.id);
    setShowUnitForm(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'categories'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          📁 Categorías ({categories.length})
        </button>
        <button
          onClick={() => setActiveTab('units')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'units'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          📏 Tipos de Unidad ({unitTypes.length})
        </button>
      </div>

      {/* CATEGORÍAS */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Categorías de Productos</h2>
            <button
              onClick={() => {
                setCategoryForm({ name: '', color: '#3B82F6', icon: '' });
                setEditingCategoryId(null);
                setShowCategoryForm(!showCategoryForm);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={20} />
              Nueva Categoría
            </button>
          </div>

          {showCategoryForm && (
            <Card className="bg-blue-50 border-2 border-blue-200">
              <CardContent className="p-4 space-y-4">
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="Nombre de la categoría"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                    <input
                      type="color"
                      value={categoryForm.color}
                      onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                      className="w-full h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Emoji/Icono</label>
                    <input
                      type="text"
                      value={categoryForm.icon}
                      onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                      placeholder="📦"
                      maxLength={2}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-2xl text-center"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveCategory}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    💾 Guardar
                  </button>
                  <button
                    onClick={() => {
                      setShowCategoryForm(false);
                      setEditingCategoryId(null);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
                  >
                    Cancelar
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map(category => (
              <Card key={category.id} className="hover:shadow-lg transition">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-4xl">{category.icon || '📦'}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditCategory(category)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900">{category.name}</h3>
                  <div
                    className="mt-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          {categories.length === 0 && !showCategoryForm && (
            <div className="text-center py-8 text-gray-500">
              No hay categorías. ¡Crea una nueva!
            </div>
          )}
        </div>
      )}

      {/* TIPOS DE UNIDAD */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Tipos de Unidad</h2>
            <button
              onClick={() => {
                setUnitForm({ name: '', abbreviation: '' });
                setEditingUnitId(null);
                setShowUnitForm(!showUnitForm);
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={20} />
              Nueva Unidad
            </button>
          </div>

          {showUnitForm && (
            <Card className="bg-blue-50 border-2 border-blue-200">
              <CardContent className="p-4 space-y-4">
                <input
                  type="text"
                  value={unitForm.name}
                  onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                  placeholder="Nombre (Ej: Kilogramo)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={unitForm.abbreviation}
                  onChange={(e) => setUnitForm({ ...unitForm, abbreviation: e.target.value })}
                  placeholder="Abreviatura (Ej: kg)"
                  maxLength={5}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveUnit}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    💾 Guardar
                  </button>
                  <button
                    onClick={() => {
                      setShowUnitForm(false);
                      setEditingUnitId(null);
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
                  >
                    Cancelar
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {unitTypes.map(unit => (
              <Card key={unit.id} className="hover:shadow-lg transition">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{unit.name}</h3>
                      <Badge className="mt-2">{unit.abbreviation}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditUnit(unit)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteUnit(unit.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {unitTypes.length === 0 && !showUnitForm && (
            <div className="text-center py-8 text-gray-500">
              No hay tipos de unidad. ¡Crea uno nuevo!
            </div>
          )}
        </div>
      )}
    </div>
  );
};