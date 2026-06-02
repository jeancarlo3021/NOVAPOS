'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { usersService } from '@/services/users/usersService';
import { USER_ROLES, ROLE_META } from '@/types/Types_Users';
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
  const [form, setForm] = useState<CreateUserFormData | UpdateUserFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name,
        role: user.role as UserRole,
        phone: user.phone || '',
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
        };
        await usersService.updateUser(user.id, updateForm);
      } else {
        await usersService.createUser(tenantId, form as CreateUserFormData);
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

export default UserFormModal;
