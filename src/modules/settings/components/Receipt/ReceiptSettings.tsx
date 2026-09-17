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
  showCommercialName?: boolean;
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
    paperWidth: 48,   // 80mm
    showLogo: false,
    showStoreName: true,
    showCommercialName: false,
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

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Auto-guardado que no pisa lo que se está editando.
   *
   * Antes el guardado se disparaba cada vez que cambiaba `config`, y `config` se
   * volvía a cargar desde `settings` cada vez que cambiaba. Al guardar,
   * `settings` se actualizaba con la copia enviada, eso reescribía el
   * formulario, eso contaba como un cambio y se volvía a guardar: un bucle cada
   * segundo y medio. Peor: lo que se tocaba mientras viajaba el guardado se
   * reemplazaba con la copia vieja —el interruptor volvía atrás, el texto se
   * borraba— y no dejaba configurar.
   *
   * Ahora:
   *   · lo del servidor se carga al formulario SOLO hasta que el usuario toca
   *     algo; desde ahí manda lo que está en pantalla;
   *   · solo un cambio del usuario programa el guardado;
   *   · se guarda lo ÚLTIMO que hay en pantalla (no la copia de cuando se programó);
   *   · si falla, se dice;
   *   · al salir de la pantalla, lo pendiente se guarda en el momento.
   */
  const editadoRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;
  const pendienteRef = useRef(false);

  useEffect(() => {
    if (!settings || editadoRef.current) return;
    // Mezcla la config de impresora LOCAL (por dispositivo) sobre la del tenant.
    const localPrinter = tenantId ? posPrinterService.getLocalPrinterConfig(tenantId) : {};
    setConfig(prev => ({ ...prev, ...settings, ...localPrinter } as any));
  }, [settings, tenantId]);

  const guardarAhora = async () => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    if (!pendienteRef.current) return;
    pendienteRef.current = false;
    const actual = configRef.current;
    setSaveStatus('saving'); setSaveError('');
    try {
      // La config de IMPRESORA se guarda LOCAL por dispositivo (se sobrepone).
      if (tenantId) posPrinterService.saveLocalPrinterConfig(tenantId, actual as any);
      // Al tenant se guarda TODO (incluida la impresora) para que los dispositivos
      // sin config local tengan un printerType válido (no caer al diálogo de Chrome).
      await updateSettings(actual as any);
      // Si se editó algo mientras viajaba, ese cambio ya programó otro guardado.
      if (!pendienteRef.current) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(st => (st === 'saved' ? 'idle' : st)), 2000);
      }
    } catch (e) {
      pendienteRef.current = true;   // queda pendiente: se reintenta con el próximo cambio
      setSaveStatus('error');
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };
  const guardarAhoraRef = useRef(guardarAhora);
  guardarAhoraRef.current = guardarAhora;

  /** Cambio hecho por el usuario: se aplica y se programa el guardado. */
  const cambiar = (next: ReceiptConfig | ((prev: ReceiptConfig) => ReceiptConfig)) => {
    editadoRef.current = true;
    pendienteRef.current = true;
    setConfig(prev => (typeof next === 'function' ? (next as any)(prev) : next));
    setSaveStatus('saving'); setSaveError('');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { void guardarAhoraRef.current(); }, 1200);
  };

  // Al salir de la pantalla (o cambiar de sección) no se pierde el último cambio.
  useEffect(() => () => { void guardarAhoraRef.current(); }, []);

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
        {activeTab === 'format' && <ReceiptFormat config={config} setConfig={(c: any) => cambiar(c)} />}
        {activeTab === 'content' && <ReceiptContent config={config} setConfig={(c: any) => cambiar(c)} />}
        {activeTab === 'printer' && <PrinterSettings config={config} setConfig={(c: any) => cambiar(c)} />}
        {activeTab === 'preview' && <ReceiptPreview config={config} />}
      </div>

      {/* Save Status */}
      <div className="flex justify-end gap-2">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition ${
          saveStatus === 'saved'
            ? 'bg-green-50 text-green-700'
            : saveStatus === 'saving'
            ? 'bg-blue-50 text-blue-700'
            : saveStatus === 'error'
            ? 'bg-red-50 text-red-700'
            : 'bg-gray-50 text-gray-500'
        }`}>
          {saveStatus === 'error' && (
            <span className="text-sm">
              No se guardó: {saveError}{' '}
              <button type="button" onClick={() => { pendienteRef.current = true; void guardarAhora(); }}
                className="underline font-black">Reintentar</button>
            </span>
          )}
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