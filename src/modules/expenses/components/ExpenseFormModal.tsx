import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Check } from 'lucide-react';
import { expensesService } from '@/services/expenses/expensesService';
import {
  PAYMENT_METHOD_LABELS,
  EXPENSE_TYPE_LABELS,
} from '@/types/Types_Expenses';
import type { ExpenseFormData } from '@/types/Types_Expenses';
import type { ExpenseFormModalProps } from './types';

// ── Offline expense queue (localStorage) ─────────────────────────────────────
interface PendingExpense { localId: string; form: ExpenseFormData; tenantId: string; createdAt: string }
const pendingKey = (tid: string) => `expense_pending_${tid}`;
function getPendingExpenses(tid: string): PendingExpense[] {
  try { return JSON.parse(localStorage.getItem(pendingKey(tid)) ?? '[]'); } catch { return []; }
}
function addPendingExpense(tid: string, form: ExpenseFormData) {
  const list = getPendingExpenses(tid);
  list.push({ localId: Math.random().toString(36).slice(2), form, tenantId: tid, createdAt: new Date().toISOString() });
  localStorage.setItem(pendingKey(tid), JSON.stringify(list));
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM: ExpenseFormData = {
  description: '',
  amount: '',
  category_id: '',
  date: today(),
  payment_method: 'cash',
  type: 'variable',
  reference: '',
  notes: '',
};

function ExpenseFormModal({ open, onClose, onSaved, tenantId, categories, editing, prefill }: ExpenseFormModalProps) {
  const [form, setForm] = useState<ExpenseFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) {
      setForm({
        description: editing.description,
        amount: String(editing.amount),
        category_id: editing.category_id ?? '',
        date: editing.date,
        payment_method: editing.payment_method,
        type: editing.type,
        reference: editing.reference ?? '',
        notes: editing.notes ?? '',
      });
    } else {
      // Modo crear: base vacía + valores prellenados (ej. importados de un XML).
      setForm({ ...EMPTY_FORM, date: today(), ...(prefill ?? {}) });
    }
    setError('');
  }, [editing, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const set = (k: keyof ExpenseFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('La descripción es requerida'); return; }
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) {
      setError('El monto debe ser mayor a 0'); return;
    }
    if (!form.category_id) { setError('Selecciona una categoría'); return; }
    setSaving(true);
    setError('');
    try {
      if (!navigator.onLine) {
        if (editing) {
          setError('Sin conexión — editar gastos requiere internet');
          return;
        }
        addPendingExpense(tenantId, form);
        onSaved();
        onClose();
        return;
      }
      if (editing) {
        await expensesService.update(editing.id, form);
      } else {
        await expensesService.create(tenantId, form);
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {editing ? 'Editar Gasto' : 'Nuevo Gasto'}
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
            <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción *</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Ej. Pago de electricidad"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Monto (₡) *</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Método de pago</label>
              <select
                value={form.payment_method}
                onChange={(e) => set('payment_method', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {Object.entries(EXPENSE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Categoría *</label>
            <select
              value={form.category_id}
              onChange={(e) => set('category_id', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Referencia / N° documento</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => set('reference', e.target.value)}
              placeholder="Opcional"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
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

export default ExpenseFormModal;
