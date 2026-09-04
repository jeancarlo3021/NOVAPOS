'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, UserPlus, RefreshCw, Check, Users2, Save, Shield } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { usernameToEmail, emailToUsername } from '@/services/users/usersService';
import { USER_ROLES, ROLE_META } from '@/types/Types_Users';
import type { UserRole } from '@/types/Types_Users';
import { TenantRolePermissionsModal } from './TenantRolePermissionsModal';

interface TenantUser {
  id: string;
  full_name: string;
  email: string;
  /** El dueño del negocio: se muestra pero no se puede borrar ni degradar. */
  is_owner?: boolean;
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
  /** Nombre del negocio, editable desde acá. */
  const [nombreNegocio, setNombreNegocio] = useState(owner.name ?? '');
  /** Editor de permisos por rol de ESTA empresa (sin salir del panel). */
  const [showRoles, setShowRoles] = useState(false);
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

  /**
   * Pasa el negocio a otro usuario.
   *
   * Es lo correcto cuando el negocio lo creó el vendedor con su propia cuenta:
   * se traspasa el NEGOCIO, no la identidad. Cambiarle el correo al vendedor
   * afectaría a todos los negocios que haya creado con ese mismo usuario.
   */
  const hacerDueño = async (u: TenantUser) => {
    const ok = window.confirm(
      `¿Pasar «${owner.name}» a ${u.full_name || u.email}?\n\n`
      + 'Queda como dueño del negocio. El dueño anterior conserva su usuario y su acceso: '
      + 'si ya no debe entrar, hay que quitarlo aparte.',
    );
    if (!ok) return;
    try {
      const r = await apiFetch<any>(`/admin/tenants/${owner.id}/transfer-owner`, {
        method: 'POST', body: JSON.stringify({ user_id: u.id }),
      });
      onToast(`Ahora el dueño es ${r?.nuevo_dueño ?? u.email}. ${r?.aviso ?? ''}`, 'success');
      load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo traspasar', 'error');
    }
  };

  /**
   * Saca a una persona de ESTE negocio.
   *
   * No borra su cuenta si tiene otros negocios: el mismo usuario puede estar en
   * varios, y borrarlo lo dejaría sin acceso a todos de una.
   */
  const quitarUsuario = async (u: TenantUser) => {
    const ok = window.confirm(
      `¿Quitar a ${u.full_name || u.email} de «${owner.name}»?\n\n`
      + 'Deja de tener acceso a este negocio. Si trabaja en otros, su cuenta sigue activa.',
    );
    if (!ok) return;
    try {
      const r = await apiFetch<any>(`/admin/tenants/${owner.id}/users/${u.id}`, { method: 'DELETE' });
      onToast(r?.aviso ?? 'Usuario quitado', 'success');
      load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo quitar', 'error');
    }
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
              {/* El nombre se toca para corregirlo: se escribe al crear la
                  cuenta y después sale en tiquetes, facturas y correos. */}
              <button
                onClick={async () => {
                  const nuevo = window.prompt(
                    'Nombre del negocio\n\n'
                    + 'Aparece en el tiquete, en la factura y en los correos al cliente.\n'
                    + 'El nombre que va en el comprobante electrónico se cambia en Datos de FE.',
                    nombreNegocio,
                  );
                  if (nuevo === null) return;
                  const limpio = nuevo.trim();
                  if (!limpio || limpio === nombreNegocio) return;
                  try {
                    const r = await apiFetch<any>(`/admin/tenants/${owner.id}`, {
                      method: 'PATCH', body: JSON.stringify({ name: limpio }),
                    });
                    setNombreNegocio(r?.name ?? limpio);
                    onToast('Nombre actualizado', 'success');
                  } catch (e) {
                    onToast(e instanceof Error ? e.message : 'No se pudo cambiar el nombre', 'error');
                  }
                }}
                title="Cambiar el nombre del negocio"
                className="text-xs text-gray-400 hover:text-sky-700 underline decoration-dotted"
              >
                {nombreNegocio}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* El rol define QUÉ puede hacer cada usuario; crear la cuenta sin
              revisar eso deja al empleado con lo que el plan permita. */}
          <button
            onClick={() => setShowRoles(true)}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 px-4 py-3 text-left transition"
          >
            <Shield size={18} className="text-amber-600 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-black text-amber-900">Roles y permisos</span>
              <span className="block text-xs text-amber-800/80">
                Qué puede ver y modificar cada rol en esta empresa
              </span>
            </span>
          </button>

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
                  <UserRow key={u.id} user={u} onSave={patchUser}
                    onMakeOwner={hacerDueño} onRemove={quitarUsuario} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showRoles && (
        <TenantRolePermissionsModal
          owner={owner}
          onClose={() => setShowRoles(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
};

// Fila editable: nombre, alias y rol.
function UserRow({ user, onSave, onMakeOwner, onRemove }: {
  user: TenantUser;
  onSave: (u: TenantUser, patch: Partial<TenantUser>) => void;
  onMakeOwner?: (u: TenantUser) => void;
  onRemove?: (u: TenantUser) => void;
}) {
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
        {/* El usuario con el que entra. Se toca para cambiarlo: es la llave de
            acceso, y corregirlo obligaba a borrar la persona y crearla de nuevo,
            perdiendo su historial de ventas y cierres. */}
        <button
          onClick={() => {
            const actual = emailToUsername(user.email);
            const nuevo = window.prompt(
              `Usuario o correo de ${user.full_name || 'esta persona'}\n\n`
              + 'Con esto inicia sesión. Al cambiarlo, la próxima vez entra con el nuevo '
              + '(la contraseña no cambia).',
              actual,
            );
            if (nuevo === null) return;
            const limpio = nuevo.trim();
            if (!limpio || limpio === actual) return;
            onSave(user, { email: limpio } as any);
          }}
          title="Cambiar el usuario / correo con el que entra"
          className="text-[11px] font-mono text-gray-400 hover:text-violet-700 underline decoration-dotted"
        >
          {emailToUsername(user.email)}
        </button>
        {user.is_owner ? (
          <span className="text-[10px] font-black text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
            Dueño
          </span>
        ) : (
          <button onClick={() => onMakeOwner?.(user)}
            title="Pasar el negocio a esta persona"
            className="text-[10px] font-black text-gray-500 border border-gray-200 rounded-full px-2 py-0.5 hover:bg-gray-50">
            Hacer dueño
          </button>
        )}
        <button disabled={!dirty}
          onClick={() => onSave(user, { full_name: fullName.trim(), ticket_alias: alias.trim() || null, role })}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white">
          <Save size={12} /> Guardar
        </button>
        {/* Al dueño no se le ofrece: primero hay que pasar la propiedad. */}
        {!user.is_owner && (
          <button onClick={() => onRemove?.(user)} title="Quitar del negocio"
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100">
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}

export default TenantUsersModal;
