import { Bell, Check } from 'lucide-react';
import type { Llamada } from '@/services/mesaDigital/mesaDigitalService';
import { TIPO_LLAMADA, haceCuanto } from './useLlamadasMesa';

interface Props {
  llamadas: Llamada[];
  /** Entrar a la mesa que llamó (si se pudo enlazar con el mapa). */
  onIr?: (numero: number) => void;
  /** Resolver el aviso de un toque. */
  onAtender: (id: string) => void;
  /** Compacta: una sola fila, para la pantalla de la cuenta. */
  compacta?: boolean;
}

const COLOR: Record<string, string> = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
};

/**
 * LOS AVISOS DE LAS MESAS (ColónTab), dentro de la pantalla del salón.
 *
 * El cliente toca el QR de su mesa y pide la cuenta, o llama al mesero. Ese
 * aviso vivía en otra pantalla —la del panel de Mesa Digital— y el mesero, que
 * trabaja en el mapa, no lo veía nunca. Acá está donde ya está mirando.
 *
 * Una fila por mesa, grande, con cuánto lleva esperando y un solo botón para
 * cerrarla. Nada más: el que atiende tiene una bandeja en la mano.
 */
export function BarraLlamadas({ llamadas, onIr, onAtender, compacta = false }: Props) {
  if (llamadas.length === 0) return null;

  return (
    <div className={`shrink-0 bg-slate-900 ${compacta ? 'px-3 py-1.5' : 'px-4 py-2'}`}>
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="flex items-center gap-1.5 text-white font-black text-xs shrink-0 pr-1">
          <Bell size={14} className="animate-bounce" />
          {llamadas.length} mesa{llamadas.length !== 1 ? 's' : ''} llamando
        </span>
        {llamadas.map(l => {
          const t = TIPO_LLAMADA[l.tipo];
          return (
            <div key={l.id}
              className={`flex items-center gap-2 rounded-xl pl-3 pr-1.5 py-1 shrink-0 ${COLOR[t.color] ?? 'bg-slate-600'}`}>
              <button onClick={() => onIr?.(l.numero)}
                disabled={!onIr}
                title={onIr ? 'Abrir esta mesa' : undefined}
                className="text-left text-white disabled:cursor-default">
                <p className="text-sm font-black leading-tight">
                  {t.emoji} Mesa {l.numero}
                  {l.personas ? <span className="font-normal"> · {l.personas} pers.</span> : null}
                </p>
                <p className="text-[10px] font-bold text-white/80 leading-tight">
                  {t.texto} · {haceCuanto(l.created_at)}
                  {l.medio_pago ? ` · ${l.medio_pago}` : ''}
                </p>
              </button>
              <button onClick={() => onAtender(l.id)}
                title="Ya la atendí"
                className="w-8 h-8 rounded-lg bg-white/25 hover:bg-white/40 text-white flex items-center justify-center shrink-0">
                <Check size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BarraLlamadas;
