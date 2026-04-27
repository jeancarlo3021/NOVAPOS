'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { posPrinterService, POSPrinterService } from '@/services/pos/posPrinterService';

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

type QZStatus = 'idle' | 'connecting' | 'connected' | 'unavailable';

export const PrinterSettings: React.FC<Props> = ({ config, setConfig }) => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? '';

  const [qzStatus, setQZStatus] = useState<QZStatus>('idle');
  const [qzPrinters, setQZPrinters] = useState<string[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Check QZ Tray availability on mount
  useEffect(() => {
    if (POSPrinterService.isQZAvailable()) setQZStatus('idle');
    else setQZStatus('unavailable');
  }, []);

  const handleDetectQZPrinters = useCallback(async () => {
    setQZStatus('connecting');
    setQZPrinters([]);
    try {
      const list = await POSPrinterService.getQZPrinters();
      setQZPrinters(list);
      setQZStatus(list.length >= 0 ? 'connected' : 'unavailable');
    } catch {
      setQZStatus('unavailable');
    }
  }, []);

  const handleTestPrint = async () => {
    if (!tenantId) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      await posPrinterService.printTest(tenantId);
      setTestResult({ ok: true, msg: 'Ticket de prueba enviado correctamente.' });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'Error al imprimir.' });
    } finally {
      setTestLoading(false);
    }
  };

  const printerTypes = [
    {
      id: 'browser' as const,
      label: 'Impresora del Navegador',
      description: 'Usa el diálogo de impresión del navegador. Funciona con cualquier impresora.',
      icon: '🌐',
    },
    {
      id: 'qztray' as const,
      label: 'QZ Tray — Impresora Térmica',
      description: 'Impresión directa sin diálogos. Requiere QZ Tray instalado en el equipo.',
      icon: '🖨️',
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
                config.printerType === type.id || (type.id === 'qztray' && config.printerType === 'thermal')
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">{type.icon}</span>
                <div>
                  <p className="font-semibold text-gray-900">{type.label}</p>
                  <p className="text-sm text-gray-500">{type.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* QZ Tray settings */}
      {(config.printerType === 'qztray' || config.printerType === 'thermal') && (
        <div className="border-t border-gray-200 pt-6 space-y-4">

          {/* QZ Tray status */}
          <div className={`rounded-lg p-4 border ${
            qzStatus === 'connected' ? 'bg-green-50 border-green-200' :
            qzStatus === 'unavailable' ? 'bg-red-50 border-red-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {qzStatus === 'connected'
                  ? <Wifi size={16} className="text-green-600" />
                  : <WifiOff size={16} className={qzStatus === 'unavailable' ? 'text-red-500' : 'text-blue-500'} />
                }
                <span className={`font-semibold text-sm ${
                  qzStatus === 'connected' ? 'text-green-800' :
                  qzStatus === 'unavailable' ? 'text-red-800' :
                  'text-blue-800'
                }`}>
                  {qzStatus === 'idle' && 'QZ Tray — sin conectar'}
                  {qzStatus === 'connecting' && 'Conectando a QZ Tray...'}
                  {qzStatus === 'connected' && `QZ Tray conectado (${qzPrinters.length} impresora${qzPrinters.length !== 1 ? 's' : ''})`}
                  {qzStatus === 'unavailable' && 'QZ Tray no disponible'}
                </span>
              </div>
              <button
                onClick={handleDetectQZPrinters}
                disabled={qzStatus === 'connecting'}
                className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
              >
                <RefreshCw size={14} className={qzStatus === 'connecting' ? 'animate-spin' : ''} />
                Detectar
              </button>
            </div>

            {qzStatus === 'unavailable' && (
              <div className="text-sm text-red-700 mt-2">
                <p className="mb-1 font-medium">Para usar impresoras térmicas:</p>
                <ol className="list-decimal ml-4 space-y-0.5">
                  <li>Descarga e instala <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" className="underline font-semibold">QZ Tray</a></li>
                  <li>Inicia el servicio QZ Tray en tu equipo</li>
                  <li>Haz clic en <strong>Detectar</strong></li>
                </ol>
              </div>
            )}
          </div>

          {/* Printer selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Impresora
            </label>
            {qzPrinters.length > 0 ? (
              <select
                value={config.printerName ?? ''}
                onChange={e => setConfig({ ...config, printerName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">— Predeterminada del sistema —</option>
                {qzPrinters.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={config.printerName ?? ''}
                onChange={e => setConfig({ ...config, printerName: e.target.value })}
                placeholder="Nombre de la impresora (opcional)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            )}
            <p className="text-xs text-gray-500 mt-1">
              Deja en blanco para usar la impresora predeterminada del sistema.
            </p>
          </div>
        </div>
      )}

      {/* Browser print info */}
      {config.printerType === 'browser' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          <strong>Nota:</strong> Al imprimir se abrirá el diálogo de impresión del navegador.
          Puedes seleccionar cualquier impresora disponible en tu equipo, incluyendo impresoras PDF y térmicas.
        </div>
      )}

      {/* Auto-print */}
      <div className="border-t border-gray-200 pt-6">
        <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
          <div>
            <p className="font-semibold text-gray-900">Impresión Automática</p>
            <p className="text-sm text-gray-500">Imprimir automáticamente después de cada venta</p>
          </div>
          <input
            type="checkbox"
            checked={config.autoprint}
            onChange={e => setConfig({ ...config, autoprint: e.target.checked })}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </label>
      </div>

      {/* Test print */}
      <div className="border-t border-gray-200 pt-6">
        <button
          onClick={handleTestPrint}
          disabled={testLoading || !tenantId}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
        >
          <Printer size={20} className={testLoading ? 'animate-pulse' : ''} />
          {testLoading ? 'Enviando ticket de prueba...' : 'Imprimir Ticket de Prueba'}
        </button>

        {testResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm font-medium ${
            testResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {testResult.ok ? '✓ ' : '✕ '}{testResult.msg}
          </div>
        )}

        <p className="text-xs text-gray-500 mt-2 text-center">
          Envía un recibo de ejemplo a la impresora configurada
        </p>
      </div>
    </div>
  );
};
