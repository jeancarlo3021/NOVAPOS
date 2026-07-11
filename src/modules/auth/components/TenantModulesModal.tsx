'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Check, Layers, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

// Módulos que el super-admin puede prender/apagar por empresa (encima del plan).
const MODULE_GROUPS: { group: string; items: { key: string; label: string }[] }[] = [
  { group: 'Principales', items: [
    { key: 'pos', label: 'Punto de Venta' },
    { key: 'inventory', label: 'Inventario' },
    { key: 'reports', label: 'Reportes' },
    { key: 'expenses', label: 'Gastos' },
    { key: 'purchases', label: 'Compras' },
    { key: 'accounts_payable', label: 'Cuentas por Pagar' },
    { key: 'accounts_receivable', label: 'Cuentas por Cobrar (crédito)' },
    { key: 'customers', label: 'Clientes' },
    { key: 'users', label: 'Usuarios' },
    { key: 'settings', label: 'Configuración' },
  ]},
  { group: 'Opcionales', items: [
    { key: 'promotions', label: 'Promociones' },
    { key: 'labels', label: 'Etiquetas' },
    { key: 'recipes', label: 'Recetas' },
    { key: 'hr', label: 'Recursos Humanos' },
    { key: 'distribution', label: 'Distribución / Repartidor' },
    { key: 'tables', label: 'Mesas' },
    { key: 'restaurant', label: 'Restaurante' },
    { key: 'multi_branch', label: 'Multi-sucursal' },
    { key: 'pos_kiosk', label: 'Modo Kiosk (PIN)' },
  ]},
  { group: 'Facturación electrónica', items: [
    { key: 'electronic_invoice', label: 'Factura Electrónica (Hacienda)' },
    { key: 'fe_pos', label: 'POS Electrónico' },
  ]},
  { group: 'Pagos en el POS', items: [
    { key: 'pos_card', label: 'Tarjeta' },
    { key: 'pos_sinpe', label: 'SINPE' },
    { key: 'pos_discount', label: 'Descuentos' },
  ]},
];

export const TenantModulesModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [base, setBase] = useState<Record<string, any>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ base: Record<string, any>; overrides: Record<string, boolean> }>(`/admin/tenants/${owner.id}/features`);
      setBase(data?.base ?? {});
      setOverrides({ ...(data?.overrides ?? {}) });
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudieron cargar los módulos', 'error');
    } finally { setLoading(false); }
  }, [owner.id, onToast]);

  useEffect(() => { load(); }, [load]);

  // Valor efectivo: override si existe, si no el del plan base.
  const effective = (key: string): boolean =>
    key in overrides ? !!overrides[key] : !!base[key];
  const isOverridden = (key: string) => key in overrides;

  const toggle = (key: string) =>
    setOverrides(prev => ({ ...prev, [key]: !effective(key) }));

  const reset = (key: string) =>
    setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/tenants/${owner.id}/feature-overrides`, {
        method: 'PUT', body: JSON.stringify({ overrides }),
      });
      onToast('Módulos actualizados. El cliente los verá al volver a entrar.', 'success');
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-violet-600" />
            <div>
              <h2 className="text-lg font-black text-gray-900">Módulos personalizados</h2>
              <p className="text-xs text-gray-400">{owner.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p className="text-xs text-gray-500 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
            Prendé o apagá módulos <b>solo para esta empresa</b>, encima de lo que trae su plan.
            Los que no toques quedan como el plan base. <b>↺</b> revierte al plan.
          </p>
          {loading ? (
            <div className="flex justify-center py-10"><RefreshCw size={22} className="animate-spin text-gray-300" /></div>
          ) : (
            MODULE_GROUPS.map(g => (
              <div key={g.group}>
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">{g.group}</p>
                <div className="space-y-1.5">
                  {g.items.map(m => {
                    const on = effective(m.key);
                    const ov = isOverridden(m.key);
                    return (
                      <div key={m.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${ov ? 'border-violet-200 bg-violet-50/40' : 'border-gray-100'}`}>
                        <span className="flex-1 text-sm font-semibold text-gray-800">{m.label}</span>
                        {ov && (
                          <>
                            <span className="text-[10px] font-bold text-violet-600 uppercase">personalizado</span>
                            <button onClick={() => reset(m.key)} title="Volver al plan base"
                              className="text-gray-400 hover:text-gray-700"><RotateCcw size={14} /></button>
                          </>
                        )}
                        <button type="button" onClick={() => toggle(m.key)}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                          <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</> : <><Check size={14} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenantModulesModal;
