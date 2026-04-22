import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, Plus } from 'lucide-react';
import { unitTypesService, UnitType } from '@/services/Inventory/unitTypesService';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, Button, Spinner } from '@/components/ui/uiComponents';

export const UnitTypesManagement: React.FC = () => {
  const { user } = useAuth();
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formulario
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', abbreviation: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.tenant_id) {
      loadUnitTypes();
    }
  }, [user?.tenant_id]);

  const loadUnitTypes = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await unitTypesService.getAllUnitTypes(user!.tenant_id);
      setUnitTypes(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cargar tipos de unidad';
      setError(errorMsg);
      console.error('Error loading unit types:', err);
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

    if (!form.name.trim() || !form.abbreviation.trim()) {
      setError('Todos los campos son requeridos');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingId) {
        const updated = await unitTypesService.updateUnitType(editingId, form);
        setUnitTypes(unitTypes.map(u => u.id === editingId ? updated : u));
      } else {
        const newUnit = await unitTypesService.createUnitType(user!.tenant_id, form);
        setUnitTypes([...unitTypes, newUnit]);
      }
      resetForm();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al guardar';
      setError(errorMsg);
      console.error('Error saving unit type:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este tipo de unidad?')) return;

    try {
      await unitTypesService.deleteUnitType(id);
      setUnitTypes(unitTypes.filter(u => u.id !== id));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar';
      setError(errorMsg);
      console.error('Error deleting unit type:', err);
    }
  };

  const handleEdit = (unit: UnitType) => {
    setForm({
      name: unit.name,
      abbreviation: unit.abbreviation,
    });
    setEditingId(unit.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ name: '', abbreviation: '' });
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
          <h1 className="text-3xl font-bold">📏 Tipos de Unidad</h1>
          <p className="text-gray-600">Gestiona las unidades de medida de tu inventario</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Nueva Unidad
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
                  placeholder="Ej: Kilogramo, Litro, Unidad..."
                  value={form.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Abreviatura */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Abreviatura *
                </label>
                <input
                  type="text"
                  name="abbreviation"
                  placeholder="Ej: kg, L, u..."
                  value={form.abbreviation}
                  onChange={handleChange}
                  maxLength={5}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
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
      {unitTypes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {unitTypes.map(unit => (
            <Card key={unit.id} className="hover:shadow-lg transition">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">{unit.name}</h3>
                    <div className="mt-2 inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm font-medium">
                      {unit.abbreviation}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(unit)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(unit.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !showForm ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-lg text-gray-500 mb-4">No hay tipos de unidad</p>
            <Button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus size={20} className="mr-2" />
              Crear Primer Tipo de Unidad
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};