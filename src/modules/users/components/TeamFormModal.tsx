'use client';

import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import type { Team } from '@/types/Types_Users';

interface TeamFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  team?: Team;
}

interface TeamFormData {
  name: string;
  description: string;
  color: string;
}

const COLOR_PRESETS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#64748b', // slate
];

const EMPTY_FORM: TeamFormData = {
  name: '',
  description: '',
  color: '#3b82f6',
};

export const TeamFormModal: React.FC<TeamFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  team,
}) => {
  const { tenantId } = useTenantId();
  const [form, setForm] = useState<TeamFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (team) {
      setForm({
        name: team.name,
        description: team.description || '',
        color: team.color,
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setError('');
  }, [team, isOpen]);

  if (!isOpen) return null;

  const isEditing = !!team;
  const set = (k: keyof TeamFormData, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('El nombre del equipo es requerido');
      return;
    }

    setSaving(true);
    try {
      if (!tenantId) {
        setError('Tenant ID no disponible');
        return;
      }

      // This will be integrated with teamsService once backend is ready
      // For now, we show the structure
      const payload = {
        name: form.name,
        description: form.description || undefined,
        color: form.color,
      };

      // Mock API call - replace with actual teamsService when available

      // Simulating API delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar equipo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEditing ? 'Editar Equipo' : 'Nuevo Equipo'}
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
              Nombre del Equipo *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ej. Turno Mañana"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Opcional: Descripción o notas del equipo"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              Color del Equipo
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => set('color', color)}
                    className={`w-8 h-8 rounded-lg border-2 transition ${
                      form.color === color ? 'border-gray-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  O ingresa un color personalizado
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => set('color', e.target.value)}
                    className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => set('color', e.target.value)}
                    placeholder="#000000"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 px-3 py-2 bg-gray-50 rounded-xl flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full border border-gray-300"
              style={{ backgroundColor: form.color }}
            />
            <span className="text-xs text-gray-600">
              Vista previa: <strong>{form.name || 'Nuevo Equipo'}</strong>
            </span>
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

export default TeamFormModal;
