'use client';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, Sparkles, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { GRUPOS_RAMAS, type Rama } from './ramas';

/**
 * EL PANEL DE RAMAS.
 *
 * Un mapa del módulo contable, agrupado por el momento del mes en que se usa
 * cada parte.
 *
 * ── Por qué cada rama dice «cuándo» ──────────────────────────────────────
 * Una lista de nombres contables no ayuda a quien no es contador: «mayor»,
 * «balance de comprobación» y «antigüedad de saldos» suenan todos igual de
 * ajenos. Lo que hace falta no es la definición, es saber en qué momento uno
 * necesita cada uno. Por eso cada rama dice qué es Y cuándo se usa.
 *
 * ── Las que el plan no incluye ───────────────────────────────────────────
 * No se esconden: se muestran apagadas y con el motivo. Esconderlas hace que
 * el dueño crea que el sistema no tiene algo que sí tiene.
 */

interface Props {
  activa: string;
  onElegir: (id: string) => void;
  onCerrar: () => void;
}

export const RamasPanel: React.FC<Props> = ({ activa, onElegir, onCerrar }) => {
  const navigate = useNavigate();
  const { planFeatures } = useAuth();
  const [busca, setBusca] = React.useState('');

  const habilitada = (r: Rama) =>
    !r.feature || (planFeatures as any)?.[r.feature] === true;

  const q = busca.trim().toLowerCase();
  const coincide = (r: Rama) =>
    !q || `${r.label} ${r.que} ${r.cuando}`.toLowerCase().includes(q);

  const grupos = GRUPOS_RAMAS
    .map(g => ({ ...g, ramas: g.ramas.filter(coincide) }))
    .filter(g => g.ramas.length > 0);

  const abrir = (r: Rama) => {
    if (!habilitada(r)) return;
    if (r.ruta) { navigate(r.ruta); return; }
    onElegir(r.id);
    onCerrar();
  };

  // Escape cierra: el panel tapa la pantalla y hay que poder salir sin mouse.
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 sm:p-6 overflow-y-auto"
      onClick={onCerrar}>
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl my-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 px-4 sm:px-6 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-gray-900">Las ramas de la contabilidad</h2>
            <p className="text-xs text-gray-500">
              El módulo completo, por el momento del mes en que se usa cada parte.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative hidden sm:block">
              <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar rama…" autoFocus
                className="w-44 border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 text-sm" />
            </div>
            <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Cerrar">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          <div className="sm:hidden relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar rama…"
              className="w-full border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 text-sm" />
          </div>

          {grupos.length === 0 && (
            <p className="text-sm text-gray-500">Ninguna rama coincide con «{busca}».</p>
          )}

          {grupos.map(g => (
            <section key={g.id}>
              <div className="mb-2">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">{g.label}</h3>
                <p className="text-[11px] text-gray-400 leading-snug">{g.nota}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {g.ramas.map(r => {
                  const ok = habilitada(r);
                  const esActiva = !r.ruta && r.id === activa;
                  return (
                    <button key={r.id} onClick={() => abrir(r)} disabled={!ok}
                      className={`text-left rounded-xl border-2 p-3 transition ${
                        !ok ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-70'
                        : esActiva ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <r.icon size={15} className={ok ? 'text-indigo-600 shrink-0' : 'text-gray-400 shrink-0'} />
                        <span className="text-sm font-bold text-gray-900 truncate">{r.label}</span>
                        {r.nueva && ok && (
                          <span className="flex items-center gap-0.5 text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded shrink-0">
                            <Sparkles size={8} /> nuevo
                          </span>
                        )}
                        {r.ruta && ok && <ExternalLink size={11} className="text-gray-400 shrink-0 ml-auto" />}
                      </div>
                      <p className="text-[11px] text-gray-600 leading-snug">{r.que}</p>
                      <p className="text-[11px] text-gray-400 leading-snug mt-1">
                        <b className="font-bold text-gray-500">Cuándo:</b> {r.cuando}
                      </p>
                      {!ok && (
                        <p className="text-[10px] font-bold text-amber-700 mt-1.5">
                          No está incluida en tu plan.
                        </p>
                      )}
                      {esActiva && (
                        <p className="text-[10px] font-black text-indigo-700 mt-1.5 uppercase">Estás acá</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RamasPanel;
