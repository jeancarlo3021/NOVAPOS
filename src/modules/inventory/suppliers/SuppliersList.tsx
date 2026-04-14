import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { SupplierForm } from './SupplierForm';
import { inventorySuppliersService, InventorySupplier } from '@/services/inventorySuppliersService';
import { useAuth } from '@/context/AuthContext';

export const SuppliersList: React.FC = () => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id) {
      fetchSuppliers();
    }
  }, [user?.tenant_id]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventorySuppliersService.getAllSuppliers(user!.tenant_id);
      setSuppliers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar proveedores');
      console.error('Error fetching suppliers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Está seguro de que desea eliminar este proveedor?')) {
      try {
        await inventorySuppliersService.deleteSupplier(id);
        fetchSuppliers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al eliminar proveedor');
        console.error('Error deleting supplier:', err);
      }
    }
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={fetchSuppliers}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Proveedores</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Nuevo Proveedor
        </button>
      </div>

      {showForm && (
        <SupplierForm
          supplierId={editingId}
          onSuccess={() => {
            setShowForm(false);
            setEditingId(null);
            fetchSuppliers();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
          }}
        />
      )}

      <div className="mb-6 flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar proveedores..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Nombre</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Contacto</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Teléfono</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSuppliers.map(supplier => (
                <tr key={supplier.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{supplier.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{supplier.contact_person || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{supplier.email || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{supplier.phone || '-'}</td>
                  <td className="px-6 py-4 text-sm flex gap-2">
                    <button
                      onClick={() => {
                        setEditingId(supplier.id);
                        setShowForm(true);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(supplier.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredSuppliers.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          No hay proveedores registrados
        </div>
      )}
    </div>
  );
};