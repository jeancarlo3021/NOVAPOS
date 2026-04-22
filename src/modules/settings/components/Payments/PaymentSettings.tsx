'use client';

import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

interface PaymentMethod {
  id: string;
  name: string;
  enabled: boolean;
  icon: string;
}

export const PaymentSettings: React.FC = () => {
  const { settings, updateSettings, loading } = useSettings('payments');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { id: 'cash', name: 'Efectivo', enabled: true, icon: '💵' },
    { id: 'card', name: 'Tarjeta', enabled: true, icon: '💳' },
    { id: 'sinpe', name: 'SINPE', enabled: true, icon: '📱' },
  ]);

  useEffect(() => {
    if (settings?.paymentMethods) {
      setPaymentMethods(settings.paymentMethods);
    }
  }, [settings]);

  const toggleMethod = (id: string) => {
    setPaymentMethods(paymentMethods.map(method =>
      method.id === id ? { ...method, enabled: !method.enabled } : method
    ));
  };

  const handleSave = async () => {
    await updateSettings({ paymentMethods });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Configuración de Pagos</h2>
        <p className="text-gray-500">Gestiona los métodos de pago disponibles</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {paymentMethods.map(method => (
          <div
            key={method.id}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">{method.icon}</span>
              <span className="font-semibold text-gray-900">{method.name}</span>
            </div>
            <button
              onClick={() => toggleMethod(method.id)}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                method.enabled
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {method.enabled ? 'Habilitado' : 'Deshabilitado'}
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition"
        >
          <Save size={20} />
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
};