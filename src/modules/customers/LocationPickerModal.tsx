import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, X, Crosshair, Check } from 'lucide-react';

interface Props {
  lat?: number | null;
  lng?: number | null;
  title?: string;
  onSave: (lat: number, lng: number) => void;
  onClose: () => void;
}

// Centro por defecto: Costa Rica [lat, lng].
const CR_CENTER: [number, number] = [9.9281, -84.0907];

// Pin arrastrable para fijar la ubicación de un cliente. Usa Leaflet (sin WebGL).
export const LocationPickerModal: React.FC<Props> = ({ lat, lng, title, onSave, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const hasInitial = lat != null && lng != null;
  const [pos, setPos] = useState<[number, number] | null>(hasInitial ? [lat as number, lng as number] : null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const start: [number, number] = hasInitial ? [lat as number, lng as number] : CR_CENTER;
    const map = L.map(containerRef.current).setView(start, hasInitial ? 16 : 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);

    const place = (ll: L.LatLng) => {
      setPos([ll.lat, ll.lng]);
      if (!markerRef.current) {
        markerRef.current = L.marker(ll, { draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const p = markerRef.current!.getLatLng();
          setPos([p.lat, p.lng]);
        });
      } else {
        markerRef.current.setLatLng(ll);
      }
    };
    if (hasInitial) place(L.latLng(lat as number, lng as number));
    // Clic en el mapa = mover/fijar el pin.
    map.on('click', (e: L.LeafletMouseEvent) => place(e.latlng));

    setTimeout(() => map.invalidateSize(), 250);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Botón "usar mi ubicación" (GPS del navegador).
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const ll = L.latLng(p.coords.latitude, p.coords.longitude);
        mapRef.current?.setView(ll, 16);
        setPos([ll.lat, ll.lng]);
        if (!markerRef.current) {
          markerRef.current = L.marker(ll, { draggable: true }).addTo(mapRef.current!);
          markerRef.current.on('dragend', () => {
            const q = markerRef.current!.getLatLng();
            setPos([q.lat, q.lng]);
          });
        } else { markerRef.current.setLatLng(ll); }
      },
      () => alert('No se pudo obtener tu ubicación. Revisá los permisos de ubicación del navegador.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
            <MapPin size={18} className="text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-gray-900 truncate">Ubicación {title ? `· ${title}` : ''}</h3>
            <p className="text-xs text-gray-500">Tocá el mapa para fijar el pin (o arrastralo)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="relative" style={{ height: '55vh' }}>
          <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />
          <button onClick={useMyLocation}
            className="absolute top-3 left-3 z-[500] flex items-center gap-1.5 bg-white shadow-md rounded-lg px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
            <Crosshair size={14} /> Usar mi ubicación
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-mono flex-1 truncate">
            {pos ? `${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}` : 'Sin ubicación seleccionada'}
          </p>
          {pos && (
            <button onClick={() => { setPos(null); markerRef.current?.remove(); markerRef.current = null; }}
              className="px-3 py-2 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50">Quitar</button>
          )}
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button onClick={() => { if (pos) { onSave(pos[0], pos[1]); onClose(); } }} disabled={!pos}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40">
            <Check size={15} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;
