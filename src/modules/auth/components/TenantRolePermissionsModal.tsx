'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, Shield, Loader2, Save, AlertCircle, ChevronLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ROLE_META, USER_ROLES } from '@/types/Types_Users';
import type { UserRole, UserPermissionMatrix } from '@/types/Types_Users';
import { PERMISSION_MODULES } from '@/modules/users/permissionModules';

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

/** El dueño siempre tiene acceso total, así que no se edita. */
const EDITABLE_ROLES = (Object.keys(USER_ROLES) as UserRole[])
  .filter(r => r !== 'owner')
  .sort((a, b) => ROLE_META[b].level - ROLE_META[a].level);

type PermRow = { can_access: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };
const EMPTY: PermRow = { can_access: false, can_create: false, can_edit: false, can_delete: false };

/**
 * Permisos por rol de UNA empresa, desde el Panel Admin.
 *
 * Es la misma matriz que el negocio ve en Usuarios → Roles, pero alcanzable sin
 * cambiar de empresa: cuando acá mismo se crean los usuarios del cliente, lo
 * natural es dejarle los permisos listos en el mismo momento.
 *
 * Ojo con lo que significa una matriz vacía: mientras el rol NO tenga ningún
 * módulo guardado, el sistema lo trata como «sin configurar» y deja pasar. En
 * cuanto se guarda algo, lo que no esté concedido queda denegado — incluido en
 * el servidor, no solo en la pantalla.
 */
export const TenantRolePermissionsModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [draft, setDraft] = useState<UserPermissionMatrix>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cuántos módulos tiene concedidos cada rol (para la lista inicial).
  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(EDITABLE_ROLES.map(async r => {
        try {
          const m = await apiFetch<UserPermissionMatrix>(
            `/admin/tenants/${owner.id}/role-permissions/${r}`);
          return [r, Object.values(m ?? {}).filter((p: any) => p?.can_access).length] as const;
        } catch { return [r, 0] as const; }
      }));
      setCounts(Object.fromEntries(entries));
    } finally { setLoading(false); }
  }, [owner.id]);

  useEffect(() => { void loadCounts(); }, [loadCounts]);

  const openRole = async (r: UserRole) => {
    setLoading(true);
    try {
      const stored = await apiFetch<UserPermissionMatrix>(
        `/admin/tenants/${owner.id}/role-permissions/${r}`).catch(() => ({} as UserPermissionMatrix));
      const m: UserPermissionMatrix = {};
      for (const mod of PERMISSION_MODULES) {
        m[mod.key] = { ...EMPTY, ...(stored?.[mod.key] ?? {}) } as any;
      }
      setDraft(m);
      setRole(r);
    } finally { setLoading(false); }
  };

  const toggle = (key: string, field: keyof PermRow) => {
    setDraft(prev => {
      const row = { ...(prev[key] ?? EMPTY) } as PermRow;
      row[field] = !row[field];
      // Sin acceso al módulo, los permisos de escritura no significan nada:
      // dejarlos marcados solo confunde a quien lea la pantalla después.
      if (field === 'can_access' && !row.can_access) {
        row.can_create = false; row.can_edit = false; row.can_delete = false;
      }
      if (field !== 'can_access' && row[field]) row.can_access = true;
      return { ...prev, [key]: row };
    });
  };

  const save = async () => {
    if (!role) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/tenants/${owner.id}/role-permissions/${role}`, {
        method: 'PUT', body: JSON.stringify({ permissions: draft }),
      });
      onToast(`Permisos de ${ROLE_META[role].label} guardados en ${owner.name}`, 'success');
      setRole(null);
      await loadCounts();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudieron guardar', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {role && (
              <button onClick={() => setRole(null)} className="p-1 -ml-1 text-gray-400 hover:text-gray-700">
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Shield size={18} className="text-amber-600" />
                {role ? `Permisos · ${ROLE_META[role].label}` : 'Roles y permisos'}
              </h2>
              <p className="text-xs text-gray-500 truncate">{owner.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          ) : !role ? (
            <>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs mb-4">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>
                  Mientras un rol no tenga <b>ningún</b> módulo guardado, el sistema lo trata como
                  «sin configurar» y le deja pasar todo lo que el plan permita. Apenas guardés algo,
                  lo que no esté concedido queda bloqueado — también del lado del servidor.
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EDITABLE_ROLES.map(r => {
                  const meta = ROLE_META[r];
                  const n = counts[r] ?? 0;
                  return (
                    <button key={r} onClick={() => void openRole(r)}
                      className="text-left bg-white border-2 border-gray-200 hover:border-amber-300 rounded-xl p-4 transition">
                      <p className="font-black text-gray-900">{meta.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {n > 0 ? `${n} módulo${n === 1 ? '' : 's'} con acceso` : 'Sin configurar (acceso libre)'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-black text-gray-500 uppercase border-b border-gray-100">
                    <th className="text-left py-2">Módulo</th>
                    <th className="px-2 py-2">Ver</th>
                    <th className="px-2 py-2">Crear</th>
                    <th className="px-2 py-2">Editar</th>
                    <th className="px-2 py-2">Borrar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {PERMISSION_MODULES.map(mod => {
                    const row = (draft[mod.key] ?? EMPTY) as PermRow;
                    return (
                      <tr key={mod.key}>
                        <td className="py-2.5">
                          <p className="font-bold text-gray-800">{mod.label}</p>
                          <p className="text-[11px] text-gray-400">{mod.description}</p>
                        </td>
                        {(['can_access', 'can_create', 'can_edit', 'can_delete'] as const).map(f => (
                          <td key={f} className="text-center px-2">
                            <input
                              type="checkbox"
                              checked={row[f]}
                              onChange={() => toggle(mod.key, f)}
                              className="w-4 h-4 accent-amber-600"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {role && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
            <button onClick={() => setRole(null)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancelar
            </button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-black rounded-lg disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantRolePermissionsModal;
