import React, { useState, useEffect } from 'react';
import { Plus, Search, Eye, Trash2 } from 'lucide-react';
import { inventoryPurchasesService, InventoryPurchase } from '@/services/inventoryPurchasesService';
import { useAuth } from '@/context/AuthContext';

export const PurchasesList: React.FC = () => {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id) {
      fetchPurchases();
    }
  }, [user?.tenant_id]);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryPurchasesService.getAllPurchases(user!.tenant_id);
      setPurchases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar compras');
      console.error('Error fetching purchases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Está seguro de que desea eliminar esta compra?')) {
      try {
        await inventoryPurchasesService.deletePurchase(id);
        fetchPurchases();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al eliminar compra');
        console.error('Error deleting purchase:', err);
      }
    }
  };

  const filteredPurchases = purchases.filter(purchase =>
    purchase.purchase_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={fetchPurchases}
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
        <h1 className="text-3xl font-bold text-gray-900">Compras</h1>
        <button
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Nueva Compra
        </button>
      </div>

      <div className="mb-6 flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar compras..."
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
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Número</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Proveedor</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Fecha</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Total</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPurchases.map(purchase => (
                <tr key={purchase.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{purchase.purchase_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{purchase.supplier_id}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(purchase.purchase_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                    ${purchase.total_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      purchase.status === 'completed' ? 'bg-green-100 text-green-800' :
                      purchase.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm flex gap-2">
                    <button className="text-blue-600 hover:text-blue-900">
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(purchase.id)}
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

      {filteredPurchases.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          No hay compras registradas
        </div>
      )}
    </div>
  );
};