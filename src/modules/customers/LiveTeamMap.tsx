import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ensureLeafletIcons } from '@/utils/leafletIcons';
import { useNavigate } from 'react-router-dom';
import {
  Home, Users, RefreshCw, Loader2, Radio, RadioTower, AlertCircle, Navigation,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { shareLocation } from '@/services/tracking/shareLocationService';
import { ShareLocationButton } from '@/components/ShareLocationToggle';
import { fmtCRTime } from '@/utils/crDate';

const CR_CENTER: [number, number] = [9.9281, -84.0907];

interface LivePos {
  truck_id: string;
  truck_name: string;
  driver_id: string | null;
  driver_name: string;
  is_person?: boolean;
  /** 'agente' | 'repartidor' — para rotular el pin con el oficio, no con el nombre a secas. */
  person_role?: string;
  lat: number; lng: number;
  speed?: number | null; accuracy?: number | null; battery?: number | null;
  recorded_at: string;
}

/** Cada cuánto se refresca el mapa. El envío propio lo pacea el servicio. */
const REFRESH_MS = 15_000;

/**
 * Dónde anda el equipo, en vivo.
 *
 * Es el mismo motor del rastreo de camiones, pero para PERSONAS: cualquiera que
 * ande en carro comparte su ubicación desde el teléfono y todos aparecen juntos
 * en el mapa. Sirve para saber quién está más cerca de un cliente que llamó, o
 * por qué una entrega va tarde, sin llamar a nadie para preguntar.
 */
export const LiveTeamMap: React.FC = () => {
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);

  const [people, setPeople] = useState<LivePos[]>([]);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(30);
  /**
   * Mi posición, pintada al instante.
   *
   * La del servidor tarda: se envía cada 20 s y el mapa se refresca cada 15. Sin
   * esto, quien enciende el GPS no se ve en el mapa por casi medio minuto y cree
   * que no funcionó.
   */
  const [yo, setYo] = useState<{ lat: number; lng: number } | null>(null);
  const yoRef = useRef<L.CircleMarker | null>(null);

  // ── Mapa ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !boxRef.current) return;
    ensureLeafletIcons();
    const map = L.map(boxRef.current).setView(CR_CENTER, 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    capaRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapRef.current = null; capaRef.current = null; };
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch<{ trucks: LivePos[] }>(`/routes/live?minutes=${minutes}`);
      setPeople(r?.trucks ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el mapa');
    } finally { setLoading(false); }
  }, [minutes]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    const id = setInterval(() => void cargar(), REFRESH_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Pines: se redibujan en cada refresco. Con pocos puntos es más simple y más
  // confiable que ir moviendo marcadores uno por uno.
  useEffect(() => {
    const capa = capaRef.current;
    const map = mapRef.current;
    if (!capa || !map) return;
    capa.clearLayers();

    for (const p of people) {
      const min = Math.round((Date.now() - new Date(p.recorded_at).getTime()) / 60000);
      const viejo = min > 10;
      const esAgente = p.person_role === 'agente';
      // Verde = agente de venta, azul = repartidor/camión, gris = sin señal
      // reciente. Sin el color y el oficio, la oficina no distinguía quién era
      // quién y todos los pines parecían lo mismo.
      const color = viejo ? '#9ca3af' : esAgente ? '#16a34a' : '#2563eb';
      const oficio = esAgente ? 'Agente de venta' : p.is_person ? 'Repartidor' : 'Camión';
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${color};color:#fff;border:2px solid #fff;
          border-radius:9999px;padding:3px 8px;font-size:11px;font-weight:800;
          box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap">
          ${p.driver_name}</div>`,
        iconAnchor: [30, 12],
      });
      L.marker([p.lat, p.lng], { icon }).addTo(capa).bindPopup(
        `<b>${p.driver_name}</b><br/>${oficio}`
        + (p.is_person ? '' : `<br/>${p.truck_name}`)
        + `<br/>Hace ${min < 1 ? 'menos de un minuto' : `${min} min`}`
        + (p.speed != null ? `<br/>${Math.round(p.speed)} km/h` : '')
        + (p.battery != null ? `<br/>Batería ${p.battery}%` : '')
        + `<br/><a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Cómo llegar</a>`,
      );
    }

    if (people.length > 0) {
      map.fitBounds(L.latLngBounds(people.map(p => [p.lat, p.lng] as [number, number])),
        { padding: [50, 50], maxZoom: 15 });
    }
  }, [people]);

  // ── Compartir mi ubicación ────────────────────────────────────────────────
  // Lo maneja el servicio, no esta pantalla: así el envío sigue aunque el
  // usuario se vaya al POS o cierre la app, y solo se corta cuando él lo apaga.
  useEffect(() => {
    setSharing(shareLocation.isOn());
    const off = shareLocation.subscribe(setSharing);
    return () => { off(); };
  }, []);

  // Mientras se comparte, la posición propia se sigue en vivo en el mapa.
  useEffect(() => {
    if (!sharing || !navigator.geolocation) { setYo(null); return; }
    const id = navigator.geolocation.watchPosition(
      p => setYo({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { /* el error ya lo maneja el servicio */ },
      { enableHighAccuracy: true, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [sharing]);

  // Pin propio: círculo azul, distinto de los pines del resto del equipo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!yo) {
      if (yoRef.current) { yoRef.current.remove(); yoRef.current = null; }
      return;
    }
    if (!yoRef.current) {
      yoRef.current = L.circleMarker([yo.lat, yo.lng], {
        radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1,
      }).addTo(map).bindPopup('Estás acá');
      map.setView([yo.lat, yo.lng], Math.max(map.getZoom(), 14));
    } else {
      yoRef.current.setLatLng([yo.lat, yo.lng]);
    }
  }, [yo]);

  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-6 space-y-3 flex flex-col">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <Users size={20} className="text-blue-600" /> Dónde anda el equipo
        </span>
        <span className="text-xs font-bold text-gray-400">
          {people.length} en el mapa · últimos {minutes} min
        </span>
        <div className="flex-1" />
        <select value={minutes} onChange={e => setMinutes(Number(e.target.value))}
          className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-700">
          <option value={15}>Últimos 15 min</option>
          <option value={30}>Últimos 30 min</option>
          <option value={120}>Últimas 2 horas</option>
          <option value={480}>Toda la jornada</option>
        </select>
        <button onClick={() => void cargar()} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
        <ShareLocationButton onError={setError} />
      </div>

      {sharing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-xs font-bold text-blue-800 flex items-center gap-2">
          <Navigation size={14} />
          Estás compartiendo tu ubicación con el equipo. Sigue activo aunque cambies de
          pantalla; se apaga solo cuando tocás «Dejar de compartir».
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex-1 min-h-[60vh]">
        <div ref={boxRef} className="w-full h-full min-h-[60vh]" />
      </div>

      {!loading && people.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs font-bold text-amber-800">
          Nadie está compartiendo su ubicación en este rango. Cada persona tiene que abrir esta
          pantalla en su teléfono y tocar «Compartir mi ubicación».
        </div>
      )}
    </div>
  );
};

export default LiveTeamMap;
