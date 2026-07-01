import React, { useEffect, useState } from 'react';
import { FileText, Save, AlertCircle, CheckCircle2, Eye, EyeOff, Plug, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';

interface FESettings {
  enabled:               boolean;
  environment:           'sandbox' | 'production';
  // Proveedor Facturemos CR
  api_key_emisor:        string;  // Clave del emisor (Genius Technology)
  hacienda_username:     string;  // Cédula jurídica + ATV usuario
  hacienda_password:     string;
  pin_certificate:       string;
  certificate_uploaded:  boolean;
  // Default que toma el POS para nuevas ventas
  default_document_type: 'ticket' | 'tiquete_electronico' | 'factura_electronica';
  // Datos del emisor
  emisor_identification_type: string;
  emisor_identification:      string;
  emisor_name:                string;
  emisor_commercial_name:     string;
  emisor_province_code:       string;
  emisor_canton_code:         string;
  emisor_district_code:       string;
  emisor_address:             string;
  emisor_phone:               string;
  emisor_email:               string;
  // Actividad económica
  economic_activity_code:     string;
  // Proveedor de sistemas (cédula) — requerido por Facturemos
  proveedor_sistemas?:        string;
  // Numeración (consecutivo Hacienda)
  sucursal?:                  string;
  terminal?:                  string;
}

const DEFAULT_SETTINGS: FESettings = {
  enabled: false,
  environment: 'sandbox',
  api_key_emisor: '',
  hacienda_username: '',
  hacienda_password: '',
  pin_certificate: '',
  certificate_uploaded: false,
  default_document_type: 'ticket',
  emisor_identification_type: '02',
  emisor_identification: '',
  emisor_name: '',
  emisor_commercial_name: '',
  emisor_province_code: '',
  emisor_canton_code: '',
  emisor_district_code: '',
  emisor_address: '',
  emisor_phone: '',
  emisor_email: '',
  economic_activity_code: '',
  proveedor_sistemas: '',
  sucursal: '1',
  terminal: '1',
};

export const ElectronicInvoiceSettings: React.FC = () => {
  const { tenantId } = useTenantId();
  const [settings, setSettings] = useState<FESettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      // Guardar PRIMERO la config actual (incluida la ApiKey del emisor) para que
      // el test la lea del servidor.
      await apiFetch('/settings/electronic-invoice', {
        method: 'PUT',
        body: JSON.stringify({ ...settings, api_key_emisor: (settings.api_key_emisor || '').trim() }),
      });
      const r = await apiFetch<{ message?: string; emisor_configured?: boolean }>(
        '/hacienda/test-connection', { method: 'POST' });
      setTestResult({ ok: true, msg: r?.message ?? 'Conexión correcta' });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'No se pudo conectar' });
    } finally { setTesting(false); }
  };

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const data = await apiFetch<FESettings | null>('/settings/electronic-invoice');
        if (data) setSettings({ ...DEFAULT_SETTINGS, ...data });
      } catch {
        // Sin settings guardados aún — usar defaults
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const set = <K extends keyof FESettings>(k: K, v: FESettings[K]) =>
    setSettings(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await apiFetch('/settings/electronic-invoice', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSuccess('Configuración guardada');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2">
        <FileText size={22} className="text-blue-600" />
        <h2 className="text-xl font-black text-gray-900">Facturación Electrónica</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5" />{error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle2 size={15} /> {success}
        </div>
      )}

      {/* Estado */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-4">
        <h3 className="font-black text-gray-900">Estado del servicio</h3>
        <label className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 cursor-pointer">
          <div>
            <p className="font-bold text-sm text-gray-900">Activar facturación electrónica</p>
            <p className="text-xs text-gray-500">Permite emitir tiquetes y facturas electrónicas ante Hacienda</p>
          </div>
          <input type="checkbox" checked={settings.enabled} onChange={e => set('enabled', e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded" />
        </label>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Ambiente</label>
          <select value={settings.environment} onChange={e => set('environment', e.target.value as any)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="sandbox">Sandbox (pruebas)</option>
            <option value="production">Producción</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            Documento por defecto en el POS
          </label>
          <select
            value={settings.default_document_type}
            onChange={e => set('default_document_type', e.target.value as any)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="ticket">Tiquete corriente</option>
            <option value="tiquete_electronico">Tiquete electrónico</option>
            <option value="factura_electronica">Factura electrónica</option>
          </select>
          <p className="text-[11px] text-gray-400 mt-1">
            Es el tipo que aparece preseleccionado en cada venta nueva del POS.
            Igual podés cambiarlo manualmente en cada factura desde el dropdown del POS.
          </p>
        </div>
      </div>

      {/* Proveedor Facturemos CR */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-3">
        <h3 className="font-black text-gray-900">Proveedor — Facturemos CR</h3>
        <p className="text-xs text-gray-500">
          Facturemos se encarga del certificado y la comunicación con Hacienda. Solo
          necesitás la <strong>ApiKey del emisor</strong> (la obtenés al crear el emisor en su
          plataforma). La clave maestra del cliente se configura en el servidor.
        </p>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">ApiKey del emisor</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={settings.api_key_emisor}
              onChange={e => set('api_key_emisor', e.target.value)}
              placeholder="Clave del emisor proporcionada por Facturemos"
              className="w-full border border-gray-200 rounded-lg pl-3 pr-9 py-2 text-sm font-mono" />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Proveedor de sistemas (cédula)</label>
          <input value={settings.proveedor_sistemas ?? ''} onChange={e => set('proveedor_sistemas', e.target.value)}
            placeholder="Cédula del proveedor (la indica Facturemos)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
        </div>
        <button type="button" onClick={handleTestConnection} disabled={testing}
          className="w-full flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 font-bold py-2.5 rounded-lg hover:bg-blue-100 disabled:opacity-50 text-sm">
          {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Probar conexión
        </button>
        {testResult && (
          <div className={`rounded-lg px-3 py-2 text-sm flex items-start gap-2 ${testResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {testResult.ok ? <CheckCircle2 size={15} className="mt-0.5" /> : <AlertCircle size={15} className="mt-0.5" />}
            {testResult.msg}
          </div>
        )}
        <p className="text-[11px] text-gray-400">
          "Probar conexión" guarda automáticamente la ApiKey y el ambiente antes de probar.
        </p>
      </div>

      {/* Datos del emisor */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-3">
        <h3 className="font-black text-gray-900">Datos del emisor</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Tipo ID</label>
            <select value={settings.emisor_identification_type}
              onChange={e => set('emisor_identification_type', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="01">Cédula Física</option>
              <option value="02">Cédula Jurídica</option>
              <option value="03">DIMEX</option>
              <option value="04">NITE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Número de identificación</label>
            <input value={settings.emisor_identification}
              onChange={e => set('emisor_identification', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Nombre / Razón social</label>
          <input value={settings.emisor_name} onChange={e => set('emisor_name', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Nombre comercial</label>
          <input value={settings.emisor_commercial_name} onChange={e => set('emisor_commercial_name', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Provincia</label>
            <input value={settings.emisor_province_code}
              onChange={e => set('emisor_province_code', e.target.value)}
              placeholder="1-7" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Cantón</label>
            <input value={settings.emisor_canton_code}
              onChange={e => set('emisor_canton_code', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Distrito</label>
            <input value={settings.emisor_district_code}
              onChange={e => set('emisor_district_code', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Dirección</label>
          <textarea value={settings.emisor_address}
            onChange={e => set('emisor_address', e.target.value)}
            rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Teléfono</label>
            <input value={settings.emisor_phone}
              onChange={e => set('emisor_phone', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Email</label>
            <input type="email" value={settings.emisor_email}
              onChange={e => set('emisor_email', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">Actividad económica</label>
          <input value={settings.economic_activity_code}
            onChange={e => set('economic_activity_code', e.target.value)}
            placeholder="Código CAEC" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="sticky bottom-0 bg-gray-50 -mx-6 -mb-6 px-6 py-4 border-t border-gray-200">
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50">
          <Save size={16} /> {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  );
};

export default ElectronicInvoiceSettings;
