import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { inventoryProductsService } from '@/services/InventoryProductsService';
import { useAuth } from '@/context/AuthContext';

export const StockMovements: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [operation, setOperation] = useState<'add' | 'subtract'>('add');

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

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity) return;

    try {
      const product = products.find((p: any) => p.id === selectedProductId);
      if (!product) return;

      const newQuantity = operation === 'add' 
        ? product.quantity_on_hand + parseInt(quantity)
        : product.quantity_on_hand - parseInt(quantity);

      if (newQuantity < 0) {
        setError('No puedes restar más stock del disponible');
        return;
      }

      await inventoryProductsService.updateStock(selectedProductId, newQuantity);
      fetchProducts();
      setQuantity('');
      setSelectedProductId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar stock');
      console.error('Error updating stock:', err);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Movimientos de Stock</h2>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleUpdateStock} className="bg-white rounded-lg p-6 border border-gray-200 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Producto</label>
            <select
              value={selectedProductId || ''}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Seleccionar producto...</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Stock: {p.quantity_on_hand})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Operación</label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as 'add' | 'subtract')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="add">Agregar Stock</option>
              <option value="subtract">Restar Stock</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="1"
              required
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {operation === 'add' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              Actualizar
            </button>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map((product: any) => (
          <div key={product.id} className="bg-white rounded-lg p-4 border border-gray-200">
            <h3 className="font-semibold text-gray-900">{product.name}</h3>
            <p className="text-sm text-gray-600">SKU: {product.sku}</p>
            <p className="text-2xl font-bold text-blue-600 mt-2">{product.quantity_on_hand}</p>
            <p className="text-xs text-gray-500">Mínimo: {product.reorder_level}</p>
          </div>
        ))}
      </div>
    </div>
  );
};