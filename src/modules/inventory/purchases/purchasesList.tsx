import React, { useState } from 'react';
import { Plus, Search, Eye, Trash2, RotateCw } from 'lucide-react';
import { inventoryPurchasesService } from '@/services/Inventory/inventoryPurchasesService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { useAuth } from '@/context/AuthContext';
import { Alert, LoadingState, Button, Card, CardContent } from '@/components/ui/uiComponents';
import { PurchaseForm } from './PurchaseForm';

export const PurchasesList: React.FC = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Usar hook seguro para obtener compras
  const {
    data: purchasesData,
    loading,
    error,
    retry
  } = useSafeFetch(
    () => inventoryPurchasesService.getAllPurchases(user!.tenant_id),
    { timeout: 10000, retries: 2, retryDelay: 1000 }
  );

  // Asegurar que purchases siempre sea un array
  const purchases = Array.isArray(purchasesData) ? purchasesData : [];

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro de que desea eliminar esta compra?')) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await inventoryPurchasesService.deletePurchase(id);
      await retry();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar';
      setDeleteError(errorMsg);
      setTimeout(() => setDeleteError(null), 5000);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredPurchases = purchases.filter(purchase =>
    (purchase.purchase_number?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
    (purchase.supplier_id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '✓ Completada';
      case 'pending':
        return '⏳ Pendiente';
      case 'cancelled':
        return '✕ Cancelada';
      default:
        return status;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Compras</h1>
          <p className="text-gray-600">Gestiona tus órdenes de compra</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700"
          disabled={loading}
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva Compra
        </Button>
      </div>

      {/* Modal de Formulario */}
      <PurchaseForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={() => retry()}
      />

      {/* Alertas */}
      {deleteError && (
        <Alert type="error" message={`❌ ${deleteError}`} />
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-red-800">🚨 {error}</span>
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

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por número de compra o proveedor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={loading}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        />
      </div>

      {/* Contenido Principal */}
      {loading ? (
        <LoadingState message="Cargando compras..." />
      ) : purchases.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 text-lg mb-4">
              {searchTerm ? 'No hay compras que coincidan con tu búsqueda' : 'No hay compras registradas'}
            </p>
            {!searchTerm && (
              <Button
                onClick={() => setShowForm(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                Crear Primera Compra
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Mostrando {filteredPurchases.length} de {purchases.length} compras
            </p>
            <Button
              onClick={retry}
              size="sm"
              variant="secondary"
              className="flex items-center gap-2"
            >
              <RotateCw size={16} />
              Actualizar
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Proveedor
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPurchases.map(purchase => (
                  <tr key={purchase.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {purchase.purchase_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {purchase.supplier_id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(purchase.purchase_date).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                      ${purchase.total_amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          purchase.status
                        )}`}
                      >
                        {getStatusLabel(purchase.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm flex gap-2 justify-center">
                      <button
                        className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 p-2 rounded transition"
                        title="Ver detalles"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(purchase.id)}
                        disabled={deleteLoading}
                        className="text-red-600 hover:text-red-900 hover:bg-red-50 p-2 rounded transition disabled:opacity-50"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};