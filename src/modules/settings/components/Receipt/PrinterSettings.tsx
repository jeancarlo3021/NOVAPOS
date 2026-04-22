'use client';

import React, { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';

interface ReceiptConfig {
  printerName?: string;
  printerType: 'thermal' | 'browser' | 'qztray';
  autoprint: boolean;
  [key: string]: any;
}

interface Props {
  config: ReceiptConfig;
  setConfig: (config: ReceiptConfig) => void;
}

export const PrinterSettings: React.FC<Props> = ({ config, setConfig }) => {
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);

  useEffect(() => {
    // Obtener impresoras disponibles
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'camera' }).then(() => {
        // Simulación de impresoras disponibles
        setAvailablePrinters(['Impresora Térmica 1', 'Impresora Térmica 2', 'Impresora Estándar']);
      });
    }
  }, []);

  const printerTypes = [
    {
      id: 'thermal' as const,
      label: 'Impresora Térmica (ESC/POS)',
      description: 'Impresoras térmicas para recibos (Epson, Star, Bixolon)',
      icon: '🖨️',
    },
    {
      id: 'browser' as const,
      label: 'Impresora del Navegador',
      description: 'Usa el diálogo de impresión estándar del navegador',
      icon: '🌐',
    },
    {
      id: 'qztray' as const,
      label: 'QZ Tray (Recomendado)',
      description: 'Impresión directa sin diálogos (requiere QZ Tray instalado)',
      icon: '⚡',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Tipo de Impresora */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Tipo de Impresora</h3>
        <div className="space-y-3">
          {printerTypes.map(type => (
            <button
              key={type.id}
              onClick={() => setConfig({ ...config, printerType: type.id })}
              className={`w-full p-4 border-2 rounded-lg text-left transition ${
                config.printerType === type.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{type.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{type.label}</p>
                  <p className="text-sm text-gray-500">{type.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Seleccionar Impresora */}
      {config.printerType === 'thermal' && (
        <div className="border-t border-gray-200 pt-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Seleccionar Impresora
          </label>
          <select
            value={config.printerName || ''}
            onChange={(e) => setConfig({ ...config, printerName: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="">-- Selecciona una impresora --</option>
            {availablePrinters.map(printer => (
              <option key={printer} value={printer}>
                {printer}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-2">
            Si no ves tu impresora, asegúrate de que esté conectada y encendida.
          </p>
        </div>
      )}

      {/* QZ Tray Info */}
      {config.printerType === 'qztray' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-900 font-semibold mb-2">ℹ️ Información de QZ Tray</p>
          <p className="text-blue-800 text-sm mb-3">
            QZ Tray permite imprimir directamente sin diálogos. Para usarlo:
          </p>
          <ol className="text-blue-800 text-sm space-y-1 ml-4 list-decimal">
            <li>Descarga QZ Tray desde <a href="https://qz.io" target="_blank" rel="noopener noreferrer" className="underline font-semibold">qz.io</a></li>
            <li>Instálalo en tu computadora</li>
            <li>Inicia el servicio QZ Tray</li>
            <li>Conecta tu impresora térmica</li>
          </ol>
        </div>
      )}

      {/* Impresión Automática */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
          <div>
            <p className="font-semibold text-gray-900">Impresión Automática</p>
            <p className="text-sm text-gray-500">Imprimir automáticamente después de cada venta</p>
          </div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoprint}
              onChange={(e) => setConfig({ ...config, autoprint: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300"
            />
          </label>
        </div>
      </div>

      {/* Test Print */}
      <div className="border-t border-gray-200 pt-6">
        <button
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
        >
          <Printer size={20} />
          Prueba de Impresión
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Envía un ticket de prueba a la impresora seleccionada
        </p>
      </div>
    </div>
  );
};