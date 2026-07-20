import React, { useCallback, useEffect, useState } from 'react';
import { Navigation, Truck, Save, RefreshCw, Loader2, MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface TruckRow { id: string; name: string; code?: string | null }
interface TruckCfg { enabled: boolean; notes: string }
interface TrackingCfg {
  enabled: boolean;                       // interruptor maestro
  notes: string;                          // notas generales
  trucks: Record<string, TruckCfg>;       // config por camión
}

const DEFAULT_CFG: TrackingCfg = { enabled: true, notes: '', trucks: {} };

// Interruptor tipo switch reutilizable.
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label?: string }> = ({ on, onChange, label }) => (
  <button type="button" onClick={() => onChange(!on)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-emerald-500' : 'bg-gray-300'}`}
    title={label}>
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

/** Módulo (solo admin) para activar/desactivar el rastreador por camión y poner notas. */
export const TrackingSettings: React.FC = () => {
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [cfg, setCfg] = useState<TrackingCfg>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tk, saved] = await Promise.all([
        apiFetch<TruckRow[]>('/routes/trucks').catch(() => []),
        apiFetch<Partial<TrackingCfg>>('/settings/tracking').catch(() => ({} as Partial<TrackingCfg>)),
      ]);
      setTrucks(Array.isArray(tk) ? tk : []);
      setCfg({
        enabled: saved?.enabled ?? true,
        notes: saved?.notes ?? '',
        trucks: saved?.trucks ?? {},
      });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const truckCfg = (id: string): TruckCfg => cfg.trucks[id] ?? { enabled: true, notes: '' };
  const setTruckCfg = (id: string, patch: Partial<TruckCfg>) =>
    setCfg(prev => ({ ...prev, trucks: { ...prev.trucks, [id]: { ...truckCfg(id), ...patch } } }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await apiFetch('/settings/tracking', { method: 'PUT', body: JSON.stringify(cfg) });
      setMsg({ kind: 'ok', text: 'Configuración de rastreo guardada.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 size={22} className="animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="bg-linear-to-r from-cyan-600 to-blue-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><Navigation size={22} /></div>
          <div>
            <h1 className="text-xl font-black">Rastreo de camiones</h1>
            <p className="text-white/80 text-sm">Activá o desactivá el rastreador y agregá notas</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`text-sm rounded-xl px-4 py-2.5 border ${msg.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* Interruptor maestro + notas generales */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="font-black text-gray-900">Rastreo activado</p>
            <p className="text-xs text-gray-500">Interruptor general. Si está apagado, ningún camión reporta ubicación.</p>
          </div>
          <Toggle on={cfg.enabled} onChange={v => setCfg(p => ({ ...p, enabled: v }))} label="Rastreo general" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Notas generales</label>
          <textarea value={cfg.notes} onChange={e => setCfg(p => ({ ...p, notes: e.target.value.slice(0, 500) }))}
            rows={3} placeholder="Ej. horario de rastreo, instrucciones para los repartidores…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
          <p className="text-[11px] text-gray-400 text-right">{cfg.notes.length}/500</p>
        </div>
      </div>

      {/* Config por camión */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Truck size={16} className="text-gray-500" />
          <h2 className="text-sm font-black text-gray-900">Por camión</h2>
          <button onClick={load} className="ml-auto p-1.5 rounded-lg hover:bg-gray-100" title="Recargar"><RefreshCw size={15} className="text-gray-500" /></button>
        </div>
        {trucks.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            No hay camiones. Creá camiones (bodegas tipo camión) en Distribución.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {trucks.map(t => {
              const tc = truckCfg(t.id);
              const off = !cfg.enabled || !tc.enabled;
              return (
                <div key={t.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${off ? 'bg-gray-100 text-gray-400' : 'bg-cyan-100 text-cyan-600'}`}>
                      <MapPin size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 truncate">{t.name}</p>
                      <p className="text-xs text-gray-400">{tc.enabled ? 'Rastreo activo' : 'Rastreo apagado'}{!cfg.enabled && ' · general apagado'}</p>
                    </div>
                    <Toggle on={tc.enabled} onChange={v => setTruckCfg(t.id, { enabled: v })} label={`Rastreo ${t.name}`} />
                  </div>
                  <input value={tc.notes} onChange={e => setTruckCfg(t.id, { notes: e.target.value.slice(0, 200) })}
                    placeholder="Notas del camión (ej. chofer, placa, observaciones)…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Guardar */}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold text-sm">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
        </button>
      </div>
    </div>
  );
};

export default TrackingSettings;
