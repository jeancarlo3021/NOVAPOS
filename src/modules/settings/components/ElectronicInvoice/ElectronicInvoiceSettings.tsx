import React, { useEffect, useState } from 'react';
import { FileText, Save, AlertCircle, CheckCircle2, Plug, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';
import { cacheSet, cacheKey } from '@/utils/offlineCache';
import { CRLocationFields } from '@/components/CRLocationFields';

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
  /** Teléfonos ADICIONALES: salen en el tiquete, no en el XML (Hacienda admite uno). */
  emisor_phones:              string[];
  emisor_email:               string;
  /** Correos ADICIONALES: reciben copia de los comprobantes emitidos. */
  emisor_emails:              string[];
  // Actividad económica
  economic_activity_code:     string;
  /** Actividades ADICIONALES inscritas ante Hacienda. */
  economic_activities:        string[];
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
  emisor_phones: [],
  emisor_email: '',
  emisor_emails: [],
  economic_activity_code: '',
  economic_activities: [],
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
          // Se limpian acá: una fila vacía guardada sale como renglón en blanco
          // en el tiquete impreso.
          emisor_phones: (settings.emisor_phones ?? []).map(t => String(t).trim()).filter(Boolean),
          // Sin vacíos ni repetidos del principal: Alanube rechaza la lista si
          // trae una entrada en blanco.
          emisor_emails: (settings.emisor_emails ?? [])
            .map(m => String(m).trim())
            .filter(m => m && m !== String(settings.emisor_email ?? '').trim()),
          emisor_address: settings.emisor_address,
          emisor_province_code: settings.emisor_province_code,
          emisor_canton_code: settings.emisor_canton_code,
          emisor_district_code: settings.emisor_district_code,
          economic_activity_code: String(settings.economic_activity_code ?? '').trim(),
          economic_activities: (settings.economic_activities ?? [])
            .map(a => String(a).trim()).filter(Boolean),
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
      /**
       * La caché local se refresca acá mismo.
       *
       * El tiquete arma los datos del negocio desde esta caché, no pidiéndolos
       * al servidor: sin refrescarla, los teléfonos recién agregados no salían
       * impresos hasta que algo más volviera a leer la configuración —y el
       * usuario, que acababa de guardarlos, los daba por perdidos.
       */
      if (tenantId) {
        try { cacheSet(cacheKey(tenantId, 'settings_electronic-invoice'), r ?? settings); }
        catch { /* sin caché disponible: se leerá del servidor */ }
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
          <SoloLectura etiqueta="Sucursal" valor={settings.sucursal ?? ''} />
          <SoloLectura etiqueta="Terminal" valor={settings.terminal ?? ''} />
        </div>
        <p className="text-[11px] font-semibold text-gray-400">
          ¿Alguno está mal? Escribinos: la cédula y la razón social identifican al contribuyente
          y tienen que coincidir con el certificado.
        </p>
      </div>

      {/* Ubicación y actividades: las conoce el negocio y las cambia solo */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-3">
        <h3 className="font-black text-gray-900">Ubicación y actividad</h3>
        <p className="text-xs text-gray-500">
          Tienen que ser las que están inscritas ante Hacienda. Si declarás una actividad que no
          te corresponde, el comprobante se rechaza.
        </p>
        <CRLocationFields
          province={settings.emisor_province_code}
          canton={settings.emisor_canton_code}
          district={settings.emisor_district_code}
          onChange={(campo, valor) => set(
            campo === 'province' ? 'emisor_province_code'
              : campo === 'canton' ? 'emisor_canton_code' : 'emisor_district_code',
            valor,
          )}
        />
        <Campo etiqueta="Actividad económica principal" valor={settings.economic_activity_code}
          onChange={v => set('economic_activity_code', v)}
          placeholder="Ej. 4752.1 o 475201 (como aparece en el ATV)" />

        {/* Un contribuyente puede tener varias inscritas: una soda que alquila
            salón, una ferretería que además da servicio. */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Otras actividades</p>
          <div className="space-y-2">
            {(settings.economic_activities ?? []).map((act, i) => (
              <div key={i} className="flex gap-2">
                <input value={act} placeholder="Código de actividad"
                  onChange={e => set('economic_activities',
                    (settings.economic_activities ?? []).map((x, j) => j === i ? e.target.value : x))}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
                <button type="button"
                  onClick={() => set('economic_activities', (settings.economic_activities ?? []).filter((_, j) => j !== i))}
                  className="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 text-sm font-bold">
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <button type="button"
            onClick={() => set('economic_activities', [...(settings.economic_activities ?? []), ''])}
            className="mt-2 text-xs font-bold text-blue-700 hover:underline">
            + Agregar otra actividad
          </button>
        </div>
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
          <Campo etiqueta="Teléfono principal" valor={settings.emisor_phone}
            onChange={v => set('emisor_phone', v)}
            placeholder="88887777" inputMode="tel" />
          <Campo etiqueta="Correo principal" valor={settings.emisor_email}
            onChange={v => set('emisor_email', v)}
            placeholder="facturas@negocio.com" tipo="email" />
          <Campo etiqueta="Dirección exacta" valor={settings.emisor_address}
            onChange={v => set('emisor_address', v)}
            placeholder="Frente a…" />
        </div>
        {/* Correos adicionales: reciben copia de lo emitido. A diferencia del
            teléfono, acá el formato SÍ admite varios. */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Otros correos</p>
          <div className="space-y-2">
            {(settings.emisor_emails ?? []).map((mail, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="email" value={mail} placeholder="Ej. contabilidad@negocio.com"
                  onChange={e => set('emisor_emails',
                    (settings.emisor_emails ?? []).map((x, j) => j === i ? e.target.value : x))}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
                <button type="button"
                  onClick={() => set('emisor_emails', (settings.emisor_emails ?? []).filter((_, j) => j !== i))}
                  className="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 text-sm font-bold">
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <button type="button"
            onClick={() => set('emisor_emails', [...(settings.emisor_emails ?? []), ''])}
            className="mt-2 text-xs font-bold text-blue-700 hover:underline">
            + Agregar otro correo
          </button>
          <p className="text-[11px] text-gray-400 mt-1">
            Reciben copia de los comprobantes. Útil para el contador o para contabilidad.
          </p>
        </div>

        {/* Teléfonos adicionales: el comprobante electrónico admite UNO solo,
            pero en el papel el cliente agradece tener el de pedidos o WhatsApp. */}
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Otros teléfonos</p>
          <div className="space-y-2">
            {(settings.emisor_phones ?? []).map((tel, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={tel} inputMode="tel" placeholder="Ej. pedidos o WhatsApp"
                  onChange={e => set('emisor_phones',
                    (settings.emisor_phones ?? []).map((x, j) => j === i ? e.target.value : x))}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
                <button type="button"
                  onClick={() => set('emisor_phones', (settings.emisor_phones ?? []).filter((_, j) => j !== i))}
                  className="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 text-sm font-bold">
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <button type="button"
            onClick={() => set('emisor_phones', [...(settings.emisor_phones ?? []), ''])}
            className="mt-2 text-xs font-bold text-blue-700 hover:underline">
            + Agregar otro teléfono
          </button>
          <p className="text-[11px] text-gray-400 mt-1">
            Salen impresos en el tiquete junto al principal. Hacienda solo admite uno en el
            comprobante electrónico, así que al XML viaja únicamente el principal.
          </p>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50 text-sm">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar mis datos'}
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
