'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Check, FileText, KeyRound, ShieldCheck, Upload } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { CRLocationFields } from '@/components/CRLocationFields';

interface FeData {
  enabled?: boolean;
  environment?: 'sandbox' | 'production';
  api_key_emisor?: string;               // legacy (fallback)
  api_key_emisor_production?: string;     // ApiKey de PRODUCCIÓN
  api_key_emisor_sandbox?: string;        // ApiKey de QA / sandbox
  default_document_type?: 'ticket' | 'tiquete_electronico' | 'factura_electronica';
  emisor_identification_type?: string;
  emisor_identification?: string;
  emisor_name?: string;
  emisor_commercial_name?: string;
  emisor_province_code?: string;
  emisor_canton_code?: string;
  emisor_district_code?: string;
  emisor_address?: string;
  emisor_phone?: string;
  emisor_email?: string;
  economic_activity_code?: string;
  // Certificado criptográfico (.p12) — el archivo va a Storage; acá solo metadata.
  certificate?: { path: string; filename: string; uploaded_at: string };
  p12_password?: string;
  hacienda_pin?: string;
  // Numeración de comprobantes electrónicos.
  sucursal?: string;
  terminal?: string;
  consecutivo_factura?: string;
  consecutivo_tiquete?: string;
  consecutivo_nc?: string;
  [k: string]: any; // conserva otras claves (bolsa, etc.) al guardar
}

interface Props {
  owner: { id: string; name: string };
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export const TenantFeDataModal: React.FC<Props> = ({ owner, onClose, onToast }) => {
  const [fe, setFe] = useState<FeData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [uploadingCert, setUploadingCert] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ fe: FeData }>(`/admin/tenants/${owner.id}/fe-config`);
      setFe(data?.fe ?? {});
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo cargar la config de FE', 'error');
    } finally { setLoading(false); }
  }, [owner.id, onToast]);

  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof FeData>(k: K, v: FeData[K]) => setFe(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/admin/tenants/${owner.id}/fe-config`, {
        method: 'PUT', body: JSON.stringify({ fe }),
      });
      onToast('Datos de FE guardados', 'success');
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally { setSaving(false); }
  };

  // Sube el .p12 a Storage (vía backend). Guarda ANTES la config actual para no
  // perder los cambios en pantalla, luego sube el archivo + PIN/clave.
  const uploadCert = async () => {
    if (!certFile) { onToast('Elegí el archivo .p12', 'error'); return; }
    setUploadingCert(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error('No se pudo leer el archivo'));
        r.readAsDataURL(certFile);
      });
      await apiFetch(`/admin/tenants/${owner.id}/fe-certificate`, {
        method: 'POST',
        body: JSON.stringify({
          file_base64: b64, filename: certFile.name,
          p12_password: fe.p12_password ?? '', hacienda_pin: fe.hacienda_pin ?? '',
        }),
      });
      onToast('Certificado subido', 'success');
      setCertFile(null);
      load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo subir el certificado', 'error');
    } finally { setUploadingCert(false); }
  };

  const deleteCert = async () => {
    if (!window.confirm('¿Eliminar el certificado de esta empresa?')) return;
    try {
      await apiFetch(`/admin/tenants/${owner.id}/fe-certificate`, { method: 'DELETE' });
      onToast('Certificado eliminado', 'success');
      load();
    } catch (e) { onToast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';
  const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1';

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <div>
              <h2 className="text-lg font-black text-gray-900">Datos de Facturación Electrónica</h2>
              <p className="text-xs text-gray-400">{owner.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-14"><RefreshCw size={22} className="animate-spin text-gray-300" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Estado */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-sm font-semibold text-gray-700">FE activa</span>
                <input type="checkbox" checked={!!fe.enabled} onChange={e => set('enabled', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded" />
              </label>
              <div>
                <label className={labelCls}>Ambiente</label>
                <select value={fe.environment ?? 'production'} onChange={e => set('environment', e.target.value as any)}
                  className={`${inputCls} bg-white`}>
                  <option value="production">Producción</option>
                  <option value="sandbox">Sandbox (pruebas)</option>
                </select>
              </div>
            </div>

            {/* ApiKeys por ambiente */}
            <div className="space-y-2">
              <label className={`${labelCls} flex items-center gap-1`}><KeyRound size={11} /> ApiKeys del emisor</label>
              <div>
                <span className="text-[10px] font-bold text-emerald-700">Producción</span>
                <input type="text" value={fe.api_key_emisor_production ?? ''} onChange={e => set('api_key_emisor_production', e.target.value)}
                  name="fe_apikey_prod" autoComplete="off" spellCheck={false} data-1p-ignore
                  placeholder="ApiKey de producción"
                  className={`${inputCls} font-mono`} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-700">QA / Sandbox</span>
                <input type="text" value={fe.api_key_emisor_sandbox ?? ''} onChange={e => set('api_key_emisor_sandbox', e.target.value)}
                  name="fe_apikey_qa" autoComplete="off" spellCheck={false} data-1p-ignore
                  placeholder="ApiKey de pruebas (QA)"
                  className={`${inputCls} font-mono`} />
              </div>
              <p className="text-[10px] text-gray-400">
                Se usa la de <b>{(fe.environment ?? 'production') === 'sandbox' ? 'QA / Sandbox' : 'Producción'}</b> según el ambiente elegido arriba.
              </p>
            </div>

            {/* Documento por defecto */}
            <div>
              <label className={labelCls}>Documento por defecto en el POS</label>
              <select value={fe.default_document_type ?? 'ticket'} onChange={e => set('default_document_type', e.target.value as any)}
                className={`${inputCls} bg-white`}>
                <option value="ticket">Tiquete corriente</option>
                <option value="tiquete_electronico">Tiquete electrónico</option>
                <option value="factura_electronica">Factura electrónica</option>
              </select>
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Datos del emisor</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipo ID</label>
                  <select value={fe.emisor_identification_type ?? '02'} onChange={e => set('emisor_identification_type', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    <option value="01">Física</option>
                    <option value="02">Jurídica</option>
                    <option value="03">DIMEX</option>
                    <option value="04">NITE</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Identificación</label>
                  <input value={fe.emisor_identification ?? ''} onChange={e => set('emisor_identification', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelCls}>Nombre / Razón social</label>
                <input value={fe.emisor_name ?? ''} onChange={e => set('emisor_name', e.target.value)} className={inputCls} />
              </div>
              <div className="mt-3">
                <label className={labelCls}>Nombre comercial</label>
                <input value={fe.emisor_commercial_name ?? ''} onChange={e => set('emisor_commercial_name', e.target.value)} className={inputCls} />
              </div>
              <div className="mt-3">
                <CRLocationFields
                  province={fe.emisor_province_code ?? ''}
                  canton={fe.emisor_canton_code ?? ''}
                  district={fe.emisor_district_code ?? ''}
                  onChange={(f, v) => set(
                    f === 'province' ? 'emisor_province_code' : f === 'canton' ? 'emisor_canton_code' : 'emisor_district_code', v)}
                />
              </div>
              <div className="mt-3">
                <label className={labelCls}>Dirección (otras señas, mín. 5)</label>
                <textarea value={fe.emisor_address ?? ''} onChange={e => set('emisor_address', e.target.value.slice(0, 250))}
                  rows={2} maxLength={250} className={`${inputCls} resize-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input value={fe.emisor_phone ?? ''} onChange={e => set('emisor_phone', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={fe.emisor_email ?? ''} onChange={e => set('emisor_email', e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelCls}>Actividad económica (código)</label>
                <input value={fe.economic_activity_code ?? ''} inputMode="numeric"
                  onChange={e => set('economic_activity_code', e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="Ej. 620100" className={inputCls} />
              </div>
            </div>

            {/* Certificado criptográfico (.p12) — se guarda en Storage privado */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck size={13} /> Certificado criptográfico (.p12)
              </p>
              {fe.certificate?.filename ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
                  <div className="text-xs">
                    <p className="font-bold text-emerald-800">{fe.certificate.filename}</p>
                    <p className="text-emerald-600">Subido {new Date(fe.certificate.uploaded_at).toLocaleDateString('es-CR')}</p>
                  </div>
                  <button onClick={deleteCert} className="text-xs font-bold text-red-600 hover:underline">Eliminar</button>
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 mb-2">Aún no hay certificado cargado.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Clave del .p12</label>
                  <input type="password" value={fe.p12_password ?? ''} onChange={e => set('p12_password', e.target.value)}
                    autoComplete="off" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>PIN de Hacienda</label>
                  <input type="password" value={fe.hacienda_pin ?? ''} onChange={e => set('hacienda_pin', e.target.value)}
                    autoComplete="off" className={inputCls} />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input type="file" accept=".p12,application/x-pkcs12"
                  onChange={e => setCertFile(e.target.files?.[0] ?? null)}
                  className="flex-1 text-xs file:mr-2 file:px-2 file:py-1 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-bold" />
                <button onClick={uploadCert} disabled={uploadingCert || !certFile}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white">
                  {uploadingCert ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} Subir
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">El archivo se guarda cifrado en Storage privado; nunca se expone al cliente.</p>
            </div>

            {/* Numeración / consecutivos (20 dígitos de Hacienda) */}
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Consecutivos</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Sucursal (3 díg.)</label>
                  <input value={fe.sucursal ?? '1'} inputMode="numeric" maxLength={3}
                    onChange={e => set('sucursal', e.target.value.replace(/\D/g, '').slice(0, 3))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Terminal (5 díg.)</label>
                  <input value={fe.terminal ?? '1'} inputMode="numeric" maxLength={5}
                    onChange={e => set('terminal', e.target.value.replace(/\D/g, '').slice(0, 5))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label className={labelCls}>Próx. Factura</label>
                  <input value={fe.consecutivo_factura ?? ''} inputMode="numeric" placeholder="1" maxLength={10}
                    onChange={e => set('consecutivo_factura', e.target.value.replace(/\D/g, '').slice(0, 10))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Próx. Tiquete</label>
                  <input value={fe.consecutivo_tiquete ?? ''} inputMode="numeric" placeholder="1" maxLength={10}
                    onChange={e => set('consecutivo_tiquete', e.target.value.replace(/\D/g, '').slice(0, 10))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Próx. NC</label>
                  <input value={fe.consecutivo_nc ?? ''} inputMode="numeric" placeholder="1" maxLength={10}
                    onChange={e => set('consecutivo_nc', e.target.value.replace(/\D/g, '').slice(0, 10))} className={inputCls} />
                </div>
              </div>
              {(() => {
                const suc = (fe.sucursal ?? '1').padStart(3, '0');
                const ter = (fe.terminal ?? '1').padStart(5, '0');
                const cons = (fe.consecutivo_factura ?? '1').padStart(10, '0');
                // 20 díg = Sucursal(3) + Terminal(5) + TipoComprobante(2, 01=factura) + Consecutivo(10).
                return (
                  <p className="text-[10px] text-gray-400 mt-1 font-mono">
                    Consecutivo completo (20 díg.): <b>{suc}{ter}01{cons}</b>
                  </p>
                );
              })()}
              <p className="text-[10px] text-gray-400 mt-0.5">El consecutivo de Hacienda son <b>20 dígitos</b>: Sucursal (3) + Terminal (5) + Tipo (2) + Consecutivo (10).</p>
            </div>
          </div>
        )}

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
          <button onClick={save} disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</> : <><Check size={14} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TenantFeDataModal;
