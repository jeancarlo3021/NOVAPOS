import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check, Bell } from 'lucide-react';
import { recurringExpensesService } from '@/services/expenses/expensesService';
import {
  PAYMENT_METHOD_LABELS,
  FREQUENCY_LABELS,
} from '@/types/Types_Expenses';
import type { RecurringExpenseFormData } from '@/types/Types_Expenses';
import type { RecurringFormModalProps } from './types';

const EMPTY_RECURRING: RecurringExpenseFormData = {
  description:    '',
  default_amount: '',
  category_id:    '',
  frequency:      'monthly',
  day_of_month:   '1',
  payment_method: 'cash',
  notes:          '',
};

function RecurringFormModal({ open, onClose, onSaved, tenantId, categories, editing }: RecurringFormModalProps) {
  const [form, setForm] = useState<RecurringExpenseFormData>(EMPTY_RECURRING);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (editing) {
      setForm({
        description:    editing.description,
        default_amount: String(editing.default_amount),
        category_id:    editing.category_id ?? '',
        frequency:      editing.frequency,
        day_of_month:   String(editing.day_of_month ?? 1),
        payment_method: editing.payment_method,
        notes:          editing.notes ?? '',
      });
    } else {
      setForm(EMPTY_RECURRING);
    }
    setError('');
  }, [editing, open]);

  if (!open) return null;

  const set = (k: keyof RecurringExpenseFormData, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim())  { setError('La descripción es requerida'); return; }
    if (!form.default_amount || parseFloat(form.default_amount) <= 0) {
      setError('El monto base debe ser mayor a 0'); return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await recurringExpensesService.update(editing.id, form);
      } else {
        await recurringExpensesService.create(tenantId, form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-emerald-500" />
            <h2 className="text-lg font-bold text-gray-900">
              {editing ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción *</label>
            <input type="text" value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Ej. Factura de electricidad"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Monto base (₡) *</label>
              <input type="number" min="0" step="1" value={form.default_amount}
                onChange={e => set('default_amount', e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <p className="text-xs text-gray-400 mt-1">Puedes ajustarlo al registrar</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Categoría</label>
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Frecuencia *</label>
              <select value={form.frequency} onChange={e => set('frequency', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {Object.entries(FREQUENCY_LABELS).map(([k, v]) =>
                  <option key={k} value={k}>{v}</option>
                )}
              </select>
            </div>
            {form.frequency === 'monthly' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Día del mes (1-31)</label>
                <input type="number" min="1" max="31" value={form.day_of_month}
                  onChange={e => set('day_of_month', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Método de pago habitual</label>
            <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) =>
                <option key={k} value={k}>{v}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notas</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              placeholder="Opcional"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60 transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RecurringFormModal;
