'use client';

import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { ReceiptPreview } from './ReceiptPreview';
import { ReceiptFormat } from './ReceiptFormat';
import { ReceiptContent } from './ReceiptContent';
import { PrinterSettings } from './PrinterSettings';

interface ReceiptConfig {
  // Formato
  paperWidth: 32 | 40 | 48 | 56 | 80;
  showLogo: boolean;
  logoUrl?: string;

  // Contenido
  showStoreName: boolean;
  showStoreAddress: boolean;
  showStorePhone: boolean;
  showCashierName: boolean;
  showInvoiceNumber: boolean;
  showDateTime: boolean;
  showCustomerInfo: boolean;
  footerMessage: string;

  // Impresora
  printerName?: string;
  printerType: 'thermal' | 'browser' | 'qztray';
  autoprint: boolean;
}

export const ReceiptSettings: React.FC = () => {
  const { settings, updateSettings, loading, error } = useSettings('receipt');
  const [activeTab, setActiveTab] = useState<'format' | 'content' | 'printer' | 'preview'>('format');
  const [config, setConfig] = useState<ReceiptConfig>({
    paperWidth: 80,
    showLogo: false,
    showStoreName: true,
    showStoreAddress: true,
    showStorePhone: true,
    showCashierName: false,
    showInvoiceNumber: true,
    showDateTime: true,
    showCustomerInfo: true,
    footerMessage: '¡GRACIAS POR SU COMPRA!',
    printerType: 'browser',
    autoprint: false,
  });

  useEffect(() => {
    if (settings) {
      setConfig(settings);
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings(config);
  };

  const tabs = [
    { id: 'format' as const, label: 'Formato', icon: '📏' },
    { id: 'content' as const, label: 'Contenido', icon: '📝' },
    { id: 'printer' as const, label: 'Impresora', icon: '🖨️' },
    { id: 'preview' as const, label: 'Vista Previa', icon: '👁️' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Personalización de Factura</h2>
        <p className="text-gray-500">Configura la apariencia y comportamiento de tus facturas</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-semibold whitespace-nowrap transition border-b-2 ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'format' && <ReceiptFormat config={config} setConfig={(c: any) => setConfig(c)} />}
        {activeTab === 'content' && <ReceiptContent config={config} setConfig={(c: any) => setConfig(c)} />}
        {activeTab === 'printer' && <PrinterSettings config={config} setConfig={(c: any) => setConfig(c)} />}
        {activeTab === 'preview' && <ReceiptPreview config={config} />}
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
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