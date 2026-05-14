import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Plus } from 'lucide-react';
import {
  expenseCategoriesService,
  expenseCategoriesGeneralService,
} from '@/services/expenses/expensesService';
import type { ExpenseCategoryGeneral } from '@/types/Types_Expenses';
import type { GeneralPickerModalProps } from './types';

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

export default GeneralPickerModal;
