import React, { useState } from 'react';
import { X, Monitor, MonitorOff, Send, RotateCcw, CheckCircle2, AlertCircle, Zap, Radio } from 'lucide-react';
import { useDisplay } from '@/context/CustomerDisplayContext';
import type { BaudRate } from '@/hooks/POS/useCustomerDisplay';

interface DisplayTestPanelProps {
  onClose: () => void;
}

const QUICK_PRICES = [
  { id: 'zero',    amount: 0,        label: '0.00',     emoji: '⚪' },
  { id: 'cheap',   amount: 1.5,      label: '1.50',     emoji: '🥤' },
  { id: 'medium',  amount: 25.99,    label: '25.99',    emoji: '🍔' },
  { id: 'big',     amount: 1500,     label: '1500.00',  emoji: '🛒' },
  { id: 'huge',    amount: 12345.67, label: '12345.67', emoji: '💰' },
  { id: 'max',     amount: 99999.99, label: '99999.99', emoji: '🏆' },
];

const BAUD_RATES: BaudRate[] = [2400, 4800, 9600, 19200];

export const DisplayTestPanel: React.FC<DisplayTestPanelProps> = ({ onClose }) => {
  const { isConnected, error, baudRate, connect, disconnect, updatePrice, setBaudRate } = useDisplay();
  const [customAmount, setCustomAmount] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'sending' | 'success' | 'error'; msg?: string }>({ type: 'idle' });

  const sendPrice = async (amount: number) => {
    if (!isConnected) {
      setStatus({ type: 'error', msg: 'Conecta el LED primero' });
      return;
    }
    setStatus({ type: 'sending' });
    try {
      await updatePrice(amount);
      const formatted = amount.toFixed(2).padStart(8, ' ');
      setStatus({ type: 'success', msg: `Enviado: "${formatted}"` });
      setTimeout(() => setStatus({ type: 'idle' }), 2000);
    } catch (err) {
      setStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Error al enviar al display',
      });
    }
  };

  const handleSendCustom = () => {
    const parsed = parseFloat(customAmount);
    if (!Number.isFinite(parsed)) {
      setStatus({ type: 'error', msg: 'Ingresa un número válido' });
      return;
    }
    sendPrice(parsed);
  };

  const handleClear = () => sendPrice(0);

  const handleConnectWithBaud = async (baud: BaudRate) => {
    if (isConnected) await disconnect();
    setBaudRate(baud);
    await connect(baud);
  };

  const previewValue = customAmount && Number.isFinite(parseFloat(customAmount))
    ? parseFloat(customAmount).toFixed(2).padStart(8, ' ')
    : '    0.00';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Monitor size={22} />
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight">Pruebas del LED</h3>
              <p className="text-blue-100 text-xs">Display numérico del cliente · Ctrl+I</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Estado de conexión */}
          <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 ${
            isConnected ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'
          }`}>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <div>
                    <p className="text-emerald-800 font-bold text-sm">Conectado @ {baudRate} baud</p>
                    <p className="text-emerald-600 text-xs">LED listo para recibir números</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={20} className="text-amber-600" />
                  <div>
                    <p className="text-amber-800 font-bold text-sm">Desconectado</p>
                    <p className="text-amber-600 text-xs">Elige un baud rate y conecta</p>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={isConnected ? disconnect : () => connect()}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                isConnected ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isConnected ? (
                <span className="flex items-center gap-1.5"><MonitorOff size={15} /> Desconectar</span>
              ) : (
                <span className="flex items-center gap-1.5"><Monitor size={15} /> Conectar</span>
              )}
            </button>
          </div>

          {/* Selector de Baud Rate */}
          <div>
            <p className="text-gray-700 text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Radio size={12} /> Velocidad (Baud Rate)
            </p>
            <div className="grid grid-cols-4 gap-2">
              {BAUD_RATES.map(rate => (
                <button
                  key={rate}
                  onClick={() => handleConnectWithBaud(rate)}
                  className={`px-2 py-2.5 rounded-lg border-2 font-bold text-sm transition active:scale-95 ${
                    baudRate === rate
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                  }`}
                  title={
                    rate === 2400 ? 'Estándar Eyab / DSP800' :
                    rate === 4800 ? 'Alternativa común' :
                    rate === 9600 ? 'LCDs modernos' :
                                    'Pantallas rápidas'
                  }
                >
                  {rate}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              💡 Tu Eyab usa típicamente <strong>2400</strong>. Si no funciona, prueba <strong>4800</strong> o <strong>9600</strong>.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Status */}
          {status.type !== 'idle' && status.msg && (
            <div className={`text-sm p-3 rounded-lg font-semibold ${
              status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              status.type === 'error'   ? 'bg-red-50 text-red-700 border border-red-200' :
                                          'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {status.type === 'success' && '✓ '}
              {status.type === 'error' && '✗ '}
              {status.msg}
            </div>
          )}

          {/* Precios rápidos */}
          <div>
            <p className="text-gray-700 text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap size={12} /> Precios de prueba
            </p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_PRICES.map(test => (
                <button
                  key={test.id}
                  onClick={() => sendPrice(test.amount)}
                  disabled={!isConnected || status.type === 'sending'}
                  className="p-2.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition group"
                >
                  <div className="text-center text-base mb-0.5">{test.emoji}</div>
                  <p className="text-xs font-mono font-bold text-gray-900 text-center">{test.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Precio personalizado */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-gray-700 text-xs font-black uppercase tracking-wider mb-2">
              Precio personalizado
            </p>
            <input
              type="number"
              step="0.01"
              min="0"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-lg font-mono focus:outline-none focus:border-blue-400 text-right"
            />

            {/* Preview del LED */}
            <div className="mt-3 bg-gray-900 border-4 border-gray-800 rounded-lg p-4 shadow-inner">
              <div className="bg-red-900/90 px-3 py-2 rounded text-right">
                <div
                  className="text-red-400 font-mono font-bold text-3xl tracking-widest"
                  style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.6)' }}
                >
                  {previewValue}
                </div>
              </div>
              <p className="text-gray-400 text-[10px] text-center mt-1.5">
                Vista previa LED · 8 dígitos
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={handleClear}
                disabled={!isConnected || status.type === 'sending'}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-bold text-sm rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} /> Mostrar 0.00
              </button>
              <button
                onClick={handleSendCustom}
                disabled={!isConnected || status.type === 'sending'}
                className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <Send size={14} /> Enviar
              </button>
            </div>
          </div>

          {/* Ayuda */}
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900">
            <p className="font-bold mb-1">💡 Cómo funciona el LED numérico</p>
            <ul className="space-y-0.5 text-blue-800">
              <li>• Display de 8 dígitos numéricos (formato 99999.99)</li>
              <li>• Protocolo DSP800 / CD5220 con comando ESC @ (0x1B, 0x40)</li>
              <li>• Tu Eyab Jwk usa típicamente <strong>2400 baud</strong></li>
              <li>• Si la primera vez no funciona, prueba otros baud rates arriba</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
