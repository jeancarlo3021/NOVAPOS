import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Crosshair, MapPin, Loader2, Navigation } from 'lucide-react';
import type { Customer } from '@/services/customers/customersService';

/** Centro por defecto: Costa Rica. */
const CR_CENTER: [number, number] = [9.9281, -84.0907];

/**
 * Mapa de clientes.
 *
 * Ver la cartera en el mapa contesta preguntas que una lista no puede: por dónde
 * conviene armar la ruta, qué clientes quedan cerca del que estoy visitando, y
 * cuáles todavía no tienen ubicación fijada.
 */
export const CustomersMapModal: React.FC<{
  customers: Customer[];
  onClose: () => void;
  /** Al tocar un cliente del mapa (para abrir su ficha). */
  onPick?: (c: Customer) => void;
}> = ({ customers, onClose, onPick }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [locating, setLocating] = useState(false);
  const [zone, setZone] = useState('');

  const zones = useMemo(
    () => [...new Set(customers.map(c => c.zone).filter(Boolean))].sort() as string[],
    [customers],
  );

  const conUbicacion = useMemo(
    () => customers.filter(c => c.lat != null && c.lng != null && (!zone || c.zone === zone)),
    [customers, zone],
  );
  const sinUbicacion = customers.length - customers.filter(c => c.lat != null && c.lng != null).length;

  useEffect(() => {
    if (mapRef.current || !boxRef.current) return;
    const map = L.map(boxRef.current).setView(CR_CENTER, 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Los pines se redibujan al cambiar de zona: así el mapa muestra solo la ruta
  // que se está mirando y no todo el país encima.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const capa = L.layerGroup().addTo(map);

    for (const c of conUbicacion) {
      const m = L.marker([c.lat as number, c.lng as number]).addTo(capa);
      const maps = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
      m.bindPopup(
        `<b>${c.name}</b>`
        + (c.zone ? `<br/><span style="color:#059669">${c.zone}</span>` : '')
        + (c.phone ? `<br/>${c.phone}` : '')
        + (c.address ? `<br/><span style="color:#6b7280">${c.address}</span>` : '')
        + `<br/><a href="${maps}" target="_blank" rel="noopener">Cómo llegar</a>`,
      );
      if (onPick) m.on('dblclick', () => onPick(c));
    }

    if (conUbicacion.length > 0) {
      map.fitBounds(
        L.latLngBounds(conUbicacion.map(c => [c.lat as number, c.lng as number] as [number, number])),
        { padding: [40, 40], maxZoom: 16 },
      );
    }
    return () => { capa.remove(); };
  }, [conUbicacion, onPick]);

  const irAMiUbicacion = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        const ll: [number, number] = [p.coords.latitude, p.coords.longitude];
        map.setView(ll, 15);
        L.circleMarker(ll, { radius: 8, color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.9 })
          .addTo(map).bindPopup('Estás acá').openPopup();
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full h-full sm:h-[85vh] sm:max-w-4xl bg-white sm:rounded-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0 flex-wrap">
          <span className="flex items-center gap-2 text-sm font-black text-gray-800">
            <MapPin size={16} className="text-emerald-600" /> Mapa de clientes
          </span>
          <span className="text-xs font-bold text-gray-400">
            {conUbicacion.length} en el mapa
            {sinUbicacion > 0 && ` · ${sinUbicacion} sin ubicación`}
          </span>
          <div className="flex-1" />
          {zones.length > 0 && (
            <select value={zone} onChange={e => setZone(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-700">
              <option value="">Todas las zonas</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          )}
          <button onClick={irAMiUbicacion} disabled={locating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {locating ? <Loader2 size={13} className="animate-spin" /> : <Crosshair size={13} />}
            Dónde estoy
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div ref={boxRef} className="flex-1 min-h-0" />

        {conUbicacion.length === 0 && (
          <div className="px-4 py-3 border-t border-amber-200 bg-amber-50 text-xs font-bold text-amber-800 flex items-center gap-2">
            <Navigation size={14} />
            Ningún cliente {zone ? `de la zona ${zone} ` : ''}tiene ubicación fijada. Usá el botón
            de ubicación en cada cliente cuando estés en su local.
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomersMapModal;
