import React, { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { displayService } from '@/services/pos/displayService';

interface DisplayTestModalProps {
  onClose: () => void;
}

export const DisplayTestModal: React.FC<DisplayTestModalProps> = ({ onClose }) => {
  const [testMessage, setTestMessage] = useState('');
  const [isConnected, setIsConnected] = useState(displayService.getIsConnected());
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

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
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
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

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Status */}
          <div className={`p-4 rounded-lg border-2 ${
            isConnected
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <p className={`font-bold ${
              isConnected ? 'text-green-700' : 'text-red-700'
            }`}>
              {isConnected ? '✓ Display conectado' : '✗ Display desconectado'}
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
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleConnect}
              disabled={status === 'testing'}
              className="px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition"
            >
              {isConnected ? 'Reconectar' : 'Conectar'}
            </button>
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
          <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600">
            <p className="font-semibold mb-2">Cómo funciona:</p>
            <ul className="space-y-1 text-xs">
              <li>• El display se conecta automáticamente al cargar el POS</li>
              <li>• Muestra el total cada vez que agregas/quitas productos</li>
              <li>• Puedes hacer pruebas aquí para verificar la conexión</li>
              <li>• Soporta USB y puerto serie</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
