'use client';

import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

const DEFAULTS = {
  businessName: '',
  ruc: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  taxPercentage: 13,
  currency: 'CRC',
  timezone: 'America/Costa_Rica',
  void_pin: '',
};

export const GeneralSettings: React.FC = () => {
  const { settings, updateSettings, loading, error } = useSettings('general');
  const [formData, setFormData] = useState(DEFAULTS);
  const [success, setSuccess] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(prev => ({ ...prev, ...settings }));
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'taxPercentage' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    try {
      await updateSettings(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      // error already set by hook
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Configuración General</h2>
        <p className="text-gray-500">Información básica del negocio</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="text-red-600 shrink-0" size={20} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
          <CheckCircle className="text-emerald-600 shrink-0" size={20} />
          <p className="text-emerald-700 text-sm font-semibold">Configuración guardada correctamente</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del Negocio</label>
          <input type="text" name="businessName" value={formData.businessName} onChange={handleChange}
            placeholder="Mi Restaurante"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Cédula Jurídica / RUC</label>
          <input type="text" name="ruc" value={formData.ruc} onChange={handleChange}
            placeholder="3-101-123456"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange}
              placeholder="info@negocio.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Teléfono</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
              placeholder="+506 2234-5678"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Dirección</label>
          <input type="text" name="address" value={formData.address} onChange={handleChange}
            placeholder="Calle Principal 123"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Ciudad / Cantón</label>
          <input type="text" name="city" value={formData.city} onChange={handleChange}
            placeholder="San José"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Impuesto (%)</label>
            <input type="number" name="taxPercentage" value={formData.taxPercentage} onChange={handleChange}
              step="0.01" min="0" max="100"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Moneda</label>
            <select name="currency" value={formData.currency} onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition bg-white">
              <option value="CRC">CRC (₡ Colón)</option>
              <option value="USD">USD ($ Dólar)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1">PIN de anulación de facturas</label>
          <p className="text-xs text-gray-400 mb-2">Requerido para anular facturas en el POS. Solo números, máx. 8 dígitos.</p>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              name="void_pin"
              value={formData.void_pin}
              onChange={e => setFormData(prev => ({ ...prev, void_pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              placeholder="••••"
              inputMode="numeric"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition pr-11 tracking-widest font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPin(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition">
            <Save size={18} />
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  );
};
