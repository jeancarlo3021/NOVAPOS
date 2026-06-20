'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield, AlertCircle, Loader2, X, Check, Lock, Settings2,
  ShoppingCart, Package, BarChart2, TrendingDown, ClipboardList,
  Wallet, Tag, Users, UserCog, Truck,
} from 'lucide-react';
import { rolePermissionsService } from '@/services/users/rolePermissionsService';
import { ROLE_META, USER_ROLES } from '@/types/Types_Users';
import { useAuth } from '@/context/AuthContext';
import { clearRolePermissionsCache } from '@/hooks/useRolePermissions';
import type { UserRole, UserModule, UserPermissionMatrix } from '@/types/Types_Users';

interface ModuleMeta {
  key: UserModule;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const MODULES: ModuleMeta[] = [
  { key: 'pos',              label: 'Punto de Venta',    description: 'Caja, cobros y ventas',          icon: ShoppingCart,  color: 'bg-blue-500' },
  { key: 'inventory',        label: 'Inventario',        description: 'Productos, stock y categorías',  icon: Package,       color: 'bg-emerald-500' },
  { key: 'reports',          label: 'Reportes',          description: 'Análisis y estadísticas',        icon: BarChart2,     color: 'bg-indigo-500' },
  { key: 'expenses',         label: 'Gastos',            description: 'Registro y gestión de gastos',   icon: TrendingDown,  color: 'bg-red-400' },
  { key: 'purchases',        label: 'Compras',           description: 'Órdenes a proveedores',          icon: ClipboardList, color: 'bg-cyan-500' },
  { key: 'accounts_payable', label: 'Cuentas por Pagar', description: 'Pagos a proveedores',            icon: Wallet,        color: 'bg-rose-500' },
  { key: 'promotions',       label: 'Promociones',       description: 'Descuentos y ofertas',           icon: Tag,           color: 'bg-violet-500' },
  { key: 'users',            label: 'Usuarios',          description: 'Gestión de usuarios y roles',    icon: Users,         color: 'bg-amber-500' },
  { key: 'hr',               label: 'Recursos Humanos',  description: 'Empleados y nómina',             icon: UserCog,       color: 'bg-fuchsia-500' },
  { key: 'customers',        label: 'Clientes',          description: 'Gestión de clientes',            icon: Users,         color: 'bg-teal-500' },
  { key: 'restaurant',       label: 'Restaurante / Mesas', description: 'Cobro por mesas y mapa',       icon: ShoppingCart,  color: 'bg-orange-500' },
  { key: 'recipes',          label: 'Recetas',           description: 'Recetas e ingredientes',         icon: Package,       color: 'bg-lime-500' },
  { key: 'distribution',     label: 'Distribución',      description: 'Rutas de reparto y repartidor',  icon: Truck,         color: 'bg-cyan-500' },
];

// Roles configurables (owner siempre tiene acceso total → no editable)
const EDITABLE_ROLES = (Object.keys(USER_ROLES) as UserRole[])
  .filter(r => r !== 'owner')
  .sort((a, b) => ROLE_META[b].level - ROLE_META[a].level);

type PermRow = { can_access: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean };

const emptyMatrix = (accessDefault: boolean): UserPermissionMatrix => {
  const m: UserPermissionMatrix = {};
  MODULES.forEach(mod => {
    m[mod.key] = { can_access: accessDefault, can_create: false, can_edit: false, can_delete: false };
  });
  return m;
};

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        checked ? 'bg-emerald-500' : 'bg-gray-200'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

export const RoleSettings: React.FC = () => {
  const { planFeatures } = useAuth();
  // Solo módulos que el plan actual incluye — si no hay HR en el plan, no
  // tiene sentido configurar permisos de HR para los roles.
  const visibleModules = MODULES.filter(m => (planFeatures as any)?.[m.key] === true);

  const [matrices, setMatrices] = useState<Record<string, UserPermissionMatrix>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [editingRole, setEditingRole] = useState<UserRole | null>(null);
  const [draft, setDraft] = useState<UserPermissionMatrix>({});
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!navigator.onLine) {
        setError('Sin conexión — los permisos por rol requieren conexión');
        return;
      }
      const entries = await Promise.all(
        EDITABLE_ROLES.map(async (role) => {
          const data = await rolePermissionsService.getRolePermissions(role);
          return [role, data] as const;
        })
      );
      setMatrices(Object.fromEntries(entries));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar permisos de roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const moduleCount = (role: UserRole) => {
    const m = matrices[role];
    if (!m) return 0;
    return visibleModules.filter(mod => m[mod.key]?.can_access).length;
  };

  const openEditor = (role: UserRole) => {
    const stored = matrices[role];
    const seeded = emptyMatrix(true);
    if (stored && Object.keys(stored).length > 0) {
      visibleModules.forEach(mod => {
        const s = stored[mod.key];
        seeded[mod.key] = {
          can_access: s?.can_access ?? false,
          can_create: s?.can_create ?? false,
          can_edit: s?.can_edit ?? false,
          can_delete: s?.can_delete ?? false,
        };
      });
    }
    setDraft(seeded);
    setEditingRole(role);
  };

  const patchModule = (module: UserModule, patch: Partial<PermRow>) => {
    setDraft(prev => ({
      ...prev,
      [module]: { ...prev[module], ...patch },
    }));
  };

  const handleSave = async () => {
    if (!editingRole) return;
    if (visibleModules.length === 0) {
      setError('No hay módulos disponibles en tu plan. Verificá que el plan tenga features activas.');
      return;
    }
    setSaving(true);
    setError('');
    console.log('[RoleSettings] saving', { role: editingRole, modules: visibleModules.length, draft });
    try {
      // Si no hay acceso al módulo, fuerza CRUD a false
      const clean: UserPermissionMatrix = {};
      visibleModules.forEach(mod => {
        const d = draft[mod.key];
        clean[mod.key] = {
          can_access: d?.can_access ?? false,
          can_create: !!d?.can_access && !!d?.can_create,
          can_edit: !!d?.can_access && !!d?.can_edit,
          can_delete: !!d?.can_access && !!d?.can_delete,
        };
      });
      console.log('[RoleSettings] sending to backend:', { role: editingRole, clean });
      const resp = await rolePermissionsService.updateRolePermissions(editingRole, clean);
      console.log('[RoleSettings] backend response:', resp);
      setMatrices(prev => ({ ...prev, [editingRole]: clean }));
      // Invalidar el cache del hook para que la próxima vez que un user
      // con este rol entre, refetchee los permisos actualizados.
      clearRolePermissionsCache();
      setEditingRole(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar permisos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-black text-gray-900">Ajuste de Roles</h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-xl flex items-start gap-3">
        <Settings2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm">
          Configura qué puede hacer cada rol en cada módulo. <strong>Crear / Editar / Eliminar</strong> solo aplican si <strong>Acceder</strong> está habilitado.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Owner: acceso total, bloqueado */}
          <div className="bg-white border-2 border-purple-200 rounded-2xl p-5 flex flex-col">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-xl bg-purple-100">
                {ROLE_META.owner.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-gray-900">{ROLE_META.owner.label}</h3>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ROLE_META.owner.description}</p>
              </div>
            </div>
            <div className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" /> Acceso total (no editable)
            </div>
          </div>

          {EDITABLE_ROLES.map(role => {
            const meta = ROLE_META[role];
            const count = moduleCount(role);
            return (
              <div key={role} className={`bg-white border-2 border-${meta.color}-200 rounded-2xl p-5 flex flex-col`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-xl bg-${meta.color}-100`}>
                    {meta.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-900">{meta.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{meta.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4 border-t border-gray-100 pt-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Módulos con acceso</span>
                  <span className="text-sm font-black text-gray-900">{count} / {visibleModules.length}</span>
                </div>

                <button
                  onClick={() => openEditor(role)}
                  className="mt-auto flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Configurar permisos
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de edición */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">{ROLE_META[editingRole].emoji}</span>
                <div>
                  <h2 className="text-lg font-black text-gray-900">Permisos del rol</h2>
                  <p className="text-xs text-gray-400">{ROLE_META[editingRole].label}</p>
                </div>
              </div>
              <button onClick={() => setEditingRole(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {visibleModules.map(mod => {
                const Icon = mod.icon;
                const row = draft[mod.key] ?? { can_access: false, can_create: false, can_edit: false, can_delete: false };
                return (
                  <div key={mod.key} className={`rounded-xl border-2 transition-colors ${row.can_access ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center gap-4 p-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mod.color}`}>
                        <Icon size={19} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm">{mod.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{mod.description}</p>
                      </div>
                      <Toggle checked={row.can_access} onChange={v => patchModule(mod.key, { can_access: v })} />
                    </div>
                    {row.can_access && (
                      <div className="px-4 pb-4 pt-1 ml-14 grid grid-cols-3 gap-2 border-t border-emerald-100">
                        {([
                          ['can_create', 'Crear'],
                          ['can_edit', 'Editar'],
                          ['can_delete', 'Eliminar'],
                        ] as const).map(([key, label]) => (
                          <label key={key} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition ${row[key] ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                            <input
                              type="checkbox"
                              checked={row[key]}
                              onChange={() => patchModule(mod.key, { [key]: !row[key] } as Partial<PermRow>)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs font-semibold text-gray-700">{label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : <><Check size={16} /> Guardar permisos</>}
              </button>
              <button onClick={() => setEditingRole(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleSettings;
