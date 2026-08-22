'use client';

import React, { useState, useEffect } from 'react';
import { Save, LockKeyhole, Unlock, AlertCircle } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';

/**
 * Métodos que el POS puede ofrecer al cobrar.
 *
 * La lista efectiva vive en la configuración de FACTURA (`receipt.paymentMethods`),
 * que es la que lee el POS al abrir el cobro. Acá se edita esa misma lista: si se
 * guardara en otro lado, se elegirían métodos que la caja nunca mostraría.
 */
const ALL_METHODS: Array<{ id: string; name: string; icon: string; hint: string }> = [
  { id: 'cash',        name: 'Efectivo',            icon: '💵', hint: 'Siempre disponible como respaldo' },
  { id: 'card',        name: 'Tarjeta',             icon: '💳', hint: 'Datáfono' },
  { id: 'sinpe',       name: 'SINPE Móvil',         icon: '📱', hint: 'Hacienda: código 06' },
  { id: 'credit',      name: 'Crédito',             icon: '🤝', hint: 'Requiere Cuentas por Cobrar y cliente registrado' },
  { id: 'mixed',       name: 'Pago mixto',          icon: '🧾', hint: 'Combinar varios medios en un mismo cobro' },
  { id: 'check',       name: 'Cheque',              icon: '🏦', hint: 'Hacienda: código 03' },
  { id: 'transfer',    name: 'Transferencia',       icon: '🔁', hint: 'Hacienda: código 04' },
  { id: 'third_party', name: 'Recaudado por 3ros',  icon: '👥', hint: 'Hacienda: código 05' },
  { id: 'digital',     name: 'Plataforma digital',  icon: '🌐', hint: 'Hacienda: código 07' },
  { id: 'other',       name: 'Otros',               icon: '➕', hint: 'Hacienda: código 99' },
];

const DEFAULT_METHODS = ['cash', 'card', 'sinpe', 'credit', 'mixed'];

export const PaymentSettings: React.FC = () => {
  const { settings, updateSettings, loading } = useSettings('payments');
  // La lista que realmente usa el POS.
  const receipt = useSettings('receipt');
  const [enabled, setEnabled] = useState<string[]>(DEFAULT_METHODS);
  // Negocios que no llevan control de efectivo: no cuentan fondo ni arquean, y
  // la pantalla de apertura solo estorba.
  const [skipCashSession, setSkipCashSession] = useState(false);

  useEffect(() => {
    if (settings) setSkipCashSession(settings.skipCashSession === true);
  }, [settings]);

  useEffect(() => {
    const list = (receipt.settings as any)?.paymentMethods;
    if (Array.isArray(list)) setEnabled(list);
  }, [receipt.settings]);

  const toggleMethod = (id: string) => {
    // Efectivo no se puede apagar: si no, un mal guardado deja la caja sin
    // ninguna forma de cobrar.
    if (id === 'cash') return;
    setEnabled(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    const list = enabled.includes('cash') ? enabled : ['cash', ...enabled];
    await updateSettings({ ...(settings ?? {}), paymentMethods: list, skipCashSession });
    // Lo que lee el POS: se guarda sobre la config de factura sin pisar el resto.
    await receipt.updateSettings({ ...((receipt.settings as any) ?? {}), paymentMethods: list });
    // El POS lee esto al arrancar y offline, donde no puede consultar el servidor.
    localStorage.setItem('pos_auto_open_session', skipCashSession ? '1' : '0');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Configuración de Pagos</h2>
        <p className="text-gray-500">Gestiona los métodos de pago disponibles</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-2">
        <p className="text-sm font-bold text-gray-500 mb-2">
          Los métodos marcados son los que aparecen en la pantalla de cobro del POS.
        </p>
        {ALL_METHODS.map(method => {
          const on = enabled.includes(method.id);
          const locked = method.id === 'cash';
          return (
            <div key={method.id}
              className={`flex items-center justify-between gap-3 p-3 sm:p-4 border rounded-lg ${
                on ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl sm:text-3xl shrink-0">{method.icon}</span>
                <span className="min-w-0">
                  <span className="block font-black text-gray-900">{method.name}</span>
                  <span className="block text-xs font-semibold text-gray-400">{method.hint}</span>
                </span>
              </div>
              <button
                onClick={() => toggleMethod(method.id)}
                disabled={locked}
                className={`px-4 py-2 rounded-lg font-black text-sm transition shrink-0 ${
                  locked ? 'bg-emerald-100 text-emerald-700 cursor-default'
                    : on ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {locked ? 'Siempre' : on ? 'Habilitado' : 'Deshabilitado'}
              </button>
            </div>
          );
        })}
        <p className="flex items-start gap-1.5 text-xs font-bold text-gray-400 pt-1">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          Crédito además necesita el módulo de Cuentas por Cobrar y un cliente registrado
          en la venta; sin eso no aparece aunque esté habilitado acá.
        </p>
      </div>

      {/* Control de caja */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              skipCashSession ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
              {skipCashSession ? <Unlock size={20} /> : <LockKeyhole size={20} />}
            </span>
            <div className="min-w-0">
              <p className="font-black text-gray-900">No abrir caja</p>
              <p className="text-sm text-gray-500">
                Para negocios que no llevan control de efectivo. El POS no pide apertura:
                si no hay caja abierta, se abre sola con fondo ₡0 y se puede cobrar de una.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                El cierre sigue disponible por si algún día querés arquear; solo deja de ser obligatorio.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSkipCashSession(v => !v)}
            className={`px-4 py-2 rounded-lg font-semibold transition shrink-0 ${
              skipCashSession
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {skipCashSession ? 'Activado' : 'Desactivado'}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition"
        >
          <Save size={20} />
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
};