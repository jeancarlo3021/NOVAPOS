import React, { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle } from 'lucide-react';
import { ProductForm } from './ProductsForm';
import { ProductCard } from './ProductCard';
import { inventoryProductsService, InventoryProduct } from '@/services/InventoryProductsService';
import { useAuth } from '@/context/AuthContext';

export const ProductsList: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenant_id) {
      fetchProducts();
    }
  }, [user?.tenant_id]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryProductsService.getAllProducts(user!.tenant_id);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar productos');
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Está seguro de que desea eliminar este producto?')) {
      try {
        await inventoryProductsService.deactivateProduct(id);
        fetchProducts();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al eliminar producto');
        console.error('Error deleting product:', err);
      }
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = filteredProducts.filter(p => p.quantity_on_hand < p.reorder_level);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={fetchProducts}
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
        <h1 className="text-3xl font-bold text-gray-900">Productos</h1>
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm(!showForm);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Nuevo Producto
        </button>
      </div>

      {showForm && (
        <ProductForm
          productId={editingId}
          onSuccess={() => {
            setShowForm(false);
            setEditingId(null);
            fetchProducts();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
          }}
        />
      )}

      {lowStockProducts.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="text-yellow-600 flex-shrink-0" size={20} />
          <div>
            <h3 className="font-semibold text-yellow-900">Stock Bajo</h3>
            <p className="text-sm text-yellow-800">
              {lowStockProducts.length} producto(s) con stock por debajo del mínimo
            </p>
          </div>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => {
                setEditingId(product.id);
                setShowForm(true);
              }}
              onDelete={() => handleDelete(product.id)}
            />
          ))}
        </div>
      )}

      {filteredProducts.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          No hay productos registrados
        </div>
      )}
    </div>
  );
};