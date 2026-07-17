import React, { useEffect, useState } from 'react';
import {
  FileText, KeyRound, Users, Save, AlertCircle, CheckCircle2,
  Building2, RefreshCw, ExternalLink,
} from 'lucide-react';
import {
  tenantGroupsService, type BranchStats,
} from '@/services/admin/tenantGroupsService';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { GroupDocCount } from './GroupDocCount';
import { formatCedula, cleanCedula, cedulaPlaceholder } from '@/utils/cedula';
import { apiFetch } from '@/lib/api';
import { CRLocationFields } from '@/components/CRLocationFields';

interface FeConfig {
  enabled?:               boolean;
  simplificado?:          boolean;
  environment?:           'sandbox' | 'production';
  api_key_emisor?:        string;   // legacy (fallback)
  api_key_emisor_production?: string; // ApiKey de producción
  api_key_emisor_sandbox?:    string; // ApiKey de QA / sandbox
  default_document_type?: 'ticket' | 'tiquete_electronico' | 'factura_electronica';
  // Cuota de comprobantes (acumulable) + cobro por excedente.
  fe_included_docs?:      number;   // facturas + tiquetes por mes (0 = ilimitado)
  fe_included_nc?:        number;   // notas de crédito por mes (0 = ilimitado)
  fe_extra_fee?:          number;   // ₡ por comprobante extra
  // Datos del emisor (los pone el equipo del sistema, no el cliente).
  emisor_identification_type?: string;
  emisor_identification?:      string;
  emisor_name?:                string;
  emisor_commercial_name?:     string;
  emisor_province_code?:       string;
  emisor_canton_code?:         string;
  emisor_district_code?:       string;
  emisor_address?:             string;
  emisor_phone?:               string;
  emisor_email?:               string;
  economic_activity_code?:     string;
}

interface KioskConfig {
  enabled?: boolean;
}

interface TenantCardState {
  loading: boolean;
  fe:      FeConfig;
  kiosk:   KioskConfig;
  dirty:   boolean;
  saving:  boolean;
  saved:   boolean;
  error:   string;
}

const defaultCardState = (): TenantCardState => ({
  loading: true, fe: {}, kiosk: {},
  dirty: false, saving: false, saved: false, error: '',
});

export const AdminFeKioskView: React.FC = () => {
  const navigate = useNavigate();
  const { switchTenant } = useAuth();
  const [branches, setBranches] = useState<BranchStats[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [cards,    setCards]    = useState<Record<string, TenantCardState>>({});
  // Cédula GLOBAL del proveedor de sistemas (misma para todos los tenants).
  const [globalProv, setGlobalProv] = useState('');
  const [savingProv, setSavingProv] = useState(false);
  const [provMsg, setProvMsg] = useState('');

  useEffect(() => {
    apiFetch<{ proveedor_sistemas?: string }>('/admin/global-fe')
      .then(v => setGlobalProv(v?.proveedor_sistemas ?? ''))
      .catch(() => {});
  }, []);

  const saveGlobalProv = async () => {
    setSavingProv(true); setProvMsg('');
    try {
      await apiFetch('/admin/global-fe', { method: 'PUT', body: JSON.stringify({ proveedor_sistemas: globalProv }) });
      setProvMsg('Guardado ✓');
    } catch (e) {
      setProvMsg(e instanceof Error ? e.message : 'Error al guardar');
    } finally { setSavingProv(false); setTimeout(() => setProvMsg(''), 3000); }
  };

  const loadBranches = async () => {
    setLoading(true); setError('');
    try {
      const list = await tenantGroupsService.myBranchesStats();
      setBranches(Array.isArray(list) ? list : []);
      // Inicializar cards
      const initial: Record<string, TenantCardState> = {};
      for (const b of list) initial[b.tenant_id] = defaultCardState();
      setCards(initial);
      // Cargar config de cada uno (en paralelo, no bloqueamos UI)
      list.forEach(async (b) => {
        try {
          const cfg = await tenantGroupsService.getFeConfig(b.tenant_id);
          setCards(prev => ({
            ...prev,
            [b.tenant_id]: {
              ...prev[b.tenant_id], loading: false,
              fe: cfg.fe ?? {}, kiosk: cfg.kiosk ?? {},
            },
          }));
        } catch (e) {
          setCards(prev => ({
            ...prev,
            [b.tenant_id]: {
              ...prev[b.tenant_id], loading: false,
              error: e instanceof Error ? e.message : 'Error al cargar',
            },
          }));
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadBranches(); }, []);

  const updateCard = (tid: string, patch: Partial<TenantCardState>) =>
    setCards(prev => ({ ...prev, [tid]: { ...prev[tid], ...patch, dirty: true, saved: false } }));

  const setFe = (tid: string, k: keyof FeConfig, v: any) => {
    const current = cards[tid]?.fe ?? {};
    const next: FeConfig = { ...current, [k]: v };
    // Mutuamente excluyentes: si activás FE, apagás simplificado; si activás
    // simplificado, apagás FE (régimen simplificado es para quienes NO emiten FE).
    if (k === 'enabled'      && v === true) next.simplificado = false;
    if (k === 'simplificado' && v === true) next.enabled      = false;
    updateCard(tid, { fe: next });
  };
  const setKiosk = (tid: string, k: keyof KioskConfig, v: any) =>
    updateCard(tid, { kiosk: { ...cards[tid]?.kiosk, [k]: v } });

  const handleSave = async (tid: string) => {
    setCards(prev => ({ ...prev, [tid]: { ...prev[tid], saving: true, error: '' } }));
    try {
      await tenantGroupsService.setFeConfig(tid, {
        fe:    cards[tid].fe,
        kiosk: cards[tid].kiosk,
      });
      setCards(prev => ({
        ...prev,
        [tid]: { ...prev[tid], saving: false, saved: true, dirty: false },
      }));
      setTimeout(() => {
        setCards(prev => ({ ...prev, [tid]: { ...prev[tid], saved: false } }));
      }, 2500);
    } catch (e) {
      setCards(prev => ({
        ...prev,
        [tid]: {
          ...prev[tid], saving: false,
          error: e instanceof Error ? e.message : 'Error al guardar',
        },
      }));
    }
  };

  const goToCustomers = async (tid: string) => {
    try { await switchTenant(tid); navigate('/customers'); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar de sucursal'); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <FileText size={22} className="text-blue-600" />
            Facturación Electrónica & Kiosk
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Configurá FE y modo kiosk por sucursal. También gestionar clientes de cada una.
          </p>
        </div>
        <button onClick={loadBranches}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refrescar
        </button>
      </div>

      {/* Cédula GLOBAL del proveedor de sistemas (aplica a TODOS los tenants) */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <label className="block text-sm font-black text-gray-800 mb-1">Cédula del proveedor de sistemas (global)</label>
        <p className="text-xs text-gray-500 mb-2">Se usa en todos los comprobantes electrónicos de todos los negocios.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={globalProv} onChange={e => setGlobalProv(e.target.value.replace(/\D/g, ''))}
            placeholder="Ej. 3101862189" inputMode="numeric"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-52" />
          <button onClick={saveGlobalProv} disabled={savingProv}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
            {savingProv ? 'Guardando…' : 'Guardar'}
          </button>
          {provMsg && <span className="text-sm font-semibold text-emerald-600">{provMsg}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5" />{error}
        </div>
      )}

      {/* Recuento de documentos emitidos por el grupo */}
      <GroupDocCount />

      {loading && branches.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Cargando sucursales...</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <Building2 size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="font-bold text-gray-500">Sin sucursales accesibles</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {branches.map((b) => {
            const card = cards[b.tenant_id] ?? defaultCardState();
            return (
              <div key={b.tenant_id} className="bg-white rounded-2xl border-2 border-gray-100 p-5 space-y-4">
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black text-gray-900">{b.tenant_name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {b.users_count} usuario(s) · {b.invoices_month} factura(s) este mes
                    </p>
                  </div>
                  <button onClick={() => goToCustomers(b.tenant_id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold"
                  >
                    <Users size={12} /> Clientes <ExternalLink size={10} />
                  </button>
                </div>

                {card.loading ? (
                  <div className="text-center py-6 text-gray-400 text-sm">Cargando config...</div>
                ) : card.error && !card.fe ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                    {card.error}
                  </div>
                ) : (
                  <>
                    {/* FE section */}
                    <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-black text-blue-700 uppercase tracking-wider">
                        <FileText size={12} /> Facturación Electrónica
                      </h4>
                      <label className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-gray-700">Activar emisión a Hacienda</span>
                        <Toggle checked={!!card.fe.enabled}
                          onChange={v => setFe(b.tenant_id, 'enabled', v)} />
                      </label>
                      {/* Régimen simplificado solo cuando FE está apagado —
                          son alternativas mutuamente excluyentes ante Hacienda. */}
                      {!card.fe.enabled && (
                        <label className="flex items-center justify-between gap-2 text-sm bg-amber-50/60 border border-amber-100 rounded-lg px-2 py-1.5">
                          <span className="text-gray-700">
                            Régimen <strong>simplificado</strong>
                            <span className="block text-[10px] text-gray-500 font-normal">
                              Imprime "Autorizado mediante oficio 1197" al pie de cada tiquete
                            </span>
                          </span>
                          <Toggle checked={!!card.fe.simplificado}
                            onChange={v => setFe(b.tenant_id, 'simplificado', v)} />
                        </label>
                      )}
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">Ambiente</label>
                        <select value={card.fe.environment ?? 'production'}
                          onChange={e => setFe(b.tenant_id, 'environment', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                          <option value="production">Producción</option>
                          <option value="sandbox">Sandbox (pruebas)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-1">Documento por defecto en el POS</label>
                        <select value={card.fe.default_document_type ?? 'ticket'}
                          onChange={e => setFe(b.tenant_id, 'default_document_type', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                          <option value="ticket">Tiquete corriente</option>
                          <option value="tiquete_electronico">Tiquete electrónico</option>
                          <option value="factura_electronica">Factura electrónica</option>
                        </select>
                      </div>

                      {/* ApiKey del emisor + datos del emisor (los pone el sistema) */}
                      <div className="border-t border-gray-100 pt-2 mt-1 space-y-2">
                        <p className="text-[11px] font-black text-gray-600 uppercase tracking-wider">ApiKey y datos del emisor</p>
                        <div className="space-y-1.5">
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-700 mb-1">ApiKey Producción</label>
                            <input type="text" value={card.fe.api_key_emisor_production ?? ''}
                              onChange={e => setFe(b.tenant_id, 'api_key_emisor_production', e.target.value)}
                              name="fe_apikey_prod" autoComplete="off" spellCheck={false} data-1p-ignore
                              placeholder="ApiKey de producción"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-amber-700 mb-1">ApiKey QA / Sandbox</label>
                            <input type="text" value={card.fe.api_key_emisor_sandbox ?? ''}
                              onChange={e => setFe(b.tenant_id, 'api_key_emisor_sandbox', e.target.value)}
                              name="fe_apikey_qa" autoComplete="off" spellCheck={false} data-1p-ignore
                              placeholder="ApiKey de pruebas (QA)"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" />
                          </div>
                          <p className="text-[10px] text-gray-400">Se usa según el ambiente elegido arriba.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Tipo ID</label>
                            <select value={card.fe.emisor_identification_type ?? '02'}
                              onChange={e => setFe(b.tenant_id, 'emisor_identification_type', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                              <option value="01">Física</option>
                              <option value="02">Jurídica</option>
                              <option value="03">DIMEX</option>
                              <option value="04">NITE</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Identificación</label>
                            <input value={formatCedula(card.fe.emisor_identification ?? '', card.fe.emisor_identification_type ?? '02')}
                              onChange={e => setFe(b.tenant_id, 'emisor_identification', cleanCedula(e.target.value, card.fe.emisor_identification_type ?? '02'))}
                              placeholder={cedulaPlaceholder(card.fe.emisor_identification_type ?? '02')} inputMode="numeric"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Nombre / Razón social</label>
                          <input value={card.fe.emisor_name ?? ''}
                            onChange={e => setFe(b.tenant_id, 'emisor_name', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Nombre comercial</label>
                          <input value={card.fe.emisor_commercial_name ?? ''}
                            onChange={e => setFe(b.tenant_id, 'emisor_commercial_name', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                        <CRLocationFields
                          province={card.fe.emisor_province_code ?? ''}
                          canton={card.fe.emisor_canton_code ?? ''}
                          district={card.fe.emisor_district_code ?? ''}
                          onChange={(f, v) => setFe(b.tenant_id,
                            f === 'province' ? 'emisor_province_code' : f === 'canton' ? 'emisor_canton_code' : 'emisor_district_code', v)}
                        />
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Dirección (otras señas, mín. 5)</label>
                          <textarea value={card.fe.emisor_address ?? ''}
                            onChange={e => setFe(b.tenant_id, 'emisor_address', e.target.value.slice(0, 250))}
                            rows={2} maxLength={250}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm resize-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Teléfono</label>
                            <input value={card.fe.emisor_phone ?? ''}
                              onChange={e => setFe(b.tenant_id, 'emisor_phone', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Email</label>
                            <input type="email" value={card.fe.emisor_email ?? ''}
                              onChange={e => setFe(b.tenant_id, 'emisor_email', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Actividad económica (código)</label>
                          <input value={card.fe.economic_activity_code ?? ''}
                            onChange={e => setFe(b.tenant_id, 'economic_activity_code', e.target.value.replace(/[^\d.]/g, ''))}
                            placeholder="Ej. 620100" inputMode="numeric"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                      </div>

                      {/* Bolsa de comprobantes (prepagada, se gasta) + cobro por excedente */}
                      <div className="border-t border-gray-100 pt-2 mt-1">
                        <p className="text-[11px] font-black text-gray-600 uppercase tracking-wider mb-1.5">Bolsa de comprobantes (0 = ilimitado)</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">Comprobantes por bolsa</label>
                            <input type="number" min={0} value={card.fe.fe_included_docs ?? 0}
                              onChange={e => setFe(b.tenant_id, 'fe_included_docs', Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 mb-1">₡ x extra</label>
                            <input type="number" min={0} value={card.fe.fe_extra_fee ?? 0}
                              onChange={e => setFe(b.tenant_id, 'fe_extra_fee', Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Facturas, tiquetes y NC cuentan al mismo contador. La bolsa se gasta hasta agotarse (puede durar un año). Al agotarse y pagar el cliente, renovala abajo. Superada la bolsa, cada extra cobra ₡ x extra.</p>
                        <button type="button"
                          onClick={async () => {
                            if (!window.confirm('¿Renovar la bolsa de comprobantes de esta sucursal? Reinicia el contador a 0 (usar cuando el cliente pagó).')) return;
                            try {
                              await apiFetch(`/admin/tenants/${b.tenant_id}/fe-renew`, { method: 'POST' });
                              window.alert('Bolsa renovada. El contador vuelve a 0.');
                            } catch (err) {
                              window.alert('No se pudo renovar: ' + (err instanceof Error ? err.message : 'error'));
                            }
                          }}
                          className="mt-2 w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2 py-1.5">
                          🔄 Renovar bolsa (cliente pagó)
                        </button>
                      </div>
                    </div>

                    {/* Kiosk section */}
                    <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-black text-amber-700 uppercase tracking-wider">
                        <KeyRound size={12} /> Modo Kiosk POS
                      </h4>
                      <label className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-gray-700">
                          Activar Kiosk con PIN
                          <span className="block text-[10px] text-gray-400 font-normal">
                            Cada cajero entra con su propio PIN en el POS
                          </span>
                        </span>
                        <Toggle checked={!!card.kiosk.enabled}
                          onChange={v => setKiosk(b.tenant_id, 'enabled', v)} />
                      </label>
                    </div>

                    {card.error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                        {card.error}
                      </div>
                    )}

                    <button
                      onClick={() => handleSave(b.tenant_id)}
                      disabled={!card.dirty || card.saving}
                      className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition ${
                        card.saved
                          ? 'bg-emerald-100 text-emerald-700'
                          : card.dirty
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      } disabled:opacity-60`}
                    >
                      {card.saving ? 'Guardando…' :
                       card.saved  ? (<><CheckCircle2 size={14} /> Guardado</>) :
                                     (<><Save size={14} /> Guardar configuración</>)}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Toggle reutilizable ─────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-emerald-500' : 'bg-gray-200'
      }`}>
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}

export default AdminFeKioskView;
