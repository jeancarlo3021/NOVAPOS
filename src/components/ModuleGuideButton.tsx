import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HelpCircle, X, Check, Lightbulb, AlertTriangle, ArrowRight } from 'lucide-react';
import { guideForPath, type ModuleGuide } from '@/modules/help/moduleGuides';
import { useAuth } from '@/context/AuthContext';

/** La guía de cada módulo se muestra sola UNA vez por dispositivo. */
const seenKey = (k: string) => `guide_seen_${k}`;

/**
 * Botón de ayuda del módulo — SOLO en negocios de DEMO.
 *
 * En una demo el que entra está viendo el sistema por primera vez y la guía es
 * justo lo que necesita. En un negocio que ya trabaja, un cartel que se abre
 * solo en medio de la caja estorba: ahí no aparece nada.
 *
 * Va montado en el layout, así cada pantalla lo tiene sin tener que tocarla. La
 * primera vez que se entra a un módulo se abre sola; después queda a un toque.
 */
export const ModuleGuideButton: React.FC = () => {
  const { pathname } = useLocation();
  const { tenant, planFeatures } = useAuth();
  const esDemo = tenant?.is_demo === true;
  const guide = esDemo ? guideForPath(pathname) : null;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!guide) return;
    let visto = true;
    try { visto = localStorage.getItem(seenKey(guide.key)) === '1'; } catch { /* sin storage */ }
    if (!visto) setOpen(true);
  }, [guide?.key]);

  if (!guide) return null;

  // La ayuda tiene que hablar SOLO de lo que este negocio tiene contratado.
  // Explicarle facturación electrónica a quien no la compró es ruido, y peor:
  // le hace creer que algo le falta configurar.
  const tiene = (f?: string) => !f || (planFeatures as any)?.[f] === true;
  const visible: ModuleGuide = {
    ...guide,
    requires: (guide.requires ?? []).filter(r => tiene(r.feature)),
    steps: guide.steps.filter(st => tiene(st.feature)),
    tips: (guide.tips ?? [])
      .map(t => (typeof t === 'string' ? { text: t } : t))
      .filter(t => tiene(t.feature))
      .map(t => t.text),
  };

  const cerrar = () => {
    setOpen(false);
    try { localStorage.setItem(seenKey(guide.key), '1'); } catch { /* sin storage */ }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Cómo se usa: ${guide.title}`}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center"
      >
        <HelpCircle size={22} />
      </button>

      {open && <GuidePanel guide={visible} onClose={cerrar} />}
    </>
  );
};

const GuidePanel: React.FC<{ guide: ModuleGuide; onClose: () => void }> = ({ guide, onClose }) => {
  const navigate = useNavigate();

  /**
   * Lleva al lugar exacto y deja la pantalla marcada.
   *
   * Decir "andá a Configuración → Etiquetadora" obliga a buscar; el paso se
   * toca y el sistema abre esa pestaña. El resaltado hace el resto: al llegar,
   * el módulo destacado parpadea para que se vea a dónde había que ir.
   */
  const irA = (to: string) => {
    onClose();
    try { sessionStorage.setItem('guide_highlight', to); } catch { /* sin storage */ }
    navigate(to);
  };

  return (
  <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
    onClick={onClose}>
    <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[88vh]"
      onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
        <span className="min-w-0">
          <span className="block text-sm font-black text-gray-900">Cómo se usa · {guide.title}</span>
          <span className="block text-xs font-semibold text-gray-500">{guide.intro}</span>
        </span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 shrink-0">
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
        {/* Requisitos ANTES de los pasos: la causa número uno de "no me sirve"
            no es que el módulo falle, es que falta configurar lo de antes. */}
        {!!guide.requires?.length && (
          <div className="border-2 border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase">
              <AlertTriangle size={14} /> Antes de empezar
            </p>
            <ul className="space-y-1.5">
              {guide.requires.map((r, i) => {
                const contenido = (
                  <>
                    <span className="font-black text-gray-800">{r.what}</span>
                    {r.where && <span className="font-bold text-amber-800"> · {r.where}</span>}
                    {r.why && <span className="block font-semibold text-gray-600">{r.why}</span>}
                  </>
                );
                return r.to ? (
                  <li key={i}>
                    <button onClick={() => irA(r.to!)}
                      className="w-full text-left text-[13px] leading-snug flex items-start gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-amber-100/70 transition">
                      <span className="min-w-0">{contenido}</span>
                      <ArrowRight size={14} className="shrink-0 mt-0.5 text-amber-700" />
                    </button>
                  </li>
                ) : (
                  <li key={i} className="text-[13px] leading-snug px-2 -mx-2">{contenido}</li>
                );
              })}
            </ul>
          </div>
        )}

        <ol className="space-y-3">
          {guide.steps.map((st, i) => {
            const cuerpo = (
              <>
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-gray-800">
                    {st.title}
                    {st.to && <ArrowRight size={13} className="inline ml-1 text-blue-600" />}
                  </span>
                  <span className="block text-[13px] font-semibold text-gray-600 leading-snug">{st.detail}</span>
                </span>
              </>
            );
            return st.to ? (
              <li key={i}>
                <button onClick={() => irA(st.to!)}
                  className="w-full text-left flex gap-3 rounded-xl px-2 py-1.5 -mx-2 hover:bg-blue-50 transition">
                  {cuerpo}
                </button>
              </li>
            ) : (
              <li key={i} className="flex gap-3 px-2 -mx-2">{cuerpo}</li>
            );
          })}
        </ol>

        {!!guide.tips?.length && (
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            {(guide.tips as string[]).map((t, i) => (
              <p key={i} className="flex gap-2 text-[13px] font-semibold text-amber-800">
                <Lightbulb size={15} className="shrink-0 mt-0.5 text-amber-500" />
                <span className="min-w-0">{t}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-3 shrink-0">
        <button onClick={onClose}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm">
          <Check size={16} /> Entendido
        </button>
      </div>
    </div>
  </div>
  );
};

export default ModuleGuideButton;
