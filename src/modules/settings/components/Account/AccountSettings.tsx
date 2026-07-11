'use client';

import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Check, RefreshCw, ShieldCheck, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usersService } from '@/services/users/usersService';

/**
 * Cambio de contraseña del propietario (self-service). Verifica la contraseña
 * actual con signInWithPassword y luego actualiza con auth.updateUser.
 * El tab que lo monta ya restringe la visibilidad al rol 'owner'.
 */
export const AccountSettings: React.FC = () => {
  const { user, updateAlias } = useAuth();
  // ── Alias del propietario ("Atendido por:" en el ticket) ──────────────────
  const [alias, setAlias] = useState(user?.ticket_alias ?? '');
  const [savingAlias, setSavingAlias] = useState(false);
  const [aliasOk, setAliasOk] = useState(false);
  const [aliasErr, setAliasErr] = useState('');

  const saveAlias = async () => {
    if (!user?.id) { setAliasErr('No se pudo determinar tu usuario'); return; }
    setSavingAlias(true); setAliasErr(''); setAliasOk(false);
    try {
      const clean = alias.trim().slice(0, 60);
      await usersService.updateUser(user.id, { ticket_alias: clean });
      updateAlias(clean);
      setAliasOk(true); setTimeout(() => setAliasOk(false), 2000);
    } catch (err) {
      setAliasErr(err instanceof Error ? err.message : 'No se pudo guardar el alias');
    } finally { setSavingAlias(false); }
  };

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setOk(false);

    if (!current) { setError('Ingresá tu contraseña actual'); return; }
    if (next.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres'); return; }
    if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) {
      setError('La nueva contraseña debe combinar letras y números'); return;
    }
    if (next !== confirm) { setError('La confirmación no coincide'); return; }
    if (next === current) { setError('La nueva contraseña debe ser distinta a la actual'); return; }
    if (!user?.email) { setError('No se pudo determinar tu usuario'); return; }

    setSaving(true);
    try {
      // 1) Verificar la contraseña actual re-autenticando.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: current,
      });
      if (signInErr) { setError('La contraseña actual es incorrecta'); return; }

      // 2) Actualizar a la nueva contraseña.
      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) { setError(updErr.message || 'No se pudo actualizar la contraseña'); return; }

      setOk(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-2">
        <ShieldCheck size={22} className="text-blue-600" />
        <div>
          <h2 className="text-xl font-black text-gray-900">Cuenta y seguridad</h2>
          <p className="text-sm text-gray-500">Cambiá la contraseña de tu cuenta de propietario.</p>
        </div>
      </div>

      {/* Alias del propietario para el ticket */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Tag size={18} className="text-fuchsia-600" />
          <div>
            <h3 className="font-black text-gray-900 text-sm">Alias para el ticket</h3>
            <p className="text-xs text-gray-500">Aparece como «Atendido por: {alias.trim() || '…'}» en el ticket y reportes.</p>
          </div>
        </div>
        {aliasErr && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{aliasErr}</div>}
        {aliasOk && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2"><Check size={15} /> Alias guardado.</div>}
        <div className="flex gap-2">
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value.slice(0, 60))}
            placeholder="Ej. Don José, Caja 1…"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
          />
          <button
            type="button"
            onClick={saveAlias}
            disabled={savingAlias || alias.trim() === (user?.ticket_alias ?? '').trim()}
            className="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-bold disabled:opacity-50 transition flex items-center gap-2 shrink-0"
          >
            {savingAlias ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />} Guardar
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 shadow-sm">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}
        {ok && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
            <Check size={15} /> Contraseña actualizada correctamente.
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Contraseña actual</label>
          <input
            type={show ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nueva contraseña</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 6, con letras y números"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button type="button" onClick={() => setShow(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Confirmar nueva contraseña</label>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-60 transition flex items-center justify-center gap-2"
        >
          {saving ? <><RefreshCw size={15} className="animate-spin" /> Actualizando…</> : <><KeyRound size={15} /> Cambiar contraseña</>}
        </button>
      </form>
    </div>
  );
};

export default AccountSettings;
