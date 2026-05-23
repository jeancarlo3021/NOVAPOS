import React, { useState, useEffect } from 'react';
import { X, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { displayService } from '@/services/pos/displayService';
import { eyabDisplayService } from '@/services/pos/eyabDisplayService';
import { integratedDisplayService } from '@/services/pos/integratedDisplayService';

interface DisplayTestModalProps {
  onClose: () => void;
}

export const DisplayTestModal: React.FC<DisplayTestModalProps> = ({ onClose }) => {
  const [testMessage, setTestMessage] = useState('');
  const [isConnected, setIsConnected] = useState(displayService.getIsConnected());
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'test' | 'diagnostics'>('test');
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [systemInfo, setSystemInfo] = useState<any>(null);

  useEffect(() => {
    const loadDiagnostics = async () => {
      const diag = await integratedDisplayService.runDiagnostics();
      setDiagnostics(diag);
      setSystemInfo(integratedDisplayService.getSystemInfo());
    };
    loadDiagnostics();
  }, []);

  const handleConnectEyab = async () => {
    setStatus('testing');
    try {
      const connected = await eyabDisplayService.connect();
      if (connected) {
        setIsConnected(true);
        setStatus('success');
        setStatusMessage('✓ Conectado a display Eyab');
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('error');
        setStatusMessage('✗ No se pudo conectar a Eyab');
      }
    } catch (err) {
      setStatus('error');
      setStatusMessage('✗ Error conectando a Eyab');
    }
  };

  const handleConnect = async () => {
    setStatus('testing');
    try {
      await displayService.initialize({ type: 'usb' });
      setIsConnected(true);
      setStatus('success');
      setStatusMessage('✓ Conectado por USB');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      try {
        await displayService.initialize({ type: 'serial' });
        setIsConnected(true);
        setStatus('success');
        setStatusMessage('✓ Conectado por puerto serie');
        setTimeout(() => setStatus('idle'), 2000);
      } catch {
        setStatus('error');
        setStatusMessage('✗ No se pudo conectar al display');
      }
    }
  };

  const handleShowTotal = async () => {
    setStatus('testing');
    try {
      await displayService.showTotal(12500);
      setStatus('success');
      setStatusMessage('✓ Total mostrado: ₡12500');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setStatusMessage('✗ Error al mostrar total');
    }
  };

  const handleShowMessage = async () => {
    setStatus('testing');
    try {
      await displayService.showMessage(testMessage || 'PRUEBA');
      setStatus('success');
      setStatusMessage(`✓ Mensaje mostrado: "${testMessage || 'PRUEBA'}"`);
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setStatusMessage('✗ Error al mostrar mensaje');
    }
  };

  const handleClear = async () => {
    setStatus('testing');
    try {
      await displayService.clear();
      setStatus('success');
      setStatusMessage('✓ Display limpiado');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setStatusMessage('✗ Error al limpiar');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Zap size={24} className="text-amber-500" />
            Prueba de Display
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 px-6 pt-4">
          <button
            onClick={() => setActiveTab('test')}
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              activeTab === 'test'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Pruebas
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              activeTab === 'diagnostics'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Diagnóstico
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'test' && (
            <div className="space-y-4">
              {/* Status */}
              <div className={`p-4 rounded-lg border-2 ${
                isConnected
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <p className={`font-bold flex items-center gap-2 ${
                  isConnected ? 'text-green-700' : 'text-red-700'
                }`}>
                  {isConnected ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  {isConnected ? 'Display conectado' : 'Display desconectado'}
                </p>
              </div>

              {/* Message input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mensaje personalizado (máx 16 caracteres)
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-gray-900 font-mono"
                />
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={handleConnectEyab}
                  disabled={status === 'testing'}
                  className="px-4 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition text-sm"
                  title="Para máquinas Eyab POS integradas"
                >
                  🔗 Eyab
                </button>
                <button
                  onClick={handleConnect}
                  disabled={status === 'testing'}
                  className="px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition text-sm"
                >
                  🔌 USB/Serie
                </button>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleShowTotal}
                  disabled={!isConnected || status === 'testing'}
                  className="px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition"
                >
                  Mostrar Total
                </button>
                <button
                  onClick={handleShowMessage}
                  disabled={!isConnected || status === 'testing'}
                  className="px-4 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition"
                >
                  Mostrar Mensaje
                </button>
                <button
                  onClick={handleClear}
                  disabled={!isConnected || status === 'testing'}
                  className="px-4 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition"
                >
                  Limpiar
                </button>
              </div>

              {/* Status message */}
              {statusMessage && (
                <div className={`p-3 rounded-lg text-center font-semibold ${
                  status === 'success'
                    ? 'bg-green-50 text-green-700'
                    : status === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-blue-50 text-blue-700'
                }`}>
                  {statusMessage}
                </div>
              )}

              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-900">
                <p className="font-semibold mb-2">ℹ️ Cómo funciona:</p>
                <ul className="space-y-1 text-xs">
                  <li>✓ El display se conecta automáticamente al cargar el POS</li>
                  <li>✓ Muestra el total (ej: 25.50) cada vez que cambias el carrito</li>
                  <li>✓ Si tienes Eyab, presiona el botón "Eyab" arriba</li>
                  <li>✓ Muestra "0.00" cuando el carrito está vacío</li>
                  <li>✓ Muestra "OFFLINE" si no hay conexión a internet</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              {/* System Info */}
              {systemInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="font-semibold text-blue-900 mb-3">ℹ️ Información del Sistema</p>
                  <div className="space-y-2 text-sm font-mono text-blue-800">
                    <div>SO: <span className="font-bold">{systemInfo.isWindows ? 'Windows' : systemInfo.isLinux ? 'Linux' : systemInfo.isMac ? 'macOS' : 'Desconocido'}</span></div>
                    <div>API Serial: <span className={systemInfo.supportsSerial ? 'text-green-600 font-bold' : 'text-red-600'}>
                      {systemInfo.supportsSerial ? '✓ Disponible' : '✗ No disponible'}
                    </span></div>
                    <div>API USB HID: <span className={systemInfo.supportsHID ? 'text-green-600 font-bold' : 'text-red-600'}>
                      {systemInfo.supportsHID ? '✓ Disponible' : '✗ No disponible'}
                    </span></div>
                    <div>Electron: <span className={systemInfo.hasElectron ? 'text-green-600 font-bold' : 'text-red-600'}>
                      {systemInfo.hasElectron ? '✓ Disponible' : '✗ No disponible'}
                    </span></div>
                  </div>
                </div>
              )}

              {/* Diagnostics Result */}
              {diagnostics && (
                <div className={`border rounded-lg p-4 ${
                  diagnostics.method === 'detected'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <p className={`font-semibold mb-3 ${
                    diagnostics.method === 'detected'
                      ? 'text-green-900'
                      : 'text-amber-900'
                  }`}>
                    {diagnostics.method === 'detected' ? '✓ Métodos detectados:' : '⚠️ No se detectaron métodos'}
                  </p>

                  {diagnostics.detectedMethods.length > 0 && (
                    <ul className="space-y-2 mb-3">
                      {diagnostics.detectedMethods.map((method: string, idx: number) => (
                        <li key={idx} className={`text-sm flex items-center gap-2 ${
                          diagnostics.method === 'detected' ? 'text-green-800' : 'text-amber-800'
                        }`}>
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          {method}
                        </li>
                      ))}
                    </ul>
                  )}

                  {diagnostics.errors.length > 0 && (
                    <div className="text-xs text-gray-600 bg-white/50 p-2 rounded border border-gray-200">
                      <p className="font-semibold mb-1">Intentos fallidos:</p>
                      {diagnostics.errors.map((err: string, idx: number) => (
                        <div key={idx} className="text-gray-600">• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Help section for Eyab */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-semibold text-green-900 mb-3">🎯 Solución para Eyab</p>
                <ul className="space-y-2 text-sm text-green-900">
                  <li>✓ Tu máquina es <strong>Eyab</strong></li>
                  <li>✓ El display está integrado en la máquina</li>
                  <li>✓ Ve a la pestaña "Pruebas" y presiona el botón <strong>"Eyab"</strong></li>
                  <li>✓ Si conecta exitosamente, verás: ✓ Conectado a display Eyab</li>
                  <li>✓ El display se sincronizará automáticamente</li>
                  <li>✓ Cuando abras POS y agregues productos, verá el total (ej: 25.50)</li>
                </ul>
              </div>

              {/* Troubleshooting */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="font-semibold text-amber-900 mb-3">❌ Si no funciona...</p>
                <ul className="space-y-2 text-sm text-amber-900">
                  <li>1️⃣ Recarga la página completa (Ctrl + F5)</li>
                  <li>2️⃣ Presiona Ctrl + D de nuevo</li>
                  <li>3️⃣ Intenta el botón "Eyab" varias veces</li>
                  <li>4️⃣ Reinicia la máquina si sigue sin funcionar</li>
                  <li>5️⃣ Abre el carrito e intenta agregar un producto</li>
                  <li>6️⃣ Verifica que el display muestre el total automáticamente</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
