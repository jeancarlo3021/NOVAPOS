import { useEffect, useState, useRef } from 'react';
import { Search, X, UserPlus, IdCard, Plus, Check } from 'lucide-react';
import { customersService, ID_TYPES, type Customer, type CustomerInput } from '@/services/customers/customersService';
import { formatCedula, cleanCedula, cedulaPlaceholder } from '@/utils/cedula';
import { CRLocationFields } from '@/components/CRLocationFields';

interface Props {
  onPick: (c: Customer | null) => void;
  selected?: Customer | null;
  onClose: () => void;
  /** 'modal' = overlay a pantalla completa (táctil). 'inline' = dropdown pegado
   *  al campo de cliente (vista de computadora). */
  variant?: 'modal' | 'inline';
}

export function POSCustomerSearch({ onPick, selected, onClose, variant = 'modal' }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try { setResults(await customersService.list(q.trim() || undefined)); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // Inline: cerrar al hacer clic afuera o con Escape (no hay backdrop que capture).
  useEffect(() => {
    if (variant !== 'inline') return;
    const onDown = (e: MouseEvent) => {
      if (showCreate) return; // el sub-modal de crear maneja su propio cierre
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showCreate) onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [variant, onClose, showCreate]);

  const panel = (
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[82vh] flex flex-col">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar cliente…"
            className="flex-1 min-w-0 text-sm focus:outline-none" />
          <button
            onClick={() => setShowCreate(true)}
            title="Crear cliente nuevo"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
          >
            <Plus size={13} /> Nuevo
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {selected && (
            <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-600">Cliente seleccionado:</p>
                <p className="text-sm font-bold text-emerald-900 truncate">{selected.name}</p>
              </div>
              <button onClick={() => onPick(null)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline">
                Quitar
              </button>
            </div>
          )}
          {loading && results.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <UserPlus size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Sin resultados</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
              >
                <Plus size={13} /> Crear cliente
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.filter(r => r.is_active).map(r => (
                <button key={r.id}
                  onClick={() => { onPick(r); onClose(); }}
                  className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition">
                  <div className="font-bold text-sm text-gray-900">{r.name}</div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    {r.identification && (
                      <span className="flex items-center gap-1">
                        <IdCard size={11} /> {r.identification}
                      </span>
                    )}
                    {r.email && <span className="truncate">{r.email}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
  );

  return (
    <>
      {variant === 'inline' ? (
        <div ref={rootRef} className="absolute left-0 top-full mt-1 z-50 w-full max-w-md">
          {panel}
        </div>
      ) : (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-3 sm:p-4 pt-14 sm:pt-20">
          {panel}
        </div>
      )}

      {showCreate && (
        <QuickCustomerCreate
          initialName={q.trim()}
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setShowCreate(false);
            onPick(c);
            onClose();
          }}
        />
      )}
    </>
  );
}

// ── Sub-modal: crear cliente rápido desde el POS ──────────────────────────────

function QuickCustomerCreate({ initialName, onClose, onCreated }: {
  initialName: string;
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const [form, setForm] = useState<CustomerInput>({
    identification_type: '01',
    identification: '',
    name: initialName,
    email: '',
    phone: '',
    province_code: '',
    canton_code: '',
    district_code: '',
    address: '',
    economic_activity_code: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const addrLen = (form.address ?? '').trim().length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.name?.trim()) { setError('Nombre requerido'); return; }
    if (addrLen > 0 && addrLen < 5) { setError('Otras señas: mínimo 5 caracteres'); return; }
    setSaving(true);
    try {
      const created = await customersService.create(form);
      onCreated(created);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Error al crear');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-black text-gray-900 flex items-center gap-2">
            <UserPlus size={18} className="text-emerald-600" /> Nuevo cliente
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre / Razón Social *</label>
            <input value={form.name ?? ''} onChange={e => set('name', e.target.value)}
              autoFocus required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Tipo ID</label>
              <select value={form.identification_type ?? '01'}
                onChange={e => set('identification_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Número</label>
              <input value={formatCedula(form.identification ?? '', form.identification_type ?? '01')}
                onChange={e => set('identification', cleanCedula(e.target.value, form.identification_type ?? '01'))}
                placeholder={cedulaPlaceholder(form.identification_type ?? '01')} inputMode="numeric"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email ?? ''}
                onChange={e => set('email', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Teléfono</label>
              <input value={form.phone ?? ''}
                onChange={e => set('phone', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Ubicación (Hacienda) */}
          <CRLocationFields
            province={form.province_code ?? ''}
            canton={form.canton_code ?? ''}
            district={form.district_code ?? ''}
            onChange={(f, v) => set(f === 'province' ? 'province_code' : f === 'canton' ? 'canton_code' : 'district_code', v)}
          />

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Actividad económica <span className="text-gray-400 font-normal">(código Hacienda)</span></label>
            <input value={form.economic_activity_code ?? ''}
              onChange={e => set('economic_activity_code', e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Ej. 620100" inputMode="numeric"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Otras señas</label>
            <textarea value={form.address ?? ''} onChange={e => set('address', e.target.value.slice(0, 250))}
              rows={2}
              placeholder="Dirección exacta (mín. 5 caracteres)"
              className={`w-full border rounded-lg px-3 py-2 text-sm ${
                addrLen > 0 && addrLen < 5 ? 'border-red-300' : 'border-gray-200'
              }`} />
            <div className="flex justify-between text-[10px] mt-0.5">
              {addrLen > 0 && addrLen < 5
                ? <span className="text-red-500">Mínimo 5 caracteres</span>
                : <span className="text-gray-400">Requerido para factura electrónica</span>}
              <span className="text-gray-400">{(form.address ?? '').length}/250</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? 'Creando...' : <><Check size={14} /> Crear y usar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default POSCustomerSearch;
