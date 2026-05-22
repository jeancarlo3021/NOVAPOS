'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check, Clock } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import type { User, Team, Shift, CreateShiftFormData, UpdateShiftFormData } from '@/types/Types_Users';

interface ShiftFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  shift?: Shift;
  users: User[];
  teams: Team[];
}

interface ShiftFormState {
  user_id?: string;
  team_id?: string;
  start_datetime: string;
  end_datetime?: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  notes?: string;
}

const EMPTY_FORM: ShiftFormState = {
  user_id: '',
  team_id: '',
  start_datetime: '',
  end_datetime: '',
  status: 'scheduled',
  notes: '',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado',
  active: 'En Curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

export const ShiftFormModal: React.FC<ShiftFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  shift,
  users,
  teams,
}) => {
  const { tenantId } = useTenantId();
  const [form, setForm] = useState<ShiftFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (shift) {
      setForm({
        user_id: shift.user_id || '',
        team_id: shift.team_id || '',
        start_datetime: shift.start_datetime,
        end_datetime: shift.end_datetime || '',
        status: shift.status,
        notes: shift.notes || '',
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setError('');
  }, [shift, isOpen]);

  if (!isOpen) return null;

  const isEditing = !!shift;

  const set = (k: keyof ShiftFormState, v: string | undefined) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!form.start_datetime) {
      setError('La fecha y hora de inicio es requerida');
      return;
    }

    if (!form.user_id && !form.team_id) {
      setError('Selecciona un usuario o un equipo');
      return;
    }

    if (form.end_datetime && form.start_datetime > form.end_datetime) {
      setError('La hora de fin no puede ser anterior a la hora de inicio');
      return;
    }

    setSaving(true);
    try {
      if (!tenantId) {
        setError('Tenant ID no disponible');
        return;
      }

      const payload: CreateShiftFormData | UpdateShiftFormData = {
        user_id: form.user_id || undefined,
        team_id: form.team_id || undefined,
        start_datetime: form.start_datetime,
        end_datetime: form.end_datetime || undefined,
        status: form.status,
        notes: form.notes || undefined,
      };

      // This will be integrated with shiftsService once backend is ready

      // Simulating API delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar turno');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Clock size={20} />
            {isEditing ? 'Editar Turno' : 'Nuevo Turno'}
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Usuario
              </label>
              <select
                value={form.user_id || ''}
                onChange={(e) => set('user_id', e.target.value || undefined)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Selecciona...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Equipo
              </label>
              <select
                value={form.team_id || ''}
                onChange={(e) => set('team_id', e.target.value || undefined)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Selecciona...</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Fecha y Hora de Inicio *
            </label>
            <input
              type="datetime-local"
              value={form.start_datetime}
              onChange={(e) => set('start_datetime', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Fecha y Hora de Fin
            </label>
            <input
              type="datetime-local"
              value={form.end_datetime || ''}
              onChange={(e) => set('end_datetime', e.target.value || undefined)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Estado
            </label>
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as ShiftFormState['status'])}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Notas
            </label>
            <textarea
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value || undefined)}
              rows={3}
              placeholder="Opcional: Detalles adicionales del turno"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
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

export default ShiftFormModal;
