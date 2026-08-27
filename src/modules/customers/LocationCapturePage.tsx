import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Crosshair, Loader2, Check, AlertCircle, Search, MapPin, Navigation, ShieldAlert,
} from 'lucide-react';
import { customersService, type Customer } from '@/services/customers/customersService';

type Estado = 'idle' | 'pidiendo' | 'ok' | 'error';

/**
 * Activar ubicación.
 *
 * Pantalla para el que está EN LA CALLE: enciende el GPS, ve su posición con la
 * precisión real, y se la asigna al cliente que está visitando de un toque. Es
 * la forma más exacta de levantar las ubicaciones —estando ahí— y la que menos
 * pasos tiene: sin buscar en un mapa ni escribir coordenadas.
 */
export const LocationCapturePage: React.FC = () => {
  const navigate = useNavigate();

  const [estado, setEstado] = useState<Estado>('idle');
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permiso, setPermiso] = useState<PermissionState | 'unknown'>('unknown');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    customersService.list().then(setCustomers).catch(() => setCustomers([]));
    // El estado del permiso se consulta si el navegador lo permite: así se puede
    // explicar "está bloqueado" en vez de fallar sin motivo aparente.
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then(p => { setPermiso(p.state); p.onchange = () => setPermiso(p.state); })
        .catch(() => setPermiso('unknown'));
    }
  }, []);

  const activar = useCallback(() => {
    if (!navigator.geolocation) {
      setEstado('error');
      setError('Este dispositivo no permite usar la ubicación.');
      return;
    }
    setEstado('pidiendo'); setError(null);
    navigator.geolocation.getCurrentPosition(
      p => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? 0 });
        setEstado('ok');
      },
      err => {
        setEstado('error');
        setError(err.code === err.PERMISSION_DENIED
          ? 'Permiso denegado. Activá la ubicación para este sitio en los ajustes del navegador y volvé a intentar.'
          : err.code === err.TIMEOUT
            ? 'El GPS tardó demasiado. Probá al aire libre o cerca de una ventana.'
            : 'No se pudo obtener la ubicación.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = [...customers].sort((a, b) => {
      // Los que NO tienen ubicación van primero: son los que hay que levantar.
      const au = a.lat != null ? 1 : 0, bu = b.lat != null ? 1 : 0;
      return au !== bu ? au - bu : a.name.localeCompare(b.name, 'es');
    });
    if (!t) return base.slice(0, 20);
    return base.filter(c =>
      c.name.toLowerCase().includes(t)
      || (c.phone ?? '').includes(t)
      || (c.zone ?? '').toLowerCase().includes(t)).slice(0, 20);
  }, [customers, q]);

  const asignar = async (c: Customer) => {
    if (!pos) return;
    setSavingId(c.id); setOk(null);
    try {
      await customersService.update(c.id, { lat: pos.lat, lng: pos.lng } as any);
      setCustomers(prev => prev.map(x => (x.id === c.id ? { ...x, lat: pos.lat, lng: pos.lng } : x)));
      setOk(`${c.name} quedó ubicado acá`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la ubicación');
    } finally { setSavingId(null); }
  };

  const sinUbicar = customers.filter(c => c.lat == null || c.lng == null).length;

  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-6 space-y-3">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <Crosshair size={20} className="text-emerald-600" /> Activar ubicación
        </span>
        <div className="flex-1" />
        <button onClick={() => navigate('/ubicaciones')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-black hover:bg-gray-50">
          <MapPin size={15} /> Ver mapa
        </button>
      </div>

      {/* Paso 1: encender el GPS */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
        {estado !== 'ok' ? (
          <>
            <p className="text-sm font-black text-gray-900">Encendé el GPS de este dispositivo</p>
            <p className="text-xs font-semibold text-gray-500">
              El navegador va a pedirte permiso. Hay que aceptarlo una sola vez por dispositivo.
            </p>
            {permiso === 'denied' && (
              <p className="flex items-start gap-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <ShieldAlert size={15} className="shrink-0 mt-0.5" />
                El permiso está bloqueado para este sitio. Tocá el candado de la barra de
                direcciones → Permisos → Ubicación → Permitir, y recargá.
              </p>
            )}
            <button onClick={activar} disabled={estado === 'pidiendo'}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm disabled:opacity-50">
              {estado === 'pidiendo'
                ? <><Loader2 size={16} className="animate-spin" /> Buscando señal…</>
                : <><Crosshair size={16} /> Activar mi ubicación</>}
            </button>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Check size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-gray-900">Ubicación activa</p>
              <p className="text-xs font-mono text-gray-500">
                {pos?.lat.toFixed(6)}, {pos?.lng.toFixed(6)}
              </p>
              <p className={`text-xs font-bold ${(pos?.acc ?? 0) > 50 ? 'text-amber-700' : 'text-emerald-700'}`}>
                Precisión: ±{Math.round(pos?.acc ?? 0)} m
                {(pos?.acc ?? 0) > 50 && ' · muy abierta, salí al aire libre y volvé a tomarla'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button onClick={activar}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50">
                  Volver a tomar
                </button>
                <a href={`https://www.google.com/maps/search/?api=1&query=${pos?.lat},${pos?.lng}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50">
                  <Navigation size={12} /> Ver en el mapa
                </a>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 text-xs font-bold text-red-700">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
          </p>
        )}
      </div>

      {/* Paso 2: asignársela al cliente que se está visitando */}
      {estado === 'ok' && (
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-gray-900">¿A qué cliente le corresponde?</p>
            <span className="text-xs font-bold text-gray-400">{sinUbicar} sin ubicar</span>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar por nombre, teléfono o zona…"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" />
          </div>

          {ok && (
            <p className="flex items-center gap-2 text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <Check size={14} /> {ok}
            </p>
          )}

          <div className="divide-y divide-gray-50 max-h-[50vh] overflow-y-auto no-scrollbar">
            {resultados.map(c => (
              <div key={c.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-gray-800 truncate">{c.name}</span>
                  <span className="block text-[11px] font-bold text-gray-400 truncate">
                    {c.zone ?? 'Sin zona'}{c.phone ? ` · ${c.phone}` : ''}
                    {c.lat != null && ' · ya tiene ubicación'}
                  </span>
                </span>
                <button onClick={() => void asignar(c)} disabled={savingId === c.id}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50 ${
                    c.lat != null
                      ? 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                  {savingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Crosshair size={13} />}
                  {c.lat != null ? 'Actualizar' : 'Ubicar acá'}
                </button>
              </div>
            ))}
            {resultados.length === 0 && (
              <p className="py-6 text-center text-sm font-bold text-gray-400">Ningún cliente coincide.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationCapturePage;
