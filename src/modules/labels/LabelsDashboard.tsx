'use client';

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Plus, Tag, Trash2, Pencil, X, Check } from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import {
  labelTemplatesService, LABEL_SIZE_PRESETS, DESIGN_SCALE, type LabelTemplate,
} from '@/services/labels/labelTemplatesService';
import { LabelEditor } from './LabelEditor';

export const LabelsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useTenantId();
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [editing, setEditing] = useState<LabelTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = () => { if (tenantId) setTemplates(labelTemplatesService.list(tenantId)); };
  useEffect(() => { reload(); }, [tenantId]);

  if (editing && tenantId) {
    return (
      <div className="h-screen bg-gray-50">
        <LabelEditor tenantId={tenantId} template={editing}
          onBack={() => { setEditing(null); reload(); }}
          onSaved={() => reload()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">
            <Home size={16} /> Menú
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Tag size={22} className="text-blue-600" /> Etiquetas</h1>
            <p className="text-sm text-gray-400">Plantillas para imprimir etiquetas de productos</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm">
            <Plus size={16} /> Nueva plantilla
          </button>
        </div>

        {/* Lista */}
        {templates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-400">
            <Tag size={48} className="mx-auto mb-3 text-gray-200" />
            <p className="font-semibold">Aún no hay plantillas de etiquetas.</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 text-blue-600 font-bold hover:underline">Crear la primera</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                {/* Mini preview */}
                <div className="bg-gray-50 rounded-xl flex items-center justify-center p-2 h-28 overflow-hidden">
                  <div className="relative bg-white shadow-sm border border-gray-200"
                    style={{ width: t.widthMm * (DESIGN_SCALE * 0.5), height: t.heightMm * (DESIGN_SCALE * 0.5) }}>
                    {t.elements.slice(0, 6).map(el => (
                      <div key={el.id} className="absolute bg-gray-300 rounded-sm"
                        style={{ left: el.x * 0.5, top: el.y * 0.5, width: (el.width ?? (el.fontSize ?? 10) * 4) * 0.5, height: (el.height ?? (el.fontSize ?? 10)) * 0.5 }} />
                    ))}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-black text-gray-900 truncate">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.widthMm} × {t.heightMm} mm · {t.elements.length} elementos</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(t)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 font-bold py-2 rounded-lg text-sm hover:bg-blue-100">
                    <Pencil size={13} /> Editar
                  </button>
                  <button onClick={() => { if (tenantId && confirm(`¿Eliminar "${t.name}"?`)) { labelTemplatesService.remove(tenantId, t.id); reload(); } }}
                    className="px-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && tenantId && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(name, w, h) => {
            const tpl = labelTemplatesService.create(tenantId, name, w, h);
            setShowCreate(false); reload(); setEditing(tpl);
          }}
        />
      )}
    </div>
  );
};

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, w: number, h: number) => void }) {
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(0);
  const [custom, setCustom] = useState(false);
  const [w, setW] = useState(40);
  const [h, setH] = useState(30);

  const create = () => {
    if (!name.trim()) return;
    if (custom) onCreate(name.trim(), Math.max(10, w), Math.max(10, h));
    else onCreate(name.trim(), LABEL_SIZE_PRESETS[preset].w, LABEL_SIZE_PRESETS[preset].h);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900 flex items-center gap-2"><Tag size={18} className="text-blue-600" /> Nueva plantilla</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre de la plantilla *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="Ej. Etiqueta góndola"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Tamaño de la etiqueta</label>
            <div className="grid grid-cols-2 gap-2">
              {LABEL_SIZE_PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => { setPreset(i); setCustom(false); }}
                  className={`p-2.5 rounded-xl border-2 text-sm font-bold transition ${!custom && preset === i ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => setCustom(true)}
                className={`p-2.5 rounded-xl border-2 text-sm font-bold col-span-2 transition ${custom ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                Personalizado
              </button>
            </div>
            {custom && (
              <div className="flex items-center gap-2 mt-2">
                <input type="number" value={w} onChange={e => setW(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-gray-400 text-sm">×</span>
                <input type="number" value={h} onChange={e => setH(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-gray-400 text-xs">mm</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm">Cancelar</button>
          <button onClick={create} disabled={!name.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm">
            <Check size={15} /> Crear
          </button>
        </div>
      </div>
    </div>
  );
}

export default LabelsDashboard;
