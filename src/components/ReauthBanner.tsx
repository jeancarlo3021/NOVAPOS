import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { KeyRound, Loader2 } from 'lucide-react';

/**
 * Aviso para volver a autenticarse cuando la sesión se abrió SIN internet y la
 * conexión ya volvió.
 *
 * Lo normal es que ni aparezca: si la pestaña siguió abierta, la contraseña quedó
 * en memoria y la sesión se convierte sola en una real. Solo se muestra cuando la
 * app se recargó (se perdió esa memoria) o la contraseña cambió en el servidor.
 *
 * NO expulsa al usuario ni bloquea la pantalla: el POS sigue operando con la cola
 * offline mientras tanto. Solo avisa que, hasta confirmar, lo nuevo no sube.
 */
export const ReauthBanner: React.FC = () => {
  const { needsReauth, reauthenticate, user } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!needsReauth) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true); setErr('');
    try {
      const ok = await reauthenticate(password);
      if (ok) setPassword('');
      else setErr('La contraseña no coincide. Probá de nuevo.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo reconectar la sesión');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(94vw,32rem)] print:hidden">
      <form
        onSubmit={submit}
        className="rounded-2xl border-2 border-amber-300 bg-amber-50 shadow-2xl px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
            <KeyRound size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-amber-900 leading-tight">
              Volvió el internet — confirmá tu contraseña
            </p>
            <p className="text-[11px] text-amber-800/80 mt-0.5">
              Entraste sin conexión. Para que las ventas suban al servidor hace falta
              reconectar la sesión de <b>{user?.email ?? 'tu usuario'}</b>.
              Mientras tanto podés seguir vendiendo: todo queda guardado.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErr(''); }}
                placeholder="Contraseña"
                autoComplete="current-password"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm font-semibold outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={busy || !password.trim()}
                className="shrink-0 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-black disabled:opacity-60 flex items-center gap-1.5"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? 'Conectando…' : 'Reconectar'}
              </button>
            </div>
            {err && <p className="text-[11px] font-bold text-red-600 mt-1.5">{err}</p>}
          </div>
        </div>
      </form>
    </div>
  );
};

export default ReauthBanner;
