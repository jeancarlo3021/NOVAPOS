import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, RefreshCw, MapPin, Loader2, Navigation, Battery, Radio } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useTenantId } from '@/hooks/useTenant';

// ── Tipos que devuelve GET /routes/live ─────────────────────────────────────
interface LiveTruck {
  truck_id: string;
  truck_name: string;
  driver_id: string | null;
  driver_name: string;
  route_id: string | null;
  lat: number; lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  battery: number | null;
  recorded_at: string;
  stops_total: number;
  stops_done: number;
  sales_total: number;
}
interface LiveStop {
  route_id: string; customer_id: string; seq: number;
  lat: number; lng: number; status: string;
}
interface LiveData { trucks: LiveTruck[]; stops: LiveStop[]; }

// Centro por defecto: Costa Rica [lat, lng] (Leaflet usa lat,lng).
const CR_CENTER: [number, number] = [9.9281, -84.0907];
// Refresco del mapa. Realtime da lo instantáneo; este polling asegura que se
// mueva aunque Realtime no esté habilitado en Supabase.
const REFRESH_MS = 10_000;

// Camiones de simulación: 3 recorridos en distintas ciudades [lng, lat].
interface SimTruck { id: string; name: string; driver: string; color: string; waypoints: [number, number][]; }
const SIM_TRUCKS: SimTruck[] = [
  {
    id: 'sim-sj', name: 'Camión San José', driver: 'Sim · San José', color: '#0891b2',
    waypoints: [
      [-84.0907, 9.9281], [-84.0785, 9.9350], [-84.0650, 9.9410],
      [-84.0500, 9.9455], [-84.0355, 9.9330], [-84.0210, 9.9200],
      [-84.0400, 9.9120], [-84.0650, 9.9180],
    ],
  },
  {
    id: 'sim-ala', name: 'Camión Alajuela', driver: 'Sim · Alajuela', color: '#d97706',
    waypoints: [
      [-84.2117, 10.0162], [-84.2050, 10.0215], [-84.1975, 10.0175],
      [-84.2010, 10.0095], [-84.2130, 10.0085], [-84.2185, 10.0150],
    ],
  },
  {
    id: 'sim-her', name: 'Camión Heredia', driver: 'Sim · Heredia', color: '#7c3aed',
    waypoints: [
      [-84.1165, 9.9985], [-84.1095, 10.0035], [-84.1045, 9.9990],
      [-84.1090, 9.9925], [-84.1185, 9.9915], [-84.1215, 9.9970],
    ],
  },
];

const fmtCol = (n: number) => `₡${Number(n ?? 0).toLocaleString('es-CR')}`;
const hace = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  return `hace ${Math.floor(s / 3600)}h`;
};
const stopColor = (status: string) =>
  status === 'visited' ? '#16a34a' : status === 'no_sale' ? '#dc2626' : '#9ca3af';

// Color por camión (los de simulación tienen el suyo; el resto, cian).
const SIM_COLOR: Record<string, string> = Object.fromEntries(SIM_TRUCKS.map(t => [t.id, t.color]));
const colorFor = (truckId: string) => SIM_COLOR[truckId] ?? '#0891b2';

// Ícono HTML del camión (rota según el rumbo). Leaflet lo dibuja sin WebGL.
function truckIcon(heading: number | null, color = '#0891b2'): L.DivIcon {
  return L.divIcon({
    className: 'nova-truck-marker',
    html: `<div style="transform: rotate(${heading ?? 0}deg); transition: transform .5s;">
        <div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:16px;">🚚</div>
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export const TruckTrackingMap: React.FC = () => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const truckMarkers = useRef<Map<string, L.Marker>>(new Map());
  const stopLayer = useRef<L.LayerGroup | null>(null);
  const didFit = useRef(false);
  // Estela (guía) del recorrido por camión.
  const trailPts = useRef<Map<string, [number, number][]>>(new Map());
  const trailLines = useRef<Map<string, L.Polyline>>(new Map());

  const { tenantId } = useTenantId();
  const [data, setData] = useState<LiveData>({ trucks: [], stops: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [live, setLive] = useState(false);          // ¿suscripción Realtime activa?
  const simRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Inicializa el mapa una vez (Leaflet, sin WebGL).
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    try {
      const map = L.map(containerRef.current, { zoomControl: true }).setView(CR_CENTER, 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map);
      stopLayer.current = L.layerGroup().addTo(map);
      // El contenedor a veces tiene 0px al montar (lazy/Suspense): recalcular.
      const t1 = setTimeout(() => map.invalidateSize(), 300);
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(containerRef.current);
      mapRef.current = map;
      return () => { clearTimeout(t1); ro.disconnect(); map.remove(); mapRef.current = null; };
    } catch (err: any) {
      setError(`No se pudo iniciar el mapa: ${err?.message || err}`);
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<LiveData>('/routes/live');
      setData({ trucks: d?.trucks ?? [], stops: d?.stops ?? [] });
      setError('');
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el rastreo');
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial + refresco periódico de RESPALDO (se pausa en modo simulación).
  useEffect(() => {
    if (simulating) return;
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, simulating]);

  // Suscripción Realtime: al cambiar truck_positions, refrescamos (debounced) para
  // traer los datos enriquecidos (nombres, paradas, ventas). Instantáneo, sin pagar.
  useEffect(() => {
    if (simulating || !tenantId) { setLive(false); return; }
    const bump = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => load(), 800);
    };
    const channel = supabase
      .channel(`truck_positions_${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'truck_positions', filter: `tenant_id=eq.${tenantId}` },
        bump)
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLive(false);
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
  }, [tenantId, simulating, load]);

  // ── Simulación de una ruta en Costa Rica (sin backend) ─────────────────────
  // Limpia la estela dibujada.
  const clearTrails = useCallback(() => {
    trailLines.current.forEach(l => mapRef.current?.removeLayer(l));
    trailLines.current.clear();
    trailPts.current.clear();
  }, []);

  const stopSim = useCallback(() => {
    if (simRef.current) { clearInterval(simRef.current); simRef.current = null; }
    setSimulating(false);
    didFit.current = false;
    clearTrails();
    setData({ trucks: [], stops: [] });
  }, [clearTrails]);

  // Ruta que sigue las CALLES (OSRM público); si falla, cae a línea recta.
  const roadPath = async (waypoints: [number, number][]): Promise<[number, number][]> => {
    try {
      const coords = waypoints.map(p => `${p[0]},${p[1]}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const j: any = await res.json();
      const g: number[][] | undefined = j?.routes?.[0]?.geometry?.coordinates; // [lng,lat][]
      if (Array.isArray(g) && g.length) return g.map(c => [c[1], c[0]] as [number, number]);
    } catch { /* fallback abajo */ }
    // Fallback: interpolación recta entre waypoints.
    const path: [number, number][] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i], b = waypoints[i + 1];
      for (let t = 0; t < 1; t += 0.1) path.push([a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t]);
    }
    return path;
  };

  const startSim = useCallback(async () => {
    setSimulating(true);
    didFit.current = false;
    clearTrails();
    // Paradas de los 3 camiones (cada waypoint es una parada).
    const stops: LiveStop[] = SIM_TRUCKS.flatMap(t =>
      t.waypoints.map((p, i) => ({
        route_id: t.id, customer_id: `${t.id}-${i}`, seq: i, lat: p[1], lng: p[0],
        status: i < 2 ? 'visited' : i === 2 ? 'no_sale' : 'pending',
      })),
    );
    // Ruta por calles de cada camión (en paralelo).
    const paths = await Promise.all(SIM_TRUCKS.map(t => roadPath(t.waypoints)));
    const idx = SIM_TRUCKS.map(() => 0);
    const tick = () => {
      const trucks: LiveTruck[] = SIM_TRUCKS.map((t, ti) => {
        const path = paths[ti];
        const cur = path[idx[ti]];
        const nxt = path[Math.min(idx[ti] + 1, path.length - 1)];
        const heading = (Math.atan2(nxt[1] - cur[1], nxt[0] - cur[0]) * 180 / Math.PI + 360) % 360;
        idx[ti] = (idx[ti] + 1) % path.length;
        const done = t.waypoints.filter((_, i) => i < 3).length;
        return {
          truck_id: t.id, truck_name: t.name, driver_id: t.id, driver_name: t.driver,
          route_id: t.id, lat: cur[0], lng: cur[1], speed: 28 + ti * 6, heading, accuracy: 8, battery: 90 - ti * 7,
          recorded_at: new Date().toISOString(),
          stops_total: t.waypoints.length, stops_done: done, sales_total: 30000 + ti * 15000,
        };
      });
      setData({ trucks, stops });
      // Cuando todos vuelven al inicio, limpiar estelas.
      if (idx.every(i => i === 0)) clearTrails();
    };
    tick();
    simRef.current = window.setInterval(tick, 250);
  }, [clearTrails]);

  useEffect(() => () => { if (simRef.current) clearInterval(simRef.current); }, []);

  // Pinta/actualiza marcadores cuando cambian los datos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Camiones + estela (guía) del recorrido.
    const seen = new Set<string>();
    for (const t of data.trucks) {
      seen.add(t.truck_id);
      const color = colorFor(t.truck_id);
      let mk = truckMarkers.current.get(t.truck_id);
      if (!mk) {
        mk = L.marker([t.lat, t.lng], { icon: truckIcon(t.heading, color) }).addTo(map);
        mk.on('click', () => setSelected(t.truck_id));
        truckMarkers.current.set(t.truck_id, mk);
      } else {
        mk.setLatLng([t.lat, t.lng]);
        mk.setIcon(truckIcon(t.heading, color));
      }
      // Acumular el punto en la estela (si se movió) y redibujar la línea.
      const arr = trailPts.current.get(t.truck_id) ?? [];
      const last = arr[arr.length - 1];
      if (!last || last[0] !== t.lat || last[1] !== t.lng) arr.push([t.lat, t.lng]);
      if (arr.length > 1000) arr.shift();   // tope para no crecer sin fin
      trailPts.current.set(t.truck_id, arr);
      let line = trailLines.current.get(t.truck_id);
      if (!line) {
        line = L.polyline(arr, { color: colorFor(t.truck_id), weight: 4, opacity: 0.55 }).addTo(map);
        trailLines.current.set(t.truck_id, line);
      } else {
        line.setLatLngs(arr);
      }
    }
    for (const [id, mk] of truckMarkers.current) {
      if (!seen.has(id)) { map.removeLayer(mk); truckMarkers.current.delete(id); }
    }
    // Quitar estelas de camiones que ya no reportan.
    for (const [id, line] of trailLines.current) {
      if (!seen.has(id)) { map.removeLayer(line); trailLines.current.delete(id); trailPts.current.delete(id); }
    }

    // Paradas (se repintan completas).
    stopLayer.current?.clearLayers();
    for (const s of data.stops) {
      L.circleMarker([s.lat, s.lng], {
        radius: 6, color: '#fff', weight: 2, fillColor: stopColor(s.status), fillOpacity: 1,
      }).addTo(stopLayer.current!);
    }

    // Encuadrar la primera vez que hay datos.
    if (!didFit.current && (data.trucks.length || data.stops.length)) {
      const pts: [number, number][] = [
        ...data.trucks.map(t => [t.lat, t.lng] as [number, number]),
        ...data.stops.map(s => [s.lat, s.lng] as [number, number]),
      ];
      if (pts.length) { map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 }); didFit.current = true; }
    }
  }, [data]);

  const flyTo = (t: LiveTruck) => {
    setSelected(t.truck_id);
    mapRef.current?.flyTo([t.lat, t.lng], 15);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="bg-linear-to-r from-cyan-600 to-blue-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><Navigation size={22} /></div>
            <div>
              <h1 className="text-xl font-black">Rastreo de camiones</h1>
              <p className="text-white/80 text-sm flex items-center gap-1.5">
                {data.trucks.length} camión(es) activo(s)
                <span className="opacity-60">·</span>
                {simulating ? 'simulación'
                  : live ? <span className="inline-flex items-center gap-1"><Radio size={12} className="animate-pulse" /> en vivo</span>
                  : 'cada 45s'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={simulating ? stopSim : startSim}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition ${simulating ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-white/15 hover:bg-white/25'}`}>
              <Truck size={15} /> {simulating ? 'Detener simulación' : 'Simular ruta CR'}
            </button>
            <button onClick={load} disabled={simulating}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/15 hover:bg-white/25 disabled:opacity-40 rounded-xl text-sm font-bold transition">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Mapa */}
        <div className="lg:col-span-3 relative rounded-2xl overflow-hidden border border-gray-200" style={{ height: '70vh' }}>
          <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />
          {loading && data.trucks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-gray-500 gap-2" style={{ zIndex: 500 }}>
              <Loader2 size={18} className="animate-spin" /> Cargando mapa…
            </div>
          )}
        </div>

        {/* Panel lateral: lista de camiones */}
        <div className="space-y-2">
          <h2 className="text-sm font-black text-gray-700 flex items-center gap-1.5"><Truck size={15} /> Camiones</h2>
          {data.trucks.length === 0 && !loading && (
            <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
              Ningún camión reportando ahora. Aparecen cuando un repartidor abre su ruta con rastreo activo.
            </div>
          )}
          {data.trucks.map(t => (
            <button key={t.truck_id} onClick={() => flyTo(t)}
              className={`w-full text-left rounded-xl border p-3 transition ${selected === t.truck_id ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200 hover:border-cyan-300 bg-white'}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🚚</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-800 text-sm truncate">{t.truck_name}</p>
                  <p className="text-xs text-gray-500 truncate">{t.driver_name}</p>
                </div>
                {t.battery != null && (
                  <span className="text-[11px] text-gray-400 flex items-center gap-0.5"><Battery size={12} /> {t.battery}%</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                <span className="flex items-center gap-0.5"><MapPin size={11} /> {t.stops_done}/{t.stops_total} paradas</span>
                {t.speed != null && <span>{Math.round(t.speed)} km/h</span>}
                <span className="ml-auto">{hace(t.recorded_at)}</span>
              </div>
              {t.sales_total > 0 && (
                <p className="text-xs font-bold text-emerald-600 mt-1">{fmtCol(t.sales_total)} vendido</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TruckTrackingMap;
