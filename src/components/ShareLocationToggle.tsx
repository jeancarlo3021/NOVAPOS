import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, RadioTower, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { shareLocation } from '@/services/tracking/shareLocationService';

/**
 * Indicador y apagador de "compartiendo ubicación".
 *
 * Compartir la ubicación es algo que la persona tiene que poder ver y CORTAR en
 * cualquier momento, sin ir a buscar la pantalla donde lo encendió. Mientras
 * está activo se ve una píldora fija; tocarla lo apaga.
 */
export const ShareLocationToggle: React.FC = () => {
  const navigate = useNavigate();
  const { planFeatures } = useAuth();
  const [on, setOn] = useState(shareLocation.isOn());

  useEffect(() => {
    // Si quedó encendido de antes, se retoma al abrir la app. Compartir ubicación
    // no es solo de distribución: los agentes de venta salen en el mismo mapa, y
    // exigir la bandera de rastreo dejaba la píldora muerta para ellos.
    const pf = planFeatures as any;
    const puede = pf?.tracking || pf?.sales_agents || pf?.distribution || pf?.customers !== false;
    if (puede) void shareLocation.resumeIfWasOn();
    setOn(shareLocation.isOn());
    const off = shareLocation.subscribe(setOn);
    return () => { off(); };
  }, [planFeatures]);

  if (!on) return null;

  return (
    <div className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-1.5
                    bg-blue-600 text-white rounded-full pl-3 pr-1.5 py-1.5 shadow-lg">
      <button onClick={() => navigate('/equipo-en-vivo')}
        className="flex items-center gap-1.5 text-xs font-black">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute h-2 w-2 rounded-full bg-white/70" />
          <span className="relative rounded-full h-2 w-2 bg-white" />
        </span>
        <RadioTower size={14} /> Compartiendo ubicación
      </button>
      <button onClick={() => shareLocation.stop()} title="Dejar de compartir"
        className="p-1 rounded-full hover:bg-white/20">
        <X size={14} />
      </button>
    </div>
  );
};

/** Botón para encender/apagar, para usar dentro de una pantalla. */
export const ShareLocationButton: React.FC<{ onError?: (msg: string) => void }> = ({ onError }) => {
  const [on, setOn] = useState(shareLocation.isOn());
  useEffect(() => {
    const off = shareLocation.subscribe(setOn);
    return () => { off(); };
  }, []);

  return (
    <button
      onClick={async () => {
        if (shareLocation.isOn()) { shareLocation.stop(); return; }
        const err = await shareLocation.start();
        if (err) onError?.(err);
      }}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black ${
        on ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
    >
      {on ? <><RadioTower size={15} /> Dejar de compartir</> : <><Radio size={15} /> Compartir mi ubicación</>}
    </button>
  );
};

export default ShareLocationToggle;
