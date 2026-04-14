import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface SupplierFormProps {
  supplierId?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface SupplierData {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  payment_terms: string;
}

export const SupplierForm: React.FC<SupplierFormProps> = ({ supplierId, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<SupplierData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    payment_terms: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (supplierId) {
      fetchSupplier();
    }
  }, [supplierId]);

  const fetchSupplier = async () => {
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`);
      if (response.ok) {
        const data = await response.json();
        setFormData(data);
      }
    } catch (err) {
      setError('Error al cargar el proveedor');
      console.error(err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const method = supplierId ? 'PUT' : 'POST';
      const url = supplierId ? `/api/suppliers/${supplierId}` : '/api/suppliers';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        onSuccess();
      } else {
        setError('Error al guardar el proveedor');
      }
    } catch (err) {
      setError('Error de conexión');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            {supplierId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
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
              placeholder="Nombre del proveedor"
              value={formData.name}
              onChange={handleChange}
              required
              className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="tel"
              name="phone"
              placeholder="Teléfono"
              value={formData.phone}
              onChange={handleChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <textarea
              name="address"
              placeholder="Dirección"
              value={formData.address}
              onChange={handleChange}
              className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              name="city"
              placeholder="Ciudad"
              value={formData.city}
              onChange={handleChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              name="country"
              placeholder="País"
              value={formData.country}
              onChange={handleChange}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              name="payment_terms"
              placeholder="Términos de pago (ej: 30 días)"
              value={formData.payment_terms}
              onChange={handleChange}
              className="col-span-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};