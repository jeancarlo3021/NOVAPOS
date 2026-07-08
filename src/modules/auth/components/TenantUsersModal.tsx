'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, UserPlus, RefreshCw, Check, Users2, Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { usernameToEmail, emailToUsername } from '@/services/users/usersService';
import { USER_ROLES, ROLE_META } from '@/types/Types_Users';
import type { UserRole } from '@/types/Types_Users';

interface TenantUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone?: string | null;
  ticket_alias?: string | null;
  created_at?: string;
}

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

// Roles asignables (sin owner).
const ROLES = (Object.keys(USER_ROLES) as UserRole[]).filter(r => r !== 'owner');

export const TenantUsersModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form de alta
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('cajero');
  const [alias, setAlias] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<TenantUser[]>(`/admin/tenants/${owner.id}/users`);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios', 'error');
    } finally { setLoading(false); }
  }, [owner.id, onToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !fullName.trim()) { onToast('Usuario y nombre son requeridos', 'error'); return; }
    if (password.length < 6) { onToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    setSaving(true);
    try {
      await apiFetch(`/admin/tenants/${owner.id}/users`, {
        method: 'POST',
        body: JSON.stringify({
          email: usernameToEmail(username.trim()),
          password, full_name: fullName.trim(), role,
          ticket_alias: alias.trim() || null,
        }),
      });
      onToast('Usuario creado', 'success');
      setUsername(''); setPassword(''); setFullName(''); setAlias(''); setRole('cajero');
      load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo crear el usuario', 'error');
    } finally { setSaving(false); }
  };

  const patchUser = async (u: TenantUser, patch: Partial<TenantUser>) => {
    try {
      await apiFetch(`/admin/tenants/${owner.id}/users/${u.id}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...patch } : x));
      onToast('Usuario actualizado', 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error');
      load();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Users2 size={18} className="text-sky-600" />
            <div>
              <h2 className="text-lg font-black text-gray-900">Usuarios de la empresa</h2>
              <p className="text-xs text-gray-400">{owner.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Alta */}
          <form onSubmit={handleCreate} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus size={13} /> Añadir usuario
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={username} onChange={e => setUsername(e.target.value.trim())} placeholder="Usuario (o correo)"
                autoCapitalize="none" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña (mín. 6)"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nombre completo"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <input value={alias} onChange={e => setAlias(e.target.value)} placeholder="Alias en ticket (opcional)"
                maxLength={60} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white sm:col-span-2">
                {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].emoji} {ROLE_META[r].label}</option>)}
              </select>
            </div>
            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm">
              {saving ? <><RefreshCw size={14} className="animate-spin" /> Creando…</> : <><Check size={14} /> Crear usuario</>}
            </button>
          </form>

          {/* Lista */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Usuarios ({users.length})</p>
            {loading ? (
              <div className="flex justify-center py-8"><RefreshCw size={22} className="animate-spin text-gray-300" /></div>
            ) : users.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Sin usuarios</p>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <UserRow key={u.id} user={u} onSave={patchUser} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Fila editable: nombre, alias y rol.
function UserRow({ user, onSave }: { user: TenantUser; onSave: (u: TenantUser, patch: Partial<TenantUser>) => void }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [alias, setAlias] = useState(user.ticket_alias ?? '');
  const [role, setRole] = useState(user.role);
  const dirty = fullName !== user.full_name || (alias || '') !== (user.ticket_alias ?? '') || role !== user.role;

  return (
    <div className="rounded-xl border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nombre"
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        <input value={alias} onChange={e => setAlias(e.target.value)} placeholder="Alias ticket" maxLength={60}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
        <select value={role} onChange={e => setRole(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
          {ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-mono text-gray-400">{emailToUsername(user.email)}</span>
        <button disabled={!dirty}
          onClick={() => onSave(user, { full_name: fullName.trim(), ticket_alias: alias.trim() || null, role })}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white">
          <Save size={12} /> Guardar
        </button>
      </div>
    </div>
  );
}

export default TenantUsersModal;
