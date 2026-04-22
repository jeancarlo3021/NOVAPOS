'use client';

import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

interface NotificationConfig {
  lowStock: boolean;
  lowStockThreshold: number;
  paymentReminder: boolean;
  dailyReport: boolean;
  reportTime: string;
}

export const NotificationSettings: React.FC = () => {
  const { settings, updateSettings, loading } = useSettings('notifications');
  const [config, setConfig] = useState<NotificationConfig>({
    lowStock: true,
    lowStockThreshold: 10,
    paymentReminder: true,
    dailyReport: false,
    reportTime: '18:00',
  });

  useEffect(() => {
    if (settings) {
      setConfig(settings);
    }
  }, [settings]);

  const handleToggle = (key: keyof NotificationConfig) => {
    setConfig(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) : value,
    }));
  };

  const handleSave = async () => {
    await updateSettings(config);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Notificaciones</h2>
        <p className="text-gray-500">Configura alertas y notificaciones del sistema</p>
      </div>

      <div className="space-y-4">
        {/* Bajo Stock */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Alerta de Bajo Stock</h3>
              <p className="text-sm text-gray-500">Notificar cuando el stock sea bajo</p>
            </div>
            <button
              onClick={() => handleToggle('lowStock')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                config.lowStock
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {config.lowStock ? 'Habilitado' : 'Deshabilitado'}
            </button>
          </div>

          {config.lowStock && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Umbral de Stock Bajo
              </label>
              <input
                type="number"
                name="lowStockThreshold"
                value={config.lowStockThreshold}
                onChange={handleChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Recordatorio de Pago */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Recordatorio de Pagos</h3>
              <p className="text-sm text-gray-500">Notificar sobre pagos pendientes</p>
            </div>
            <button
              onClick={() => handleToggle('paymentReminder')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                config.paymentReminder
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {config.paymentReminder ? 'Habilitado' : 'Deshabilitado'}
            </button>
          </div>
        </div>

        {/* Reporte Diario */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Reporte Diario</h3>
              <p className="text-sm text-gray-500">Enviar resumen diario de ventas</p>
            </div>
            <button
              onClick={() => handleToggle('dailyReport')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                config.dailyReport
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {config.dailyReport ? 'Habilitado' : 'Deshabilitado'}
            </button>
          </div>

          {config.dailyReport && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Hora del Reporte
              </label>
              <input
                type="time"
                name="reportTime"
                value={config.reportTime}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>
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