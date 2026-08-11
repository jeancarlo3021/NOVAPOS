'use client';

import React, { useEffect, useState } from 'react';
import { Lock, AlertCircle, X, Percent } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * Autorización de un descuento por encima del tope del negocio.
 *
 * Antes, pasarse del tope se recortaba en silencio: el cajero escribía 30 % y el
 * campo mostraba 15 sin explicar nada, y el supervisor no tenía forma de aprobar
 * una excepción legítima —que igual iba a terminar pasando, pero por fuera del
 * sistema y sin quedar registrada—.
 *
 * Usa el MISMO PIN de Ajustes → General que ya protege las anulaciones: si el
 * negocio ya decidió quién autoriza, no tiene por qué configurarlo dos veces.
 * Sin PIN configurado no se bloquea nada; se avisa y se deja pasar, porque
 * inventar una traba nueva en la caja de alguien que nunca la pidió es peor que
 * el descuento.
 */
interface Props {
  /** Porcentaje solicitado (mayor al tope). */
  pct: number;
  /** Tope configurado del negocio. */
  cap: number;
  onCancel: () => void;
  /** Autorizado: aplicar el porcentaje solicitado. */
  onAuthorize: () => void;
}

export const DiscountAuthModal: React.FC<Props> = ({ pct, cap, onCancel, onAuthorize }) => {
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch<any>('/settings/general')
      .then(s => { if (alive) setStoredPin(s?.void_pin ?? s?.voidPin ?? ''); })
      .catch(() => { if (alive) setStoredPin(''); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const submit = () => {
    if (storedPin && pin !== storedPin) { setError('PIN incorrecto'); setPin(''); return; }
    onAuthorize();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-black text-gray-900 flex items-center gap-2">
            <Percent size={17} className="text-amber-600" /> Autorizar descuento
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4" onKeyDown={e => { if (e.key === 'Enter') submit(); }}>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-amber-900 text-sm">
              Estás aplicando <b>{pct}%</b> y el tope de la caja es <b>{cap}%</b>.
            </p>
            <p className="text-amber-700 text-xs mt-1">
              Queda registrado en la venta con el descuento aplicado.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Verificando…</p>
          ) : storedPin ? (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <Lock size={14} /> PIN de supervisor
              </label>
              <input
                type="password" inputMode="numeric" maxLength={8} autoFocus
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="••••"
                className={`w-full text-center text-2xl tracking-[0.4em] font-mono px-4 py-3 border-2 rounded-xl outline-none ${
                  error ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-amber-500'
                }`}
              />
              {error && (
                <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-gray-700 text-xs">
                No hay PIN configurado, así que el descuento se aplica sin autorización.
                Podés poner uno en <b>Configuración → General</b> para exigirlo.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 font-bold text-sm text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={submit} disabled={loading || (!!storedPin && pin.length === 0)}
              className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm">
              Aplicar {pct}%
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscountAuthModal;
