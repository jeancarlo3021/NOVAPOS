'use client';

import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, Truck } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/context/AuthContext';
import { MANAGER_ROLES } from '@/types/Types_Users';

const PLATFORMS: { key: string; label: string; emoji: string }[] = [
  { key: 'uber_pct', label: 'Uber', emoji: '🟢' },
  { key: 'didi_pct', label: 'Didi', emoji: '🟠' },
  { key: 'pedidosya_pct', label: 'PedidosYa', emoji: '🔴' },
  { key: 'otro_pct', label: 'Otro', emoji: '📦' },
];

export const DeliverySettings: React.FC = () => {
  const { settings, updateSettings, loading } = useSettings('delivery');
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes((user?.role ?? '') as any);
  const [form, setForm] = useState<Record<string, string>>({ uber_pct: '', didi_pct: '', pedidosya_pct: '', otro_pct: '' });
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        uber_pct: String((settings as any).uber_pct ?? ''),
        didi_pct: String((settings as any).didi_pct ?? ''),
        pedidosya_pct: String((settings as any).pedidosya_pct ?? ''),
        otro_pct: String((settings as any).otro_pct ?? ''),
      });
    }
  }, [settings]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      uber_pct: parseFloat(form.uber_pct) || 0,
      didi_pct: parseFloat(form.didi_pct) || 0,
      pedidosya_pct: parseFloat(form.pedidosya_pct) || 0,
      otro_pct: parseFloat(form.otro_pct) || 0,
    });
    setSuccess(true); setTimeout(() => setSuccess(false), 1500);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Truck size={24} className="text-orange-600" /> Delivery</h2>
        <p className="text-gray-500 text-sm">Comisión (%) que cada plataforma te descuenta. Se aplica automáticamente al cobrar una venta por delivery.</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-2 text-sm">
          <CheckCircle size={16} /> Guardado
        </div>
      )}

      <form onSubmit={save} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {PLATFORMS.map(p => (
          <div key={p.key} className="flex items-center justify-between gap-4">
            <label className="font-bold text-gray-700 flex items-center gap-2">{p.emoji} {p.label}</label>
            <div className="relative w-32">
              <input type="number" min="0" max="100" step="0.5"
                value={form[p.key]} onChange={e => setForm(f => ({ ...f, [p.key]: e.target.value }))}
                disabled={!isManager || loading} placeholder="0"
                className="w-full text-right pr-7 pl-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400 disabled:bg-gray-100" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-gray-400">Al elegir la plataforma en el cobro, se resta este % del total y se muestra el neto. La venta no se suma al cierre de caja.</p>
        <button type="submit" disabled={loading || !isManager}
          className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2">
          <Save size={16} /> Guardar
        </button>
      </form>
    </div>
  );
};

export default DeliverySettings;
