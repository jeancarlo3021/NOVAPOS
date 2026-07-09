'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Check, FileText, KeyRound } from 'lucide-react';
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
