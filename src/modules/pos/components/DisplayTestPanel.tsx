import React, { useState } from 'react';
import { X, Monitor, MonitorOff, Send, RotateCcw, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { useDisplay } from '@/context/CustomerDisplayContext';

interface DisplayTestPanelProps {
  onClose: () => void;
}

const QUICK_TESTS = [
  { id: 'welcome',  line1: 'Bienvenido',         line2: 'Pase adelante',     emoji: '👋' },
  { id: 'total',    line1: 'Total a pagar',      line2: 'C 12,500.00',       emoji: '💰' },
  { id: 'thanks',   line1: 'Gracias por',        line2: 'su compra!',        emoji: '🙏' },
  { id: 'product',  line1: 'Coca-Cola 600ml',    line2: 'C 1,500.00',        emoji: '🥤' },
  { id: 'card',     line1: 'Inserte tarjeta',    line2: 'por favor',         emoji: '💳' },
  { id: 'change',   line1: 'Su vuelto:',         line2: 'C 2,500.00',        emoji: '💸' },
];

export const DisplayTestPanel: React.FC<DisplayTestPanelProps> = ({ onClose }) => {
  const { isConnected, error, connect, disconnect, updateDisplay } = useDisplay();
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'sending' | 'success' | 'error'; msg?: string }>({ type: 'idle' });

  const sendTest = async (l1: string, l2: string) => {
    if (!isConnected) {
      setStatus({ type: 'error', msg: 'Conecta el LCD primero' });
      return;
    }
    setStatus({ type: 'sending' });
    try {
      await updateDisplay(l1, l2);
      setStatus({ type: 'success', msg: `Enviado: "${l1.trim()}" / "${l2.trim()}"` });
      setTimeout(() => setStatus({ type: 'idle' }), 2000);
    } catch (err) {
      setStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Error al enviar al display',
      });
    }
  };

  const handleSendCustom = () => {
    if (!line1.trim() && !line2.trim()) {
      setStatus({ type: 'error', msg: 'Escribe algo en al menos una línea' });
      return;
    }
    sendTest(line1, line2);
  };

  const handleClear = () => sendTest('', '');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Monitor size={22} />
            </div>
            <div>
              <h3 className="font-black text-lg leading-tight">Pruebas del LCD</h3>
              <p className="text-blue-100 text-xs">Display del cliente</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Estado de conexión */}
          <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 ${
            isConnected
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-amber-50 border-amber-300'
          }`}>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <div>
                    <p className="text-emerald-800 font-bold text-sm">Conectado</p>
                    <p className="text-emerald-600 text-xs">LCD listo para recibir datos</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={20} className="text-amber-600" />
                  <div>
                    <p className="text-amber-800 font-bold text-sm">Desconectado</p>
                    <p className="text-amber-600 text-xs">Haz click en "Conectar" para iniciar</p>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={isConnected ? disconnect : connect}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                isConnected
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {isConnected ? (
                <span className="flex items-center gap-1.5"><MonitorOff size={15} /> Desconectar</span>
              ) : (
                <span className="flex items-center gap-1.5"><Monitor size={15} /> Conectar</span>
              )}
            </button>
          </div>

          {/* Error del context */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Status de operación */}
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

          {/* Pruebas rápidas */}
          <div>
            <p className="text-gray-700 text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap size={12} /> Pruebas rápidas
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_TESTS.map(test => (
                <button
                  key={test.id}
                  onClick={() => sendTest(test.line1, test.line2)}
                  disabled={!isConnected || status.type === 'sending'}
                  className="text-left p-2.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{test.emoji}</span>
                    <span className="text-xs text-gray-500 group-hover:text-blue-600 font-semibold">Probar</span>
                  </div>
                  <p className="text-xs font-mono text-gray-900 leading-tight">{test.line1}</p>
                  <p className="text-xs font-mono text-gray-600 leading-tight">{test.line2}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Personalizado */}
          <div className="border-t border-gray-200 pt-4">
            <p className="text-gray-700 text-xs font-black uppercase tracking-wider mb-2">
              Mensaje personalizado
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 font-semibold flex items-center justify-between mb-1">
                  <span>Línea 1 (20 caracteres)</span>
                  <span className={line1.length > 20 ? 'text-red-500' : 'text-gray-400'}>
                    {line1.length}/20
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={line1}
                  onChange={e => setLine1(e.target.value)}
                  placeholder="Ej: Bienvenido"
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-semibold flex items-center justify-between mb-1">
                  <span>Línea 2 (20 caracteres)</span>
                  <span className={line2.length > 20 ? 'text-red-500' : 'text-gray-400'}>
                    {line2.length}/20
                  </span>
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={line2}
                  onChange={e => setLine2(e.target.value)}
                  placeholder="Ej: C 0.00"
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="mt-3 bg-gray-900 border-4 border-gray-800 rounded-lg p-3 font-mono shadow-inner">
              <div className="bg-amber-300 px-3 py-2 rounded text-gray-900 text-sm leading-tight">
                <div className="border-b border-gray-900/20 pb-0.5">
                  {(line1 || ' ').padEnd(20).substring(0, 20).replace(/ /g, ' ')}
                </div>
                <div>
                  {(line2 || ' ').padEnd(20).substring(0, 20).replace(/ /g, ' ')}
                </div>
              </div>
              <p className="text-gray-400 text-[10px] text-center mt-1.5">Vista previa del LCD</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={handleClear}
                disabled={!isConnected || status.type === 'sending'}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-bold text-sm rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} /> Limpiar
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
            <p className="font-bold mb-1">💡 Cómo funciona</p>
            <ul className="space-y-0.5 text-blue-800">
              <li>• El LCD muestra 2 líneas de 20 caracteres cada una</li>
              <li>• Espacios se rellenan automáticamente</li>
              <li>• Caracteres especiales como ¢ pueden no mostrarse bien</li>
              <li>• Usa "C" o "$" en lugar del símbolo de moneda</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
