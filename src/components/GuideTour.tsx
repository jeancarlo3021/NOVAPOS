import React, { useEffect, useLayoutEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import type { GuideStep } from '@/modules/help/moduleGuides';

/**
 * Recorrido guiado sobre la pantalla real.
 *
 * En vez de describir el botón con palabras ("tocá Cobrar arriba a la derecha"),
 * lo SEÑALA: oscurece el resto, deja el botón iluminado y pone la viñeta pegada
 * a él. El usuario ve el paso y el botón al mismo tiempo, que es la diferencia
 * entre entender y adivinar.
 *
 * Cada paso apunta a un elemento por `data-tour`. Si el elemento no está en esa
 * pantalla (porque depende del plan o del momento), el paso se muestra centrado
 * igual: la guía nunca se corta a la mitad.
 */
export const GuideTour: React.FC<{
  steps: GuideStep[];
  onClose: () => void;
}> = ({ steps, onClose }) => {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];

  // Se recalcula en cada paso y al mover la pantalla: si el usuario hace scroll
  // o gira la tablet, la viñeta tiene que seguir al botón.
  useLayoutEffect(() => {
    const find = () => {
      if (!step?.target) { setRect(null); return; }
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setRect(el.getBoundingClientRect());
    };
    find();
    const t = setTimeout(find, 350);            // tras el scroll suave
    window.addEventListener('resize', find);
    window.addEventListener('scroll', find, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', find);
      window.removeEventListener('scroll', find, true);
    };
  }, [step?.target, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI(v => Math.min(steps.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length, onClose]);

  if (!step) return null;

  const ultimo = i === steps.length - 1;
  const pad = 8;

  // La viñeta va debajo del elemento; si no cabe, arriba. Centrada si no hay
  // elemento al que apuntar.
  const bubbleStyle: React.CSSProperties = rect
    ? (() => {
        const abajo = rect.bottom + 190 < window.innerHeight;
        return {
          top: abajo ? rect.bottom + pad + 10 : Math.max(12, rect.top - pad - 200),
          left: Math.min(Math.max(12, rect.left + rect.width / 2 - 160), window.innerWidth - 332),
          width: 320,
        };
      })()
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 320 };

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Fondo: bloquea el resto de la pantalla y deja el elemento visible. */}
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />

      {rect && (
        <div
          className="absolute rounded-xl pointer-events-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px #2563eb',
            transition: 'all .2s ease',
          }}
        />
      )}

      <div
        className="absolute bg-white rounded-2xl shadow-2xl p-4 space-y-3"
        style={bubbleStyle}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-[11px] font-black text-blue-600 uppercase">
              Paso {i + 1} de {steps.length}
            </span>
            <span className="block text-sm font-black text-gray-900">{step.title}</span>
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 shrink-0">
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <p className="text-[13px] font-semibold text-gray-600 leading-snug">{step.detail}</p>

        {!rect && step.target && (
          <p className="text-[11px] font-bold text-amber-700">
            Este botón no está en esta pantalla ahora mismo (puede depender del plan
            o de que la caja esté abierta).
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setI(v => Math.max(0, v - 1))}
            disabled={i === 0}
            className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-black hover:bg-gray-50 disabled:opacity-40"
          >
            <ArrowLeft size={13} className="inline" /> Anterior
          </button>
          <button
            onClick={() => (ultimo ? onClose() : setI(v => v + 1))}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black"
          >
            {ultimo ? <><Check size={14} /> Terminar</> : <>Siguiente paso <ArrowRight size={14} /></>}
          </button>
        </div>

        {/* Puntitos: cuánto falta, y se puede saltar a cualquier paso. */}
        <div className="flex items-center justify-center gap-1.5">
          {steps.map((_, n) => (
            <button
              key={n}
              onClick={() => setI(n)}
              aria-label={`Paso ${n + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                n === i ? 'w-5 bg-blue-600' : 'w-1.5 bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default GuideTour;
