import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Search, Filter, RefreshCw,
  DollarSign, TrendingDown, Tag, Download, FileText,
  Bell, RotateCw, Power, AlertCircle, Check,
} from 'lucide-react';
import { parseFeXml, medioPagoToMethod } from '@/services/hacienda/feReception';
import { useTenantId } from '@/hooks/useTenant';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { cacheSet, cacheGet, cacheKey } from '@/utils/offlineCache';
import {
  expensesService,
  expenseCategoriesService,
  recurringExpensesService,
  calcOverduePeriods,
  getNextDueDate,
} from '@/services/expenses/expensesService';
import type {
  Expense, ExpenseCategory,
  ExpenseFormData, ExpenseFilters,
  RecurringExpense,
} from '@/types/Types_Expenses';
import {
  PAYMENT_METHOD_LABELS, EXPENSE_TYPE_LABELS,
  FREQUENCY_LABELS,
} from '@/types/Types_Expenses';

// Sub-components
import CategoryBadge from './components/CategoryBadge';
import CategoryCard from './components/CategoryCard';
import RemindersBanner from './components/RemindersBanner';
import ExpenseFormModal from './components/ExpenseFormModal';
import CategoryFormModal from './components/CategoryFormModal';
import GeneralPickerModal from './components/GeneralPickerModal';
import RecurringFormModal from './components/RecurringFormModal';
import RegisterRecurringModal from './components/RegisterRecurringModal';

// ── Offline expense queue (localStorage) ─────────────────────────────────────
interface PendingExpense { localId: string; form: ExpenseFormData; tenantId: string; createdAt: string }
const pendingKey = (tid: string) => `expense_pending_${tid}`;
function getPendingExpenses(tid: string): PendingExpense[] {
  try { return JSON.parse(localStorage.getItem(pendingKey(tid)) ?? '[]'); } catch { return []; }
}
function removePendingExpense(tid: string, localId: string) {
  const list = getPendingExpenses(tid).filter(p => p.localId !== localId);
  localStorage.setItem(pendingKey(tid), JSON.stringify(list));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

// ── Main Dashboard ────────────────────────────────────────────────────────────

type TabId = 'expenses' | 'recurring' | 'categories';

export const ExpensesDashboard: React.FC = () => {
  const { tenantId } = useTenantId();
  const { canDo } = useRolePermissions();
  const canCreate = canDo('expenses', 'create');
  const canEdit   = canDo('expenses', 'edit');
  const canDelete = canDo('expenses', 'delete');
  const [tab, setTab] = useState<TabId>('expenses');
  const pendingCount = tenantId ? getPendingExpenses(tenantId).length : 0;

  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [recurring,  setRecurring]  = useState<RecurringExpense[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringError,   setRecurringError]   = useState('');
  const [error, setError] = useState('');

  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [search,  setSearch]  = useState('');

  const [showExpenseModal,    setShowExpenseModal]    = useState(false);
  const [editingExpense,      setEditingExpense]       = useState<Expense | null>(null);
  const [expensePrefill,      setExpensePrefill]       = useState<Partial<ExpenseFormData> | undefined>(undefined);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  // Importar factura electrónica (XML) del proveedor → prellenar un gasto.
  const handleImportXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // permite re-subir el mismo archivo
    if (!file) return;
    try {
      const xml = await file.text();
      const fe = parseFeXml(xml);
      const factura = fe.consecutivo || fe.clave.slice(-10) || 's/n';
      const descLineas = fe.lineas.map(l => l.detalle).filter(Boolean).slice(0, 3).join(', ');
      setEditingExpense(null);
      setExpensePrefill({
        description: `${fe.emisor.nombre || 'Proveedor'} · Factura ${factura}${descLineas ? ` (${descLineas})` : ''}`,
        amount: String(fe.total || ''),
        date: (fe.fecha || '').slice(0, 10) || undefined as any,
        payment_method: medioPagoToMethod(fe.medioPago) as any,
        reference: fe.clave || undefined as any,
        notes: fe.lineas.map(l => `${l.cantidad} x ${l.detalle} = ${l.montoTotal}`).join('\n'),
      });
      setShowExpenseModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo leer el XML');
    }
  };
  const [showCategoryModal,   setShowCategoryModal]   = useState(false);
  const [editingCategory,     setEditingCategory]     = useState<ExpenseCategory | null>(null);
  const [showGeneralPicker,   setShowGeneralPicker]   = useState(false);
  const [showRecurringModal,  setShowRecurringModal]  = useState(false);
  const [editingRecurring,    setEditingRecurring]    = useState<RecurringExpense | null>(null);
  const [registeringRecurring, setRegisteringRecurring] = useState<RecurringExpense | null>(null);
  const [deletingId,          setDeletingId]          = useState<string | null>(null);
  const [togglingId,          setTogglingId]          = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!tenantId) return;
    const ck = cacheKey(tenantId, 'expense_categories');
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<ExpenseCategory[]>(ck);
        if (cached) setCategories(cached);
        return;
      }
      const data = await expenseCategoriesService.getAll(tenantId);
      setCategories(data);
      cacheSet(ck, data);
    } catch {
      const cached = cacheGet<ExpenseCategory[]>(ck);
      if (cached) setCategories(cached);
    }
  }, [tenantId]);

  const loadExpenses = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    const ck = cacheKey(tenantId, 'expenses_list');
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<typeof expenses>(ck);
        setExpenses(cached ?? []);
        if (!cached) setError('Sin conexión — sin datos en caché');
        return;
      }
      // Sync any pending offline expenses first
      const pending = getPendingExpenses(tenantId);
      for (const p of pending) {
        try {
          await expensesService.create(p.tenantId, p.form);
          removePendingExpense(tenantId, p.localId);
        } catch { /* leave in queue if sync fails */ }
      }
      const data = await expensesService.getAll(tenantId, { ...filters, search: search || undefined });
      setExpenses(data);
      if (!filters.from && !filters.to && !filters.category_id && !filters.type && !search) {
        cacheSet(ck, data);
      }
    } catch (err: unknown) {
      const cached = cacheGet<typeof expenses>(ck);
      if (cached) { setExpenses(cached); }
      else { setError(err instanceof Error ? err.message : 'Error al cargar gastos'); }
    } finally {
      setLoading(false);
    }
  }, [tenantId, filters, search]);

  const loadRecurring = useCallback(async () => {
    if (!tenantId) return;
    setRecurringLoading(true);
    setRecurringError('');
    const ck = cacheKey(tenantId, 'recurring_expenses');
    try {
      if (!navigator.onLine) {
        const cached = cacheGet<typeof recurring>(ck);
        if (cached) setRecurring(cached);
        return;
      }
      const data = await recurringExpensesService.getAll(tenantId);
      setRecurring(data);
      cacheSet(ck, data);
    } catch (err: unknown) {
      const cached = cacheGet<typeof recurring>(ck);
      if (cached) { setRecurring(cached); return; }
      const msg = err instanceof Error ? err.message : 'Error al cargar recurrentes';
      setRecurringError(msg.includes('relation') || msg.includes('does not exist')
        ? 'Tabla no encontrada. Ejecuta la migración SQL indicada en expensesService.ts'
        : msg);
    } finally {
      setRecurringLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadExpenses();  }, [loadExpenses]);
  useEffect(() => { loadRecurring(); }, [loadRecurring]);

  // Recurring expenses that are currently due (overdue periods > 0, active)
  const dueRecurring = recurring.filter(r => r.is_active && calcOverduePeriods(r) > 0);

  const handleDeleteRecurring = async (id: string) => {
    if (!confirm('¿Eliminar este gasto recurrente? Los gastos ya registrados no se eliminarán.')) return;
    setDeletingId(id);
    try {
      await recurringExpensesService.delete(id);
      setRecurring(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleRecurring = async (r: RecurringExpense) => {
    setTogglingId(r.id);
    try {
      await recurringExpensesService.toggleActive(r.id, !r.is_active);
      setRecurring(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setTogglingId(null);
    }
  };

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
          {canCreate && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => xmlInputRef.current?.click()}
                title="Registrar un gasto desde la factura electrónica (XML) del proveedor"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
              >
                <FileText size={16} /> Importar XML
              </button>
              <button
                onClick={() => { setEditingExpense(null); setExpensePrefill(undefined); setShowExpenseModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition"
              >
                <Plus size={16} /> Nuevo Gasto
              </button>
            </div>
          )}
          <input ref={xmlInputRef} type="file" accept=".xml,text/xml,application/xml" className="hidden"
            onChange={handleImportXml} />
        </div>

        <div className="flex gap-1 mt-4 flex-wrap">
          <button onClick={() => setTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === 'expenses' ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            <DollarSign size={15} /> Gastos
          </button>
          <button onClick={() => setTab('recurring')}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === 'recurring' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            <Bell size={15} /> Recurrentes
            {dueRecurring.length > 0 && (
              <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-black flex items-center justify-center ${tab === 'recurring' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'}`}>
                {dueRecurring.length}
              </span>
            )}
          </button>
          <button onClick={() => setTab('categories')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === 'categories' ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            <Tag size={15} /> Categorías
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* ── Expenses tab ── */}
        {tab === 'expenses' && (
          <div className="space-y-4">
            {/* Pending offline expenses banner */}
            {pendingCount > 0 && (
              <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
                <span className="font-semibold">
                  {pendingCount} gasto{pendingCount !== 1 ? 's' : ''} guardado{pendingCount !== 1 ? 's' : ''} localmente — se sincronizarán al conectarte a internet
                </span>
              </div>
            )}
            {/* Reminders banner */}
            <RemindersBanner
              due={dueRecurring}
              onRegister={r => setRegisteringRecurring(r)}
            />

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
                              {canEdit && (
                                <button
                                  onClick={() => { setEditingExpense(exp); setShowExpenseModal(true); }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteExpense(exp.id)}
                                  disabled={deletingId === exp.id}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
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

        {/* ── Recurring tab ── */}
        {tab === 'recurring' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => { setEditingRecurring(null); setShowRecurringModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition"
              >
                <Plus size={15} /> Nuevo gasto recurrente
              </button>
            </div>

            {recurringError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Error al cargar gastos recurrentes</p>
                  <p className="text-xs mt-0.5">{recurringError}</p>
                </div>
              </div>
            )}

            {recurringLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                <RefreshCw size={18} className="animate-spin mr-2" /> Cargando...
              </div>
            ) : recurring.length === 0 && !recurringError ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-16 gap-3">
                <Bell size={36} className="text-gray-200" />
                <p className="text-gray-400 text-sm font-medium">No hay gastos recurrentes</p>
                <p className="text-gray-300 text-xs text-center max-w-xs">
                  Agrega gastos fijos como luz, agua, internet, alquiler y el sistema te recordará registrarlos cada mes.
                </p>
                <button
                  onClick={() => { setEditingRecurring(null); setShowRecurringModal(true); }}
                  className="mt-1 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition"
                >
                  <Plus size={15} /> Crear primero
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recurring.map(r => {
                  const periods = calcOverduePeriods(r);
                  const nextDue = getNextDueDate(r);
                  const isDue   = periods > 0;
                  return (
                    <div key={r.id} className={`bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-4 transition ${
                      !r.is_active ? 'border-gray-100 opacity-60' : isDue ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'
                    }`}>
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ backgroundColor: (r.category?.color ?? '#6b7280') + '22' }}
                      >
                        {r.category?.icon ?? '💰'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 truncate">{r.description}</p>
                          {!r.is_active && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">inactivo</span>
                          )}
                          {isDue && r.is_active && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 font-semibold rounded-full">
                              {periods === 1 ? '1 pago pendiente' : `${periods} pagos pendientes`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                          <span className="font-semibold text-gray-700">
                            ₡{Number(r.default_amount).toLocaleString('es-CR', { minimumFractionDigits: 0 })}
                          </span>
                          <span>{FREQUENCY_LABELS[r.frequency]}</span>
                          {r.category && (
                            <span className="px-1.5 py-0.5 rounded-full text-white text-xs" style={{ backgroundColor: r.category.color }}>
                              {r.category.name}
                            </span>
                          )}
                          {r.is_active && (
                            <span className={isDue ? 'text-amber-600 font-semibold' : 'text-gray-400'}>
                              {isDue ? `Vencido: ${nextDue}` : `Próximo: ${nextDue}`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {r.is_active && isDue && (
                          <button
                            onClick={() => setRegisteringRecurring(r)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition"
                          >
                            <Check size={11} /> Registrar
                          </button>
                        )}
                        <button onClick={() => handleToggleRecurring(r)} disabled={togglingId === r.id}
                          className={`p-1.5 rounded-lg transition disabled:opacity-40 ${r.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-400 hover:bg-gray-100'}`}
                          title={r.is_active ? 'Desactivar' : 'Activar'}>
                          {togglingId === r.id ? <RotateCw size={14} className="animate-spin" /> : <Power size={14} />}
                        </button>
                        <button onClick={() => { setEditingRecurring(r); setShowRecurringModal(true); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDeleteRecurring(r.id)} disabled={deletingId === r.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
        onClose={() => { setShowExpenseModal(false); setEditingExpense(null); setExpensePrefill(undefined); }}
        onSaved={loadExpenses}
        tenantId={tenantId ?? ''}
        categories={categories}
        editing={editingExpense}
        prefill={expensePrefill}
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
      <RecurringFormModal
        open={showRecurringModal}
        onClose={() => { setShowRecurringModal(false); setEditingRecurring(null); }}
        onSaved={loadRecurring}
        tenantId={tenantId ?? ''}
        categories={categories}
        editing={editingRecurring}
      />
      {registeringRecurring && (
        <RegisterRecurringModal
          recurring={registeringRecurring}
          tenantId={tenantId ?? ''}
          onClose={() => setRegisteringRecurring(null)}
          onRegistered={() => {
            setRegisteringRecurring(null);
            loadExpenses();
            loadRecurring();
          }}
        />
      )}
    </div>
  );
};

export default ExpensesDashboard;
