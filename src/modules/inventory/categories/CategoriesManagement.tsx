import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, Plus } from 'lucide-react';
import { categoriesService, ProductCategory } from '@/services/Inventory/categoriesService';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, Button, Spinner } from '@/components/ui/uiComponents';

export const CategoriesManagement: React.FC = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formulario
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#3B82F6', icon: '📦' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.tenant_id) {
      loadCategories();
    }
  }, [user?.tenant_id]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await categoriesService.getAllCategories(user!.tenant_id);
      setCategories(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cargar categorías';
      setError(errorMsg);
      console.error('Error loading categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingId) {
        const updated = await categoriesService.updateCategory(editingId, form);
        setCategories(categories.map(c => c.id === editingId ? updated : c));
      } else {
        const newCategory = await categoriesService.createCategory(user!.tenant_id, form);
        setCategories([...categories, newCategory]);
      }
      resetForm();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al guardar';
      setError(errorMsg);
      console.error('Error saving category:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta categoría?')) return;

    try {
      await categoriesService.deleteCategory(id);
      setCategories(categories.filter(c => c.id !== id));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar';
      setError(errorMsg);
      console.error('Error deleting category:', err);
    }
  };

  const handleEdit = (category: ProductCategory) => {
    setForm({
      name: category.name,
      color: category.color,
      icon: category.icon || '📦',
    });
    setEditingId(category.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ name: '', color: '#3B82F6', icon: '📦' });
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📁 Categorías de Productos</h1>
          <p className="text-gray-600">Gestiona las categorías de tu inventario</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Nueva Categoría
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 flex justify-between items-center">
          <span>🚨 {error}</span>
          <button
            onClick={() => setError('')}
            className="text-red-600 hover:text-red-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <Card className="bg-blue-50 border-2 border-blue-200">
          <form onSubmit={handleSave}>
            <CardContent className="p-4 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="Ej: Electrónica, Ropa, Alimentos..."
                  value={form.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Color e Icono */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      name="color"
                      value={form.color}
                      onChange={handleChange}
                      className="w-12 h-10 rounded-lg cursor-pointer border border-gray-300"
                    />
                    <div
                      className="flex-1 rounded-lg border border-gray-300"
                      style={{ backgroundColor: form.color }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Emoji
                  </label>
                  <input
                    type="text"
                    name="icon"
                    placeholder="📦"
                    value={form.icon}
                    onChange={handleChange}
                    maxLength={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-2xl text-center"
                  />
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-4 justify-end pt-4 border-t">
                <Button
                  type="button"
                  onClick={resetForm}
                  variant="secondary"
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saving ? '⏳ Guardando...' : `💾 ${editingId ? 'Actualizar' : 'Crear'}`}
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}

      {/* Grid */}
      {categories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(category => (
            <Card key={category.id} className="hover:shadow-lg transition">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-4xl">{category.icon || '📦'}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(category)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                      title="Eliminar"
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
      ) : !showForm ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-lg text-gray-500 mb-4">No hay categorías</p>
            <Button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus size={20} className="mr-2" />
              Crear Primera Categoría
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};