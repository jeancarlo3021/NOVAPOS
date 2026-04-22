'use client';

import React from 'react';

interface ReceiptConfig {
  showStoreName: boolean;
  showStoreAddress: boolean;
  showStorePhone: boolean;
  showCashierName: boolean;
  showInvoiceNumber: boolean;
  showDateTime: boolean;
  showCustomerInfo: boolean;
  footerMessage: string;
  [key: string]: any;
}

interface Props {
  config: ReceiptConfig;
  setConfig: (config: ReceiptConfig) => void;
}

export const ReceiptContent: React.FC<Props> = ({ config, setConfig }) => {
  const toggleOption = (key: keyof ReceiptConfig) => {
    setConfig({
      ...config,
      [key]: !config[key],
    });
  };

  const options = [
    {
      key: 'showInvoiceNumber' as const,
      label: 'Número de Factura',
      description: 'Mostrar ID de factura',
    },
    {
      key: 'showDateTime' as const,
      label: 'Fecha y Hora',
      description: 'Mostrar fecha y hora de venta',
    },
    {
      key: 'showStoreName' as const,
      label: 'Nombre del Negocio',
      description: 'Mostrar nombre del restaurante',
    },
    {
      key: 'showStoreAddress' as const,
      label: 'Dirección',
      description: 'Mostrar dirección del negocio',
    },
    {
      key: 'showStorePhone' as const,
      label: 'Teléfono',
      description: 'Mostrar teléfono del negocio',
    },
    {
      key: 'showCustomerInfo' as const,
      label: 'Información del Cliente',
      description: 'Mostrar nombre y teléfono del cliente',
    },
    {
      key: 'showCashierName' as const,
      label: 'Nombre del Cajero',
      description: 'Mostrar quién realizó la venta',
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Elementos a Mostrar</h3>

      {options.map(option => (
        <div
          key={option.key}
          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <div>
            <p className="font-semibold text-gray-900">{option.label}</p>
            <p className="text-sm text-gray-500">{option.description}</p>
          </div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config[option.key] as boolean}
              onChange={() => toggleOption(option.key)}
              className="w-5 h-5 rounded border-gray-300"
            />
          </label>
        </div>
      ))}

      {/* Mensaje de Pie de Página */}
      <div className="border-t border-gray-200 pt-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Mensaje de Pie de Página
        </label>
        <textarea
          value={config.footerMessage}
          onChange={(e) => setConfig({ ...config, footerMessage: e.target.value })}
          placeholder="Ej: ¡GRACIAS POR SU COMPRA!"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
          rows={3}
        />
        <p className="text-xs text-gray-500 mt-2">
          Máximo 80 caracteres. Se mostrará centrado al final de la factura.
        </p>
      </div>
    </div>
  );
};