import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check } from 'lucide-react';
import { expenseCategoriesService } from '@/services/expenses/expensesService';
import {
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
} from '@/types/Types_Expenses';
import type { CategoryFormModalProps } from './types';

function CategoryFormModal({ open, onClose, onSaved, tenantId, editing }: CategoryFormModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(DEFAULT_CATEGORY_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setColor(editing.color);
      setIcon(editing.icon);
    } else {
      setName('');
      setColor(DEFAULT_CATEGORY_COLORS[0]);
      setIcon(DEFAULT_CATEGORY_ICONS[0]);
    }
    setError('');
  }, [editing, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await expenseCategoriesService.update(editing.id, { name, color, icon });
      } else {
        await expenseCategoriesService.create(tenantId, { name, color, icon });
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? 'Editar Categoría' : 'Nueva Categoría'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Servicios"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition"
                  style={{ backgroundColor: c, borderColor: color === c ? '#111' : 'transparent' }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Ícono</label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_CATEGORY_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg border-2 transition ${
                    icon === ic ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-1">
            <p className="text-xs text-gray-400 mb-2">Vista previa:</p>
            <span
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: color }}
            >
              {icon} {name || 'Categoría'}
            </span>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 transition flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CategoryFormModal;
