import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { inventoryProductsService, InventoryProduct } from '@/services/InventoryProductsService';

interface ProductFormProps {
  productId?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ProductData {
  name: string;
  sku: string;
  description: string;
  category: string;
  unit_price: number;
  cost_price: number;
  min_stock_level: number;
  max_stock_level: number;
}

export const ProductForm: React.FC<ProductFormProps> = ({ productId, onSuccess, onCancel }) => {
  const { user } = useAuth();
    const [products, setProducts] = useState<InventoryProduct[]>([]);
    const [formData, setFormData] = useState<ProductData>({
    name: '',
    sku: '',
    description: '',
    category: '',
    unit_price: 0,
    cost_price: 0,
    min_stock_level: 10,
    max_stock_level: 100
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['unit_price', 'cost_price', 'min_stock_level', 'max_stock_level'].includes(name)
        ? parseFloat(value) || 0
        : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const method = productId ? 'PUT' : 'POST';
      const url = productId ? `/api/products/${productId}` : '/api/products';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        onSuccess();
      } else {
        setError('Error al guardar el producto');
      }
    } catch (error) {
      setError('Error de conexión');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            {productId ? 'Editar Producto' : 'Nuevo Producto'}
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              name="name"
              placeholder="Nombre del producto"
              value={formData.name}
              onChange={handleChange}
              required
              className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              name="sku"
              placeholder="SKU"
              value={formData.sku}
              onChange={handleChange}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              name="category"
              placeholder="Categoría"
              value={formData.category}
              onChange={handleChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              name="description"
              placeholder="Descripción"
              value={formData.description}
              onChange={handleChange}
              className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              name="cost_price"
              placeholder="Precio de costo"
              value={formData.cost_price}
              onChange={handleChange}
              step="0.01"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              name="unit_price"
              placeholder="Precio unitario"
              value={formData.unit_price}
              onChange={handleChange}
              step="0.01"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              name="min_stock_level"
              placeholder="Stock mínimo"
              value={formData.min_stock_level}
              onChange={handleChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              name="max_stock_level"
              placeholder="Stock máximo"
              value={formData.max_stock_level}
              onChange={handleChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
