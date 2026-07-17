'use client';

import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, Eye, EyeOff, Lock, Percent } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { formatCedula, cleanCedula } from '@/utils/cedula';
import { useAuth } from '@/context/AuthContext';
import { MANAGER_ROLES } from '@/types/Types_Users';

const DEFAULTS = {
  businessName: '',
  ruc: '',
  cedula: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  taxEnabled: true,
  taxPercentage: 13,
  // Apertura/cierre de caja. Si false, el POS vende sin caja (sesión automática).
  cashManagementEnabled: true,
  currency: 'CRC',
  timezone: 'America/Costa_Rica',
  void_pin: '',
  close_report_emails: '',
  // Régimen simplificado: imprime "Autorizado mediante oficio 1197" al pie.
  // Solo aplica si NO se emite Facturación Electrónica.
  simplificado: false,
  // Régimen tradicional: imprime "Régimen Tradicional" al pie. Mutuamente
  // excluyente con el simplificado.
  tradicional: false,
  // Límite máximo de descuento (%) que los cajeros pueden aplicar en el POS.
  // Owner/admin/gerente pueden superarlo siempre.
  maxDiscountPercent: 100,
};

export const GeneralSettings: React.FC = () => {
  const { settings, updateSettings, loading, error } = useSettings('general');
  const { user, planFeatures } = useAuth();
  const isManager = MANAGER_ROLES.includes((user?.role ?? '') as any);
  const planHasFe = !!planFeatures?.electronic_invoice;
  const [formData, setFormData] = useState(DEFAULTS);
  const [success, setSuccess] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(prev => ({ ...prev, ...settings }));
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'taxPercentage' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;  // Solo owner/admin/gerente pueden guardar
    setSuccess(false);
    try {
      await updateSettings(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      // error already set by hook
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Configuración General</h2>
        <p className="text-gray-500">Información básica del negocio</p>
      </div>

      {!isManager && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
          <Lock size={15} className="mt-0.5 shrink-0" />
          <span>
            Solo el <strong>propietario, administrador o gerente</strong> puede modificar esta
            configuración. Estás viéndola en modo lectura.
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="text-red-600 shrink-0" size={20} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
          <CheckCircle className="text-emerald-600 shrink-0" size={20} />
          <p className="text-emerald-700 text-sm font-semibold">Configuración guardada correctamente</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">

        {planHasFe && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <Lock size={16} className="shrink-0 mt-0.5" />
            <span>Con <b>Facturación Electrónica</b> activa, los datos fiscales del negocio se toman de <b>Facturación Electrónica → Datos del emisor</b> (y de ahí salen para el ticket). Editálos ahí.</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del Negocio</label>
          <input type="text" name="businessName" value={formData.businessName} onChange={handleChange} disabled={planHasFe}
            placeholder="Mi Restaurante"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Cédula Jurídica / RUC</label>
            <input type="text" name="ruc" value={formatCedula(formData.ruc ?? '', '02')}
              onChange={e => setFormData(prev => ({ ...prev, ruc: cleanCedula(e.target.value, '02') }))} disabled={planHasFe}
              inputMode="numeric" placeholder="3-101-123456"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" />
            <p className="text-xs text-gray-400 mt-1">Para personas jurídicas / empresas</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Cédula (Física)</label>
            <input type="text" name="cedula" value={formatCedula(formData.cedula ?? '', '01')}
              onChange={e => setFormData(prev => ({ ...prev, cedula: cleanCedula(e.target.value, '01') }))} disabled={planHasFe}
              inputMode="numeric" placeholder="1-1234-5678"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" />
            <p className="text-xs text-gray-400 mt-1">Cédula del propietario (opcional)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} disabled={planHasFe}
              placeholder="info@negocio.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Teléfono</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} disabled={planHasFe}
              placeholder="+506 2234-5678"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Dirección</label>
          <input type="text" name="address" value={formData.address} onChange={handleChange} disabled={planHasFe}
            placeholder="Calle Principal 123"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Correos para el cierre diario</label>
          <input type="text" name="close_report_emails" value={(formData as any).close_report_emails ?? ''} onChange={handleChange}
            placeholder="correo1@x.com, correo2@y.com"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition" />
          <p className="text-xs text-gray-400 mt-1">Se envía el cierre de caja (y distribución) por correo. Separá varios con coma.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Ciudad / Cantón</label>
          <input type="text" name="city" value={formData.city} onChange={handleChange} disabled={planHasFe}
            placeholder="San José"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" />
        </div>

        {/* Impuesto de Ventas */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Impuesto de Ventas (IVA) — guía</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formData.taxEnabled
                  ? `Activo — ${formData.taxPercentage}% es el valor sugerido al crear productos`
                  : 'Desactivado — los productos nuevos no sugieren IVA'}
              </p>
              <p className="text-[11px] text-blue-600 mt-1">
                ℹ Este porcentaje es solo la <strong>guía</strong> que se propone en el formulario del producto.
                No hay un IVA fijo: el impuesto real se define en cada producto.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, taxEnabled: !prev.taxEnabled }))}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                formData.taxEnabled ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                  formData.taxEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {formData.taxEnabled && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Porcentaje de impuesto</label>
              <div className="relative w-40">
                <input
                  type="number"
                  name="taxPercentage"
                  value={formData.taxPercentage}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">%</span>
              </div>
            </div>
          )}
        </div>

        {/* Apertura / cierre de caja */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Apertura y cierre de caja</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formData.cashManagementEnabled
                  ? 'Activo — el POS pide abrir caja para cobrar y permite cerrarla con arqueo'
                  : 'Desactivado — se vende sin abrir/cerrar caja (se maneja una sesión automática)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, cashManagementEnabled: !prev.cashManagementEnabled }))}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                formData.cashManagementEnabled ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                  formData.cashManagementEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Moneda</label>
            <select name="currency" value={formData.currency} onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition bg-white">
              <option value="CRC">CRC (₡ Colón costarricense)</option>
            </select>
          </div>
        </div>

        {/* Régimen simplificado — solo si el plan NO tiene FE activa */}
        {!planHasFe && (
          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/50">
              <input
                type="checkbox"
                checked={!!formData.simplificado}
                onChange={e => setFormData(prev => ({ ...prev, simplificado: e.target.checked, tradicional: e.target.checked ? false : prev.tradicional }))}
                className="mt-1 w-5 h-5 rounded text-amber-600 focus:ring-2 focus:ring-amber-400"
                id="cfg-simplificado"
                disabled={!isManager}
              />
              <label htmlFor="cfg-simplificado" className="flex-1 cursor-pointer">
                <p className="font-bold text-amber-900 text-sm">Régimen Simplificado</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Imprime al pie de cada tiquete: <em>"Autorizado mediante oficio 1197 régimen simplificado"</em>.
                  Solo aplica a negocios que NO emiten Facturación Electrónica.
                </p>
              </label>
            </div>

            {/* Régimen Tradicional (mutuamente excluyente con el simplificado) */}
            <div className="flex items-start gap-3 p-4 rounded-xl border border-sky-200 bg-sky-50/50 mt-3">
              <input
                type="checkbox"
                checked={!!formData.tradicional}
                onChange={e => setFormData(prev => ({ ...prev, tradicional: e.target.checked, simplificado: e.target.checked ? false : prev.simplificado }))}
                className="mt-1 w-5 h-5 rounded text-sky-600 focus:ring-2 focus:ring-sky-400"
                id="cfg-tradicional"
                disabled={!isManager}
              />
              <label htmlFor="cfg-tradicional" className="flex-1 cursor-pointer">
                <p className="font-bold text-sky-900 text-sm">Régimen Tradicional</p>
                <p className="text-xs text-sky-700 mt-0.5">
                  Imprime al pie de cada tiquete: <em>"Régimen Tradicional"</em>.
                  Solo aplica a negocios que NO emiten Facturación Electrónica.
                </p>
              </label>
            </div>
          </div>
        )}

        {/* Límite máximo de descuento (POS) */}
        <div className="border-t border-gray-100 pt-5">
          <label className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
            <Percent size={14} className="text-blue-500" /> Límite máximo de descuento (%)
          </label>
          <p className="text-xs text-gray-400 mb-2">
            Tope que un cajero puede aplicar al cobrar. Owner/admin/gerente pueden superarlo siempre.
          </p>
          <div className="relative w-40">
            <input
              type="number"
              min={0} max={100} step="0.5"
              value={formData.maxDiscountPercent ?? 100}
              onChange={e => setFormData(prev => ({ ...prev, maxDiscountPercent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) }))}
              disabled={!isManager}
              className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">%</span>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1">PIN de anulación de facturas</label>
          <p className="text-xs text-gray-400 mb-2">Requerido para anular facturas en el POS. Solo números, máx. 8 dígitos.</p>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              name="void_pin"
              value={formData.void_pin}
              onChange={e => setFormData(prev => ({ ...prev, void_pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              placeholder="••••"
              inputMode="numeric"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition pr-11 tracking-widest font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPin(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading || !isManager}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition">
            <Save size={18} />
            {loading ? 'Guardando...' : (isManager ? 'Guardar Cambios' : 'Sin permiso para guardar')}
          </button>
        </div>
      </form>
    </div>
  );
};
