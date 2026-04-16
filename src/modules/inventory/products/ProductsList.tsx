import React, { useState, useEffect } from 'react';
import { Plus, Search, RotateCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { inventoryProductsService, InventoryProduct } from '@/services/InventoryProductsService';
import { useSafeFetch } from '@/hooks/useSafeFetch';
import { ProductForm } from './ProductsForm';
import { ProductCard } from './ProductCard';
import { Alert, LoadingSpinner, StatusBadge, Button, Card, CardContent } from '@/components/ui/uiComponents';

export const ProductsList: React.FC = () => {
  const { user } = useAuth();
  const { isOnline } = useOfflineSync();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Usar el hook seguro para obtener productos
  const {
    data: products = [],
    loading,
    error,
    retry
  } = useSafeFetch(
    () => inventoryProductsService.getAllProducts(user!.tenant_id),
    { timeout: 10000, retries: 2, retryDelay: 1000 }
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este producto?')) {
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await inventoryProductsService.deleteProduct(id);
      // Recargar la lista
      await retry();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar';
      setDeleteError(errorMsg);
      setTimeout(() => setDeleteError(null), 5000);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = filteredProducts.filter(p => p.stock_quantity < p.min_stock_level);
  const criticalStockProducts = filteredProducts.filter(p => p.stock_quantity < (p.min_stock_level * 0.5));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Productos</h1>
          <p className="text-gray-600">Administra tu inventario de productos</p>
        </div>
        <Button 
          onClick={() => { setEditingId(null); setShowForm(true); }} 
          size="lg"
          className="bg-blue-600 hover:bg-blue-700"
          disabled={loading}
        >
          <Plus className="w-5 h-5 mr-2" /> Nuevo Producto
        </Button>
      </div>

      {/* Status Online */}
      <StatusBadge isOnline={isOnline} pending={0} />

      {/* Modal de Formulario */}
      {showForm && (
        <ProductForm
          productId={editingId}
          onSuccess={() => { 
            setShowForm(false); 
            setEditingId(null); 
            retry(); 
          }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

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
            <RotateCw size={16} /> Reintentar
          </Button>
        </div>
      )}

      {criticalStockProducts.length > 0 && (
        <Alert type="error" message={`🚨 ${criticalStockProducts.length} producto(s) con stock CRÍTICO`} />
      )}
      {lowStockProducts.length > 0 && criticalStockProducts.length === 0 && (
        <Alert type="warning" message={`⚠️ ${lowStockProducts.length} producto(s) con stock bajo`} />
      )}

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nombre o SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={loading}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        />
      </div>

      {/* Contenido Principal */}
      {loading ? (
        <LoadingSpinner message="Cargando productos..." />
      ) : filteredProducts.length > 0 ? (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Mostrando {filteredProducts.length} de {products.length} productos
            </p>
            <Button
              onClick={retry}
              size="sm"
              variant="outline"
              className="flex items-center gap-2"
            >
              <RotateCw size={16} /> Actualizar
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={() => { setEditingId(product.id); setShowForm(true); }}
                onDelete={() => handleDelete(product.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {searchTerm ? 'No hay productos que coincidan con tu búsqueda' : 'No hay productos registrados'}
            </p>
            {!searchTerm && (
              <Button 
                onClick={() => { setEditingId(null); setShowForm(true); }}
                className="mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" /> Crear Primer Producto
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};