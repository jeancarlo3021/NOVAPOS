import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Search, Filter, RefreshCw,
  DollarSign, TrendingDown, Tag, X, Check, Download,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import {
  expensesService,
  expenseCategoriesService,
  expenseCategoriesGeneralService,
} from '@/services/expenses/expensesService';
import type {
  Expense, ExpenseCategory, ExpenseCategoryGeneral,
  ExpenseFormData, ExpenseFilters,
} from '@/types/Types_Expenses';
import {
  PAYMENT_METHOD_LABELS, EXPENSE_TYPE_LABELS,
  DEFAULT_CATEGORY_COLORS, DEFAULT_CATEGORY_ICONS,
} from '@/types/Types_Expenses';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

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

// ── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category?: ExpenseCategory | null }) {
  if (!category) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: category.color }}
    >
      {category.icon} {category.name}
    </span>
  );
}

// ── Expense form modal ────────────────────────────────────────────────────────

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  categories: ExpenseCategory[];
  editing: Expense | null;
}

function ExpenseFormModal({ open, onClose, onSaved, tenantId, categories, editing }: ExpenseFormModalProps) {
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
      setForm({ ...EMPTY_FORM, date: today() });
    }
    setError('');
  }, [editing, open]);

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

// ── Custom category form modal ────────────────────────────────────────────────

interface CategoryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  editing: ExpenseCategory | null;
}

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

// ── General categories picker modal ──────────────────────────────────────────

interface GeneralPickerModalProps {
  open: boolean;
  onClose: () => void;
  onAdopted: () => void;
  tenantId: string;
  alreadyAdopted: Set<string>; // general_category_id values already in tenant
}

function GeneralPickerModal({ open, onClose, onAdopted, tenantId, alreadyAdopted }: GeneralPickerModalProps) {
  const [generals, setGenerals] = useState<ExpenseCategoryGeneral[]>([]);
  const [loading, setLoading] = useState(false);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    expenseCategoriesGeneralService.getAll()
      .then(setGenerals)
      .catch(() => setError('Error al cargar categorías generales'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleAdopt = async (gen: ExpenseCategoryGeneral) => {
    setAdopting(gen.id);
    setError('');
    try {
      await expenseCategoriesService.addFromGeneral(tenantId, gen);
      onAdopted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al agregar');
    } finally {
      setAdopting(null);
    }
  };

  const available = generals.filter((g) => !alreadyAdopted.has(g.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Categorías generales</h2>
            <p className="text-xs text-gray-400 mt-0.5">Agrega las que necesites a tu negocio</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>
          )}
          {loading ? (
            <div className="flex justify-center py-8 text-gray-400 text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> Cargando...
            </div>
          ) : available.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {generals.length === 0 ? 'No hay categorías generales disponibles' : 'Ya agregaste todas las categorías generales'}
            </div>
          ) : (
            <div className="space-y-2">
              {available.map((gen) => (
                <div key={gen.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: gen.color + '22' }}
                  >
                    {gen.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{gen.name}</p>
                    {gen.description && (
                      <p className="text-xs text-gray-400 truncate">{gen.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAdopt(gen)}
                    disabled={adopting === gen.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-60 transition"
                  >
                    {adopting === gen.id ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                    Agregar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

type TabId = 'expenses' | 'categories';

export const ExpensesDashboard: React.FC = () => {
  const { tenantId } = useTenantId();
  const [tab, setTab] = useState<TabId>('expenses');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [search, setSearch] = useState('');

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [showGeneralPicker, setShowGeneralPicker] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await expenseCategoriesService.getAll(tenantId);
      setCategories(data);
    } catch {
      // non-critical
    }
  }, [tenantId]);

  const loadExpenses = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const data = await expensesService.getAll(tenantId, { ...filters, search: search || undefined });
      setExpenses(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar gastos');
    } finally {
      setLoading(false);
    }
  }, [tenantId, filters, search]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    setDeletingId(id);
    try {
      await expensesService.delete(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría? Los gastos asociados no podrán eliminarse si tienen este vínculo.')) return;
    setDeletingId(id);
    try {
      await expenseCategoriesService.delete(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  // IDs de categorías generales ya adoptadas
  const adoptedGeneralIds = new Set(
    categories.filter((c) => c.general_category_id).map((c) => c.general_category_id as string)
  );

  const totalFiltered = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-0 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <TrendingDown size={24} className="text-red-500" />
              Gastos
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {expenses.length} registro{expenses.length !== 1 ? 's' : ''} · Total: {fmt(totalFiltered)}
            </p>
          </div>
          <button
            onClick={() => { setEditingExpense(null); setShowExpenseModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition"
          >
            <Plus size={16} /> Nuevo Gasto
          </button>
        </div>

        <div className="flex gap-1 mt-4">
          {(['expenses', 'categories'] as TabId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t === 'expenses' ? <DollarSign size={15} /> : <Tag size={15} />}
              {t === 'expenses' ? 'Gastos' : 'Categorías'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* ── Expenses tab ── */}
        {tab === 'expenses' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-52">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar descripción..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-gray-400" />
                <input
                  type="date"
                  value={filters.from ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-gray-400 text-sm">—</span>
                <input
                  type="date"
                  value={filters.to ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <select
                value={filters.category_id ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value || undefined }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              <select
                value={filters.type ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as ExpenseFilters['type'] }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">Todos los tipos</option>
                {Object.entries(EXPENSE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={loadExpenses}
                className="p-2 rounded-xl border border-gray-200 hover:border-emerald-300 text-gray-500 hover:text-emerald-600 transition"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                  <RefreshCw size={18} className="animate-spin mr-2" /> Cargando...
                </div>
              ) : expenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <DollarSign size={36} className="text-gray-200" />
                  <p className="text-gray-400 text-sm font-medium">No hay gastos registrados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pago</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {expenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{exp.date}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                            {exp.description}
                            {exp.reference && (
                              <span className="ml-2 text-xs text-gray-400">#{exp.reference}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <CategoryBadge category={exp.category} />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              exp.type === 'fixed'
                                ? 'bg-blue-100 text-blue-700'
                                : exp.type === 'occasional'
                                ? 'bg-gray-100 text-gray-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {EXPENSE_TYPE_LABELS[exp.type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {PAYMENT_METHOD_LABELS[exp.payment_method]}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                            {fmt(exp.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => { setEditingExpense(exp); setShowExpenseModal(true); }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteExpense(exp.id)}
                                disabled={deletingId === exp.id}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Categories tab ── */}
        {tab === 'categories' && (
          <div className="space-y-5">
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowGeneralPicker(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition"
              >
                <Download size={15} /> Agregar generales
              </button>
              <button
                onClick={() => { setEditingCategory(null); setShowCategoryModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition"
              >
                <Plus size={15} /> Nueva personalizada
              </button>
            </div>

            {categories.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-16 gap-3">
                <Tag size={36} className="text-gray-200" />
                <p className="text-gray-400 text-sm font-medium">No hay categorías agregadas</p>
                <p className="text-gray-300 text-xs text-center max-w-xs">
                  Agrega categorías generales predefinidas o crea las tuyas propias
                </p>
              </div>
            ) : (
              <>
                {/* General (adoptadas) */}
                {categories.some((c) => c.is_general) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">Categorías generales</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {categories.filter((c) => c.is_general).map((cat) => (
                        <CategoryCard
                          key={cat.id}
                          cat={cat}
                          deletingId={deletingId}
                          onEdit={() => { setEditingCategory(cat); setShowCategoryModal(true); }}
                          onDelete={() => handleDeleteCategory(cat.id)}
                          isGeneral
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom */}
                {categories.some((c) => !c.is_general) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">Categorías personalizadas</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {categories.filter((c) => !c.is_general).map((cat) => (
                        <CategoryCard
                          key={cat.id}
                          cat={cat}
                          deletingId={deletingId}
                          onEdit={() => { setEditingCategory(cat); setShowCategoryModal(true); }}
                          onDelete={() => handleDeleteCategory(cat.id)}
                          isGeneral={false}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ExpenseFormModal
        open={showExpenseModal}
        onClose={() => { setShowExpenseModal(false); setEditingExpense(null); }}
        onSaved={loadExpenses}
        tenantId={tenantId ?? ''}
        categories={categories}
        editing={editingExpense}
      />
      <CategoryFormModal
        open={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setEditingCategory(null); }}
        onSaved={loadCategories}
        tenantId={tenantId ?? ''}
        editing={editingCategory}
      />
      <GeneralPickerModal
        open={showGeneralPicker}
        onClose={() => setShowGeneralPicker(false)}
        onAdopted={() => { loadCategories(); }}
        tenantId={tenantId ?? ''}
        alreadyAdopted={adoptedGeneralIds}
      />
    </div>
  );
};

// ── Category card (extracted to avoid repetition) ─────────────────────────────

function CategoryCard({
  cat, deletingId, onEdit, onDelete, isGeneral,
}: {
  cat: ExpenseCategory;
  deletingId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  isGeneral: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ backgroundColor: cat.color + '22' }}
      >
        {cat.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-gray-900 truncate">{cat.name}</p>
          {isGeneral && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium shrink-0">general</span>
          )}
        </div>
        <div className="w-16 h-1.5 rounded-full mt-1" style={{ backgroundColor: cat.color }} />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          disabled={deletingId === cat.id}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default ExpensesDashboard;
