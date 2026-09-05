import React, { useEffect, useState } from 'react';
import { FileText, Save, AlertCircle, CheckCircle2, Plug, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';

interface FESettings {
  enabled:               boolean;
  environment:           'sandbox' | 'production';
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
  // Proveedor de sistemas (cédula) — requerido por Hacienda
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

/** Dato inscrito ante Hacienda: se ve, no se toca. */
const SoloLectura: React.FC<{ etiqueta: string; valor: string; nota?: string }> = ({ etiqueta, valor, nota }) => (
  <div>
    <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">{etiqueta}</p>
    <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
      {valor?.trim() ? valor : <span className="text-gray-400">Sin configurar</span>}
      {nota && valor?.trim() && <span className="ml-2 text-[11px] text-gray-400">({nota})</span>}
    </div>
  </div>
);

const Campo: React.FC<{
  etiqueta: string; valor: string; onChange: (v: string) => void;
  placeholder?: string; tipo?: string; inputMode?: any;
}> = ({ etiqueta, valor, onChange, placeholder, tipo = 'text', inputMode }) => (
  <div>
    <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">{etiqueta}</p>
    <input type={tipo} value={valor ?? ''} inputMode={inputMode}
      onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white
                 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
  </div>
);

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
      /**
       * Se mandan SOLO los campos que el negocio puede cambiar.
       *
       * Antes se releía la configuración entera y se reenviaba completa para no
       * pisar lo del administrador. Eso funcionaba, pero cualquier dato que
       * llegara viejo o incompleto se reescribía igual. El servidor ya solo
       * acepta esta lista, así que mandar el resto no aporta nada.
       */
      const r = await apiFetch<any>('/settings/electronic-invoice', {
        method: 'PUT',
        body: JSON.stringify({
          default_document_type: settings.default_document_type,
          emisor_commercial_name: settings.emisor_commercial_name,
          emisor_phone: settings.emisor_phone,
          emisor_address: settings.emisor_address,
          emisor_email: settings.emisor_email,
        }),
      }, 28_000);   // además de guardar, actualiza la empresa en Hacienda

      /**
       * Guardado NO es lo mismo que aplicado.
       *
       * Estos datos los imprime el proveedor en el comprobante. Si el cambio se
       * guardó pero no llegó allá, la factura sigue saliendo con lo anterior — y
       * decir «guardado» a secas haría creer que ya está resuelto.
       */
      if (r?.alanube_sync === false) {
        setError('Se guardó, pero NO se pudo actualizar en Hacienda: los comprobantes van a '
          + `seguir saliendo con los datos anteriores. ${r?.alanube_motivo ?? ''}`);
        setSuccess('');
        return;
      }
      setSuccess(r?.alanube_sync
        ? 'Guardado y actualizado en Hacienda'
        : 'Configuración guardada');
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
        La cédula, la razón social, la ubicación y la actividad económica tienen que coincidir
        con lo inscrito ante Hacienda: se muestran acá para revisarlos, pero los cambia el
        equipo del sistema. Los datos de <b>contacto</b> sí los podés editar vos.
      </p>

      {/* Datos inscritos ante Hacienda — solo lectura */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-3">
        <h3 className="font-black text-gray-900">Datos ante Hacienda</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SoloLectura etiqueta="Razón social" valor={settings.emisor_name} />
          <SoloLectura
            etiqueta="Cédula"
            valor={settings.emisor_identification}
            nota={settings.emisor_identification_type === '01' ? 'Física'
              : settings.emisor_identification_type === '02' ? 'Jurídica'
              : settings.emisor_identification_type === '03' ? 'DIMEX' : 'NITE'}
          />
          <SoloLectura etiqueta="Actividad económica" valor={settings.economic_activity_code} />
          <SoloLectura
            etiqueta="Provincia / Cantón / Distrito"
            valor={[settings.emisor_province_code, settings.emisor_canton_code, settings.emisor_district_code]
              .filter(Boolean).join(' · ')}
          />
          <SoloLectura etiqueta="Sucursal" valor={settings.sucursal ?? ''} />
          <SoloLectura etiqueta="Terminal" valor={settings.terminal ?? ''} />
        </div>
        <p className="text-[11px] font-semibold text-gray-400">
          ¿Alguno está mal? Escribinos: cambiarlo por tu cuenta haría que Hacienda rechace los
          comprobantes o que salgan a nombre equivocado.
        </p>
      </div>

      {/* Contacto — editable por el negocio */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-3">
        <h3 className="font-black text-gray-900">Datos de contacto</h3>
        <p className="text-xs text-gray-500">
          Salen impresos en el comprobante y se usan para enviarlo al cliente.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo etiqueta="Nombre comercial" valor={settings.emisor_commercial_name}
            onChange={v => set('emisor_commercial_name', v)}
            placeholder="El rótulo del negocio" />
          <Campo etiqueta="Teléfono" valor={settings.emisor_phone}
            onChange={v => set('emisor_phone', v)}
            placeholder="88887777" inputMode="tel" />
          <Campo etiqueta="Correo" valor={settings.emisor_email}
            onChange={v => set('emisor_email', v)}
            placeholder="facturas@negocio.com" tipo="email" />
          <Campo etiqueta="Dirección exacta" valor={settings.emisor_address}
            onChange={v => set('emisor_address', v)}
            placeholder="Frente a…" />
        </div>
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50 text-sm">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar datos de contacto'}
        </button>
      </div>

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
