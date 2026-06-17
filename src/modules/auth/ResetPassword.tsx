import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Página de restablecimiento de contraseña. El cliente llega acá desde el link
 * del correo de Supabase (`.../auth/reset-password#access_token=...&type=recovery`).
 * Con `detectSessionInUrl: true`, supabase-js establece una sesión de recuperación
 * al cargar; entonces el usuario puede definir su nueva contraseña.
 */
export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);     // hay sesión de recuperación válida
  const [checking, setChecking] = useState(true);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    // El evento PASSWORD_RECOVERY se dispara cuando se detecta el token del link.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && active) { setReady(true); setChecking(false); }
    });
    // Por si la sesión ya quedó establecida antes de montar el listener.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setReady(true);
      setChecking(false);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pwd.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (pwd !== pwd2)   { setError('Las contraseñas no coinciden'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setDone(true);
      await supabase.auth.signOut();
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center"><Lock size={20} className="text-white" /></div>
          <div>
            <h1 className="text-lg font-black text-gray-900">Nueva contraseña</h1>
            <p className="text-xs text-gray-400">Definí tu nueva contraseña de acceso</p>
          </div>
        </div>

        {checking ? (
          <p className="text-sm text-gray-500 text-center py-6">Validando enlace…</p>
        ) : done ? (
          <div className="text-center py-6">
            <CheckCircle size={40} className="text-emerald-500 mx-auto mb-3" />
            <p className="font-bold text-gray-900">¡Contraseña actualizada!</p>
            <p className="text-sm text-gray-500 mt-1">Te llevamos al inicio de sesión…</p>
          </div>
        ) : !ready ? (
          <div className="text-center py-6">
            <AlertCircle size={40} className="text-amber-500 mx-auto mb-3" />
            <p className="font-bold text-gray-900">Enlace inválido o vencido</p>
            <p className="text-sm text-gray-500 mt-1">Pedí un nuevo correo de cambio de contraseña.</p>
            <button onClick={() => navigate('/login')} className="mt-4 text-sm font-bold text-blue-600 hover:underline">Ir al inicio</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle size={15} /> {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Nueva contraseña</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)}
                  placeholder="Mínimo 6 caracteres" autoFocus
                  className="w-full pr-10 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Repetir contraseña</label>
              <input type={show ? 'text' : 'password'} value={pwd2} onChange={e => setPwd2(e.target.value)}
                placeholder="Repetí la contraseña"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <button type="submit" disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 rounded-xl text-sm transition">
              {saving ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
