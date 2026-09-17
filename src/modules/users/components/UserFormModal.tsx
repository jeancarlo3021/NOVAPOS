'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check, Building2 } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { useAuth } from '@/context/AuthContext';
import { usersService, type TiendaDeUsuario } from '@/services/users/usersService';
import { tenantGroupsService } from '@/services/admin/tenantGroupsService';
import type { MyTenant } from '@/services/admin/tenantGroupsService';
import { USER_ROLES, ROLE_META, ROLE_REQUIRED_FEATURES } from '@/types/Types_Users';
import type { User, CreateUserFormData, UpdateUserFormData, UserRole } from '@/types/Types_Users';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: User;
}

const EMPTY_FORM: CreateUserFormData = {
  email: '',
  password: '',
  full_name: '',
  role: 'cajero' as UserRole,
  phone: '',
};

export const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, onSuccess, user }) => {
  const { tenantId } = useTenantId();
  const { planFeatures } = useAuth();
  const [form, setForm] = useState<CreateUserFormData | UpdateUserFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [zoneList, setZoneList] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    import('@/services/customers/customersService').then(({ customersService }) =>
      customersService.listZones().then(zs => setZoneList((zs ?? []).map((z: any) => z.name))).catch(() => {}),
    );
  }, [isOpen]);
  // Sucursal destino (solo al crear). Default = tenant actual.
  const [targetTenantId, setTargetTenantId] = useState<string>('');
  const [myTenants, setMyTenants] = useState<MyTenant[]>([]);

  // Solo el dueño de un grupo multi-empresa puede asignar el usuario a otra
  // sucursal. Lo detectamos así: tiene acceso a >1 tenant Y al menos uno con
  // role='owner' (en user_tenants). Super-admin siempre puede. Un cajero o
  // gerente normal (sin role='owner' en ningún tenant) no ve el selector.
  const isSuperAdmin = planFeatures?.admin_dashboard === true;
  const isGroupOwner = myTenants.some(t => t.role === 'owner');
  const canPickTenant = (isSuperAdmin || isGroupOwner) && myTenants.length > 1;

  /**
   * Tiendas o sucursales que puede ver el usuario.
   *
   * Solo aparecen las que maneja quien edita. Con una sola tienda no hay nada
   * que elegir y la sección no se muestra.
   */
  const [tiendas, setTiendas] = useState<TiendaDeUsuario[]>([]);
  const [tiendasSel, setTiendasSel] = useState<Set<string>>(new Set());
  const [tiendasIniciales, setTiendasIniciales] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isOpen) return;
    setTiendas([]); setTiendasSel(new Set()); setTiendasIniciales(new Set());
    (async () => {
      try {
        if (user) {
          const r = await usersService.getUserTenants(user.id);
          const lista = r?.tiendas ?? [];
          const sel = new Set(lista.filter(t => t.acceso).map(t => t.tenant_id));
          setTiendas(lista); setTiendasSel(sel); setTiendasIniciales(new Set(sel));
        } else {
          const lista = await usersService.managedTenants(targetTenantId || tenantId);
          setTiendas((lista ?? []).map(t => ({ tenant_id: t.id, name: t.name, acceso: false, actual: false })));
        }
      } catch { /* sin permiso o sin grupo: la sección no se muestra */ }
    })();
    // Al crear, cambia con la sucursal destino: cada cliente tiene sus propias tiendas.
  }, [isOpen, user, targetTenantId, tenantId]);

  // Cargar tenants accesibles al abrir el modal (solo en modo crear).
  // Necesitamos el array para derivar `canPickTenant` (busca role='owner').
  useEffect(() => {
    if (!isOpen || user) return;
    (async () => {
      try {
        const list = await tenantGroupsService.myTenants();
        setMyTenants(Array.isArray(list) ? list : []);
      } catch { /* ignore */ }
    })();
  }, [isOpen, user]);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name,
        role: user.role as UserRole,
        phone: user.phone || '',
        zone: (user as any).zone || '',
        ticket_alias: (user as any).ticket_alias || '',
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setError('');
  }, [user, isOpen]);

  if (!isOpen) return null;

  const isEditing = !!user;
  const set = (k: keyof CreateUserFormData | keyof UpdateUserFormData, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!form.full_name?.trim()) {
      setError('El nombre completo es requerido');
      return;
    }

    if (!isEditing) {
      const createForm = form as CreateUserFormData;
      if (!createForm.email?.trim()) {
        setError('El usuario es requerido');
        return;
      }
      if (/\s/.test(createForm.email.trim())) {
        setError('El usuario no puede contener espacios');
        return;
      }
      if (!createForm.password || createForm.password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        return;
      }
      if (!/[a-zA-Z]/.test(createForm.password) || !/[0-9]/.test(createForm.password)) {
        setError('La contraseña debe combinar letras y números (no solo letras ni solo números)');
        return;
      }
      if (!createForm.role) {
        setError('Selecciona un rol');
        return;
      }
    } else {
      if (!form.role) {
        setError('Selecciona un rol');
        return;
      }
    }

    setSaving(true);
    try {
      if (!tenantId) {
        setError('Tenant ID no disponible');
        return;
      }

      if (isEditing && user) {
        const updateForm: UpdateUserFormData = {
          full_name: form.full_name,
          role: form.role as UserRole,
          phone: (form as any).phone || undefined,
          zone: (form as any).zone ?? '',
          ticket_alias: (form as any).ticket_alias ?? '',
        };
        await usersService.updateUser(user.id, updateForm);
        const cambió = tiendasSel.size !== tiendasIniciales.size
          || [...tiendasSel].some(t => !tiendasIniciales.has(t));
        if (tiendas.length > 1 && cambió) {
          if (tiendasSel.size === 0) { setError('El usuario tiene que poder entrar al menos a una tienda.'); return; }
          await usersService.setUserTenants(user.id, [...tiendasSel]);
        }
      } else {
        const creado = await usersService.createUser(tenantId, {
          ...(form as CreateUserFormData),
          target_tenant_id: targetTenantId || null,
        });
        // La tienda donde se creó siempre queda; se suman las otras marcadas.
        const destino = targetTenantId || tenantId;
        const extra = [...tiendasSel].filter(t => t !== destino);
        if (creado?.id && extra.length) {
          try { await usersService.setUserTenants(creado.id, [destino, ...extra]); }
          catch (e) {
            setError(`Usuario creado, pero no se le pudo dar acceso a las otras tiendas: ${e instanceof Error ? e.message : 'error'}`);
            onSuccess();
            return;
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar usuario');
    } finally {
      setSaving(false);
    }
  };

  const createForm = form as CreateUserFormData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Nombre Completo *
            </label>
            <input
              type="text"
              value={form.full_name || ''}
              onChange={(e) => set('full_name', e.target.value)}
              placeholder="Ej. Juan Pérez"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {!isEditing && canPickTenant && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1">
                <Building2 size={11} /> Sucursal destino *
              </label>
              <select
                value={targetTenantId}
                onChange={(e) => setTargetTenantId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">— Sucursal actual —</option>
                {myTenants.map(t => (
                  <option key={t.tenant_id} value={t.tenant_id}>
                    {t.tenant_name} {t.group_name ? `(${t.group_name})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Elegí en qué sucursal querés crear este usuario.
              </p>
            </div>
          )}

          {!isEditing && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Usuario *
                </label>
                <input
                  type="text"
                  value={createForm.email}
                  onChange={(e) => set('email', e.target.value.trim())}
                  placeholder="ej. juanperez (o un correo si tiene)"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Si no tiene correo, escribe solo un nombre de usuario. Se usará para iniciar sesión.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Contraseña *
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              Rol asignado *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(USER_ROLES) as UserRole[])
                .filter(r => r !== 'owner')  // No permitir crear owners
                .filter(r => {
                  // Si el rol requiere features que el plan no incluye, ocultarlo.
                  // Si la lista está vacía → siempre disponible (admin, etc.).
                  const required = ROLE_REQUIRED_FEATURES[r] ?? [];
                  if (required.length === 0) return true;
                  // Al menos una de las features requeridas debe estar activa
                  // (no exigimos todas — un cocinero tiene sentido con `tables`,
                  // un contador con `reports` aunque no haya `accounts_payable`).
                  return required.some(f => (planFeatures as any)?.[f] === true);
                })
                .sort((a, b) => ROLE_META[b].level - ROLE_META[a].level)
                .map((roleKey) => {
                  const meta = ROLE_META[roleKey];
                  const selected = form.role === roleKey;
                  return (
                    <button
                      key={roleKey}
                      type="button"
                      onClick={() => set('role', roleKey)}
                      className={`text-left p-2.5 rounded-xl border-2 transition ${
                        selected
                          ? `bg-${meta.color}-50 border-${meta.color}-500`
                          : 'bg-white border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-base">{meta.emoji}</span>
                        <span className={`text-xs font-black ${selected ? `text-${meta.color}-800` : 'text-gray-700'}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className={`text-[10px] leading-tight ${selected ? `text-${meta.color}-600` : 'text-gray-400'}`}>
                        {meta.description}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Teléfono
            </label>
            <input
              type="tel"
              value={(form as any).phone || ''}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="Opcional"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Zona asignada <span className="text-gray-400 font-normal">(opcional — limita a esa zona)</span>
            </label>
            <select
              value={(form as any).zone || ''}
              onChange={(e) => set('zone', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Sin restricción (ve todas)</option>
              {zoneList.map(z => <option key={z} value={z}>{z}</option>)}
              {/* Si el usuario ya tenía una zona que ya no existe en el catálogo, la mostramos igual. */}
              {(form as any).zone && !zoneList.includes((form as any).zone) && (
                <option value={(form as any).zone}>{(form as any).zone}</option>
              )}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Las zonas son las que creás en <strong>Clientes → Zonas</strong>. Si asignás una,
              el usuario (ej. repartidor) solo verá clientes y cuentas por cobrar de esa zona.
            </p>
          </div>

          {/* Tiendas o sucursales que puede ver */}
          {tiendas.length > 1 && (() => {
            const destino = targetTenantId || tenantId;
            return (
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-1">
                  <Building2 size={11} /> Tiendas o sucursales que puede ver
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {tiendas.map(t => {
                    // Al crear, la tienda donde se crea el usuario va siempre.
                    const fija = !isEditing && t.tenant_id === destino;
                    const marcada = fija || tiendasSel.has(t.tenant_id);
                    return (
                      <label key={t.tenant_id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer transition ${
                          marcada ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        } ${fija ? 'opacity-80 cursor-default' : ''}`}>
                        <input type="checkbox" checked={marcada} disabled={fija}
                          onChange={e => setTiendasSel(prev => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(t.tenant_id); else n.delete(t.tenant_id);
                            return n;
                          })}
                          className="w-4 h-4 rounded text-blue-600" />
                        <span className="flex-1 min-w-0 truncate font-semibold">{t.name}</span>
                        {isEditing && t.actual && (
                          <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">Ahora</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Puede cambiar entre las marcadas con el selector de empresa. Si le quitás la tienda
                  en la que está trabajando, pasa a una de las que le quedan.
                </p>
              </div>
            );
          })()}

          {/* Alias para el ticket ("Atendido por:") — control interno */}
          {isEditing && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                🎫 Alias en el ticket <span className="text-gray-400 font-normal">(control interno)</span>
              </label>
              <input
                type="text"
                maxLength={60}
                value={(form as any).ticket_alias || ''}
                onChange={(e) => set('ticket_alias', e.target.value)}
                placeholder={`Ej. Paquito (por defecto: ${user?.full_name || 'nombre real'})`}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Nombre que aparece como <strong>“Atendido por:”</strong> en el ticket de este usuario. Si lo dejás vacío, se usa el nombre real. Requiere activar “Mostrar cajero” en Configuración → Factura.
              </p>
            </div>
          )}

          {/* PIN para modo Kiosk del POS — solo al editar */}
          {isEditing && user && (
            <PinField userId={user.id} />
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-60 transition flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Guardar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Sub-componente: PIN para modo Kiosk ──────────────────────────────────────
function PinField({ userId }: { userId: string }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSave = async () => {
    setStatus('saving'); setError('');
    try {
      await usersService.setPin(userId, pin || null);
      setStatus('saved');
      setPin('');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <div className="border-t border-gray-100 pt-3">
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        🔐 PIN del Punto de Venta <span className="text-gray-400 font-normal">(modo kiosk)</span>
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="4-8 dígitos numéricos"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={status === 'saving' || (pin !== '' && pin.length < 3)}
          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
        >
          {status === 'saving' ? '...' : status === 'saved' ? '✓' : 'Guardar PIN'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <p className="text-[11px] text-gray-400 mt-1">
        Dejá vacío y guardá para quitarlo. Único por sucursal.
      </p>
    </div>
  );
}

export default UserFormModal;
