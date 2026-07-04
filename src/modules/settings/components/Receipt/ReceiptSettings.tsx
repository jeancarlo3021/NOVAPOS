'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useTenantId } from '@/hooks/useTenant';
import { posPrinterService } from '@/services/pos/posPrinterService';
import { ReceiptPreview } from './ReceiptPreview';
import { ReceiptFormat } from './ReceiptFormat';
import { ReceiptContent } from './ReceiptContent';
import { PrinterSettings } from './PrinterSettings';

import type { PrinterEntry } from './PrinterSettings';

interface ReceiptConfig {
  // Formato
  paperWidth: 32 | 40 | 48 | 56 | 80 | 'a4';
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
  qz_certificate?: string;
  printers?: PrinterEntry[];
  /** Copias por venta (1 o 2). */
  printCopies?: number;
  /** Métodos de pago habilitados. */
  paymentMethods?: string[];
  /** Métodos que imprimen doble factura. */
  doubleInvoiceMethods?: string[];
}

export const ReceiptSettings: React.FC = () => {
  const { settings, updateSettings, error } = useSettings('receipt');
  const { tenantId } = useTenantId();
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
    printCopies: 1,
    paymentMethods: ['cash', 'card', 'sinpe', 'credit', 'mixed'],
    doubleInvoiceMethods: ['credit'],
    qz_certificate: '',
    printers: [],
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (settings) {
      // Mezcla la config de impresora LOCAL (por dispositivo) sobre la del tenant.
      const localPrinter = tenantId ? posPrinterService.getLocalPrinterConfig(tenantId) : {};
      setConfig({ ...settings, ...localPrinter } as any);
    }
  }, [settings, tenantId]);

  // Auto-save con debounce
  useEffect(() => {
    if (!config || settings === null) return;

    setSaveStatus('saving');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // La config de IMPRESORA se guarda LOCAL por dispositivo (se sobrepone).
        if (tenantId) posPrinterService.saveLocalPrinterConfig(tenantId, config as any);
        // Al tenant se guarda TODO (incluida la impresora) para que los dispositivos
        // sin config local tengan un printerType válido (no caer al diálogo de Chrome).
        await updateSettings(config as any);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [config, settings, updateSettings]);

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

      {/* Save Status */}
      <div className="flex justify-end gap-2">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition ${
          saveStatus === 'saved'
            ? 'bg-green-50 text-green-700'
            : saveStatus === 'saving'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-gray-50 text-gray-500'
        }`}>
          {saveStatus === 'saving' && (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
              Guardando...
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check size={18} />
              Guardado ✓
            </>
          )}
          {saveStatus === 'idle' && (
            <span className="text-xs">Auto-guardado habilitado</span>
          )}
        </div>
      </div>
    </div>
  );
};