import React, { useState, useEffect } from 'react';
import { Plus, Search, RotateCw, WifiOff } from 'lucide-react';
import { SupplierCard } from './SupplierCard';
import { inventorySuppliersService } from '@/services/Inventory/inventorySuppliersService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, Spinner, Button, Alert } from '@/components/ui/uiComponents';
import { SupplierForm } from './SupplierForm';
import { AlertCircle } from 'lucide-react'; 

export const SuppliersList: React.FC = () => {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [, setDeleteLoading] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Usar hook seguro para obtener proveedores
  const {
    data: suppliersData,
    loading,
    error,
    retry
  } = useSafeFetch(
    () => inventorySuppliersService.getAllSuppliers(user!.tenant_id),
    { timeout: 10000, retries: 2, retryDelay: 1000 }
  );

  // Asegurar que suppliers siempre sea un array
  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este proveedor?')) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await inventorySuppliersService.deleteSupplier(id);
      await retry();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar';
      setDeleteError(errorMsg);
      setTimeout(() => setDeleteError(null), 5000);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Offline Warning */}
      {!isOnline && (
        <div className="mb-6 bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-500 rounded-lg p-4 flex items-center gap-3">
          <WifiOff size={24} className="text-orange-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-orange-900">Modo sin conexión</p>
            <p className="text-sm text-orange-700">Los cambios se sincronizarán cuando recuperes la conexión</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">📦 Proveedores</h1>
          <p className="text-gray-600">Gestiona tu red de proveedores</p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
          disabled={loading}
        >
          <Plus size={20} />
          Nuevo Proveedor
        </Button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <SupplierForm
          supplierId={editingId}
          onSuccess={() => retry()}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
          }}
        />
      )}

      {/* Alertas */}
      {deleteError && (
        <Alert type="error" message={`❌ ${deleteError}`} />
      )}

      {error && !loading && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-red-600" />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
          <Button
            onClick={retry}
            size="sm"
            className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
          >
            <RotateCw size={16} />
            Reintentar
          </Button>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre o contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={loading}
            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white shadow-sm disabled:bg-gray-100"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-gray-500 text-lg mb-4">
              {searchTerm ? '🔍 No se encontraron proveedores' : '📭 No hay proveedores registrados'}
            </p>
            {!searchTerm && (
              <Button
                onClick={() => {
                  setEditingId(null);
                  setShowForm(true);
                }}
                className="mt-4 bg-blue-600 hover:bg-blue-700"
              >
                Crear primer proveedor
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div>
          {/* Stats */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600">Total de Proveedores</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{suppliers.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600">Resultados Encontrados</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{filteredSuppliers.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600">Con Términos de Pago</p>
                <p className="text-3xl font-bold text-purple-600 mt-2">
                  {suppliers.filter(s => s.payment_terms).length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Grid of Supplier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSuppliers.map(supplier => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                onEdit={() => {
                  setEditingId(supplier.id);
                  setShowForm(true);
                }}
                onDelete={() => handleDelete(supplier.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};