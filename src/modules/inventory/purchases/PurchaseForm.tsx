import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface PurchaseFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface Supplier {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  cost_price: number;
}

interface PurchaseItem {
  product_id: number;
  quantity: number;
  unit_price: number;
}

interface PurchaseData {
  supplier_id: number;
  purchase_date: string;
  expected_delivery_date: string;
  items: PurchaseItem[];
  notes: string;
}

export const PurchaseForm: React.FC<PurchaseFormProps> = ({ onSuccess, onCancel }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState<PurchaseData>({
    supplier_id: 0,
    purchase_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    items: [],
    notes: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers');
      const data = await response.json();
      setSuppliers(data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products');
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: 0, quantity: 1, unit_price: 0 }]
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error saving purchase:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl p-6 my-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Nueva Compra</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <select
              value={formData.supplier_id}
              onChange={(e) => setFormData(prev => ({ ...prev, supplier_id: parseInt(e.target.value) }))}
              required
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar proveedor</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={formData.purchase_date}
              onChange={(e) => setFormData(prev => ({ ...prev, purchase_date: e.target.value }))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={formData.expected_delivery_date}
              onChange={(e) => setFormData(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-4">Productos</h3>
            {formData.items.map((item, index) => (
              <div key={index} className="grid grid-cols-4 gap-2 mb-2">
                <select
                  value={item.product_id}
                  onChange={(e) => handleItemChange(index, 'product_id', parseInt(e.target.value))}
                  className="px-2 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">Producto</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                  placeholder="Cantidad"
                  className="px-2 py-2 border border-gray-300 rounded text-sm"
                />
                <input
                  type="number"
                  value={item.unit_price}
                  onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value))}
                  placeholder="Precio"
                  step="0.01"
                  className="px-2 py-2 border border-gray-300 rounded text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="px-2 py-2 text-red-600 hover:bg-red-50 rounded text-sm"
                >
                  Eliminar
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddItem}
              className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
            >
              + Agregar producto
            </button>
          </div>

          <textarea
            placeholder="Notas"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />

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
