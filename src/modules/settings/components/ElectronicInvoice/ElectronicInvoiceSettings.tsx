import React, { useEffect, useState } from 'react';
import { FileText, Save, AlertCircle, CheckCircle2, Plug, Loader2 } from 'lucide-react';
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
  environment: 'production',
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      // La ApiKey y datos los configura el admin en el servidor; solo probamos.
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
      // Traemos lo último del servidor y solo cambiamos el tipo por defecto, para
      // NO pisar lo que configuró el administrador (ApiKey, datos del emisor, etc.).
      let latest: any = {};
      try { latest = (await apiFetch<any>('/settings/electronic-invoice')) ?? {}; } catch { /* usar lo que hay */ }
      const merged = { ...latest, default_document_type: settings.default_document_type };
      await apiFetch('/settings/electronic-invoice', {
        method: 'PUT',
        body: JSON.stringify(merged),
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

      <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        Los datos del emisor, la ApiKey y el resto de la configuración de Hacienda los
        administra el equipo del sistema. Acá solo elegís el tipo de comprobante por defecto
        y podés probar la conexión.
      </p>

      {/* Documento por defecto en el POS */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-2">
        <h3 className="font-black text-gray-900">Documento por defecto en el POS</h3>
        <select
          value={settings.default_document_type}
          onChange={e => set('default_document_type', e.target.value as any)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="ticket">Tiquete corriente</option>
          <option value="tiquete_electronico">Tiquete electrónico</option>
          <option value="factura_electronica">Factura electrónica</option>
        </select>
        <p className="text-[11px] text-gray-400">
          Es el tipo que aparece preseleccionado en cada venta nueva del POS.
          Igual podés cambiarlo manualmente en cada factura desde el dropdown del POS.
        </p>
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50 text-sm mt-1">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {/* Probar conexión */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-3">
        <h3 className="font-black text-gray-900">Conexión con Hacienda</h3>
        <p className="text-xs text-gray-500">
          Verifica que la ApiKey y los datos configurados por el administrador funcionan.
        </p>
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
      </div>
    </div>
  );
};

export default ElectronicInvoiceSettings;
