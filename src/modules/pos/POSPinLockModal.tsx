import { useEffect, useRef, useState } from 'react';
import { Lock, X, Delete } from 'lucide-react';
import { usersService } from '@/services/users/usersService';

interface Props {
  /** True = bloquea el POS hasta validar PIN; false = modal cancelable */
  forced?: boolean;
  onSuccess: (cashier: { id: string; full_name: string; role: string }) => void;
  onClose?: () => void;
}

/**
 * Modal de cambio rápido de cajero en el POS (kiosk mode).
 * Pide PIN numérico y valida contra /users/pin-login. Si está en modo `forced`
 * (ej. POS recién abierto), no se puede cerrar sin un PIN válido.
 */
export function POSPinLockModal({ forced = false, onSuccess, onClose }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async (value: string) => {
    if (value.length < 3 || loading) return;
    setLoading(true); setError('');
    try {
      const cashier = await usersService.pinLogin(value);
      onSuccess(cashier);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN incorrecto');
      setPin('');
      inputRef.current?.focus();
    } finally { setLoading(false); }
  };

  const press = (k: string) => {
    if (k === 'back') { setPin(p => p.slice(0, -1)); return; }
    if (k === 'clear') { setPin(''); return; }
    if (pin.length >= 8) return;
    const next = pin + k;
    setPin(next);
    if (next.length >= 4) submit(next);  // auto-submit a los 4 dígitos
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="text-emerald-600" size={22} />
            <h2 className="text-xl font-black text-gray-900">
              {forced ? 'Identificate' : 'Cambiar cajero'}
            </h2>
          </div>
          {!forced && onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          )}
        </div>

        <p className="text-sm text-gray-500 mb-4 text-center">
          Ingresá tu PIN de cajero (4–8 dígitos)
        </p>

        {/* Display del PIN como dots */}
        <div className="flex justify-center gap-2 mb-4 h-10 items-center">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition ${
                i < pin.length ? 'bg-emerald-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 mb-3 text-center">
            {error}
          </div>
        )}

        {/* Input oculto para teclado físico */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="off"
          value={pin}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 8);
            setPin(v);
            if (v.length >= 4) submit(v);
          }}
          className="sr-only"
        />

        {/* Teclado numérico táctil */}
        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9'].map(k => (
            <button key={k} type="button" onClick={() => press(k)}
              disabled={loading}
              className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-2xl font-black text-gray-800 transition disabled:opacity-50"
            >{k}</button>
          ))}
          <button type="button" onClick={() => press('clear')}
            disabled={loading}
            className="h-14 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-bold transition disabled:opacity-50"
          >Limpiar</button>
          <button type="button" onClick={() => press('0')}
            disabled={loading}
            className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-2xl font-black text-gray-800 transition disabled:opacity-50"
          >0</button>
          <button type="button" onClick={() => press('back')}
            disabled={loading}
            className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center text-gray-600 transition disabled:opacity-50"
            title="Borrar"
          ><Delete size={18} /></button>
        </div>

        {loading && (
          <p className="text-xs text-gray-400 text-center mt-3">Validando…</p>
        )}
      </div>
    </div>
  );
}

export default POSPinLockModal;
