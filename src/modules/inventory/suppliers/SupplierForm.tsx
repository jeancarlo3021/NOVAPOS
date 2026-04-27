import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { inventorySuppliersService } from '@/services/Inventory/inventorySuppliersService';
import { useAuth } from '@/context/AuthContext';
import { Alert } from '@/components/ui/uiComponents';

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
  contact_person?: string;
}

const PRESET_TERMS = ['', 'Contado', '7 días', '15 días', '30 días', '45 días', '60 días', '90 días', '120 días'];

export const SupplierForm: React.FC<SupplierFormProps> = ({ supplierId, onSuccess, onCancel }) => {
  const { user } = useAuth();
  const isMountedRef = useRef(true);

  const [formData, setFormData] = useState<SupplierData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    payment_terms: '',
    contact_person: ''
  });

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(supplierId ? true : false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [customTerm, setCustomTerm] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (supplierId) {
      fetchSupplier();
    }
  }, [supplierId]);

  const fetchSupplier = async () => {
    try {
      setLoadingData(true);
      const supplier = await inventorySuppliersService.getSupplierById(supplierId!);
      if (isMountedRef.current) {
        const pt = supplier.payment_terms || '';
        setFormData({
          name: supplier.name || '',
          email: supplier.email || '',
          phone: supplier.phone || '',
          address: supplier.address || '',
          city: supplier.city || '',
          country: supplier.country || '',
          payment_terms: pt,
          contact_person: supplier.contact_person || ''
        });
        if (pt && !PRESET_TERMS.includes(pt)) setCustomTerm(true);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError('Error al cargar el proveedor');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingData(false);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('El nombre del proveedor es requerido');
      return false;
    }
    if (formData.email && !formData.email.includes('@')) {
      setError('El email no es válido');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      if (!validateForm()) {
        setLoading(false);
        return;
      }

      if (supplierId) {
        await inventorySuppliersService.updateSupplier(supplierId, formData);
      } else {
        await inventorySuppliersService.createSupplier(user!.tenant_id, {
            ...formData,
            is_active: true,
            contact_person: formData.contact_person ?? null,
          });
      }

      if (isMountedRef.current) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          onCancel();
        }, 1500);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Error al guardar el proveedor');
        console.error(err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  if (loadingData) {
    return (
      <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-6">
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 backdrop-blur-lg bg-white/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">
            {supplierId ? '✏️ Editar Proveedor' : '➕ Nuevo Proveedor'}
          </h2>
          <button 
            onClick={onCancel} 
            disabled={loading}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <Alert 
              type="error" 
              message={error}
              onClose={() => setError('')}
            />
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle size={20} className="text-green-600" />
              <span className="text-green-700 font-medium">¡Proveedor guardado exitosamente!</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nombre del Proveedor *
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="Ej: Proveedor ABC"
                  value={formData.name}
                  onChange={handleChange}
                  disabled={loading}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100"
                />
              </div>

              {/* Contact Person */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Persona de Contacto
                </label>
                <input
                  type="text"
                  name="contact_person"
                  placeholder="Nombre del contacto"
                  value={formData.contact_person || ''}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                <input
                  type="text"
                  name="email"
                  placeholder="correo@ejemplo.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="+1 234 567 8900"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100"
                />
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                <textarea
                  name="address"
                  placeholder="Calle, número, apartamento..."
                  value={formData.address}
                  onChange={handleChange}
                  disabled={loading}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none disabled:bg-gray-100"
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ciudad</label>
                <input
                  type="text"
                  name="city"
                  placeholder="Ej: San José"
                  value={formData.city}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100"
                />
              </div>

              {/* Country */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">País</label>
                <input
                  type="text"
                  name="country"
                  placeholder="Ej: Costa Rica"
                  value={formData.country}
                  onChange={handleChange}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100"
                />
              </div>

              {/* Payment Terms */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Plazo de Pago</label>
                <select
                  name="payment_terms"
                  value={PRESET_TERMS.includes(formData.payment_terms) || formData.payment_terms === '' ? formData.payment_terms : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setFormData(prev => ({ ...prev, payment_terms: '' }));
                      setCustomTerm(true);
                    } else {
                      setCustomTerm(false);
                      setFormData(prev => ({ ...prev, payment_terms: e.target.value }));
                    }
                  }}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100 bg-white"
                >
                  <option value="">Sin plazo definido</option>
                  <option value="Contado">Contado (pago inmediato)</option>
                  <option value="7 días">7 días</option>
                  <option value="15 días">15 días</option>
                  <option value="30 días">30 días</option>
                  <option value="45 días">45 días</option>
                  <option value="60 días">60 días</option>
                  <option value="90 días">90 días</option>
                  <option value="120 días">120 días</option>
                  <option value="__custom__">Personalizado...</option>
                </select>
                {customTerm && (
                  <input
                    type="text"
                    name="payment_terms"
                    placeholder="Ej: 45 días neto, pago anticipado..."
                    value={formData.payment_terms}
                    onChange={handleChange}
                    disabled={loading}
                    autoFocus
                    className="mt-2 w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition disabled:bg-gray-100"
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 font-medium transition flex items-center gap-2"
              >
                {loading ? '⏳ Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};