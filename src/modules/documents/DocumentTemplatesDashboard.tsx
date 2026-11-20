import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText, Receipt, FileSpreadsheet, Plus, Trash2, Copy, Star, Pencil, Loader2, Eye, AlertTriangle,
} from 'lucide-react';
import {
  documentTemplatesService, plantillaNueva,
  type DocTemplate, type DocKind,
} from '@/services/documents/documentTemplatesService';
import { renderDocumento, datosDeMuestra } from '@/services/documents/documentRenderService';
import { DocumentEditor } from './DocumentEditor';
import { useTenantId } from '@/hooks/useTenant';

const TIPOS: Array<{ kind: DocKind; label: string; icon: any; ayuda: string }> = [
  {
    kind: 'ticket', label: 'Tiquete', icon: Receipt,
    ayuda: 'El papel de la venta: rollo térmico de 58 u 80 mm, o el tiquete por navegador.',
  },
  {
    kind: 'hoja', label: 'Hoja / PDF', icon: FileText,
    ayuda: 'El comprobante en hoja carta o A4 — el que se imprime o se guarda como PDF.',
  },
  {
    kind: 'proforma', label: 'Proforma', icon: FileSpreadsheet,
    ayuda: 'La cotización que se le manda al cliente antes de la venta.',
  },
];

export const DocumentTemplatesDashboard: React.FC = () => {
  const { tenantId } = useTenantId();
  const [kind, setKind] = useState<DocKind>('ticket');
  const [rows, setRows] = useState<DocTemplate[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<DocTemplate | null>(null);
  const [err, setErr] = useState('');
  const [borrando, setBorrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      setRows(await documentTemplatesService.list(tenantId, kind));
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudieron cargar las plantillas');
    } finally { setCargando(false); }
  }, [tenantId, kind]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = () => {
    const t = plantillaNueva(kind, `${TIPOS.find(x => x.kind === kind)!.label} de ${new Date().toLocaleDateString('es-CR')}`);
    setEditando(t);
  };

  const duplicar = async (t: DocTemplate) => {
    if (!tenantId) return;
    try {
      const copia = await documentTemplatesService.save(tenantId, documentTemplatesService.duplicar(t));
      setRows(prev => [copia, ...prev]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo duplicar'); }
  };

  const marcarDefault = async (t: DocTemplate) => {
    if (!tenantId) return;
    try {
      await documentTemplatesService.save(tenantId, { ...t, isDefault: true });
      await cargar();
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo marcar'); }
  };

  const borrar = async (t: DocTemplate) => {
    if (!tenantId) return;
    setBorrando(t.id);
    try {
      await documentTemplatesService.remove(tenantId, t.id);
      setRows(prev => prev.filter(x => x.id !== t.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo borrar');
    } finally { setBorrando(null); }
  };

  const previa = (t: DocTemplate) => {
    const w = window.open('', '_blank', 'width=900,height=950');
    if (!w) { setErr('Habilitá las ventanas emergentes para ver la previa.'); return; }
    w.document.write(renderDocumento(t, datosDeMuestra(t.kind), { paraPantalla: true }));
    w.document.close();
  };

  if (editando && tenantId) {
    return (
      <DocumentEditor
        tenantId={tenantId}
        template={editando}
        onBack={() => { setEditando(null); cargar(); }}
        onSaved={(g) => setEditando(g)}
      />
    );
  }

  const info = TIPOS.find(x => x.kind === kind)!;
  const hayDefault = rows.some(r => r.isDefault);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h2 className="text-xl font-black text-gray-900">Plantillas de documento</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          El diseño del papel: dónde va cada dato, qué columnas lleva el detalle y qué dice el pie.
        </p>
      </div>

      {/* Tipo de documento */}
      <div className="flex gap-2 flex-wrap">
        {TIPOS.map(x => (
          <button key={x.kind} onClick={() => setKind(x.kind)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition ${
              kind === x.kind ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <x.icon size={15} /> {x.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 -mt-2">{info.ayuda}</p>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">{err}</div>
      )}

      {/* Sin ninguna marcada se imprime como siempre: hay que decirlo, o el
          negocio diseña una plantilla, imprime, y no entiende por qué sale
          igual que antes. */}
      {!cargando && rows.length > 0 && !hayDefault && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Ninguna está marcada con <b>«Usar al imprimir»</b>, así que este documento se sigue
            imprimiendo con el diseño de siempre. Marcá la estrella de la que quieras usar.
          </p>
        </div>
      )}

      <button onClick={crear}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black">
        <Plus size={16} /> Nueva plantilla de {info.label.toLowerCase()}
      </button>

      {cargando ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-gray-400 py-12 bg-white rounded-2xl border border-gray-100">
          <info.icon size={30} className="mx-auto mb-2 opacity-40" />
          <p className="font-semibold text-gray-600">Todavía no hay plantillas de {info.label.toLowerCase()}</p>
          <p className="text-xs mt-1">
            Se crea con el documento ya armado —logo, datos, detalle y totales— y de ahí se mueve lo que quiera.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(t => (
            <div key={t.id} className={`bg-white rounded-2xl border-2 p-4 ${t.isDefault ? 'border-amber-300' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-gray-900 truncate">{t.name}</p>
                  <p className="text-xs text-gray-400">
                    {t.widthMm} mm{t.heightMm ? ` × ${t.heightMm} mm` : ' · rollo'}
                    {' · '}{new Date(t.updatedAt).toLocaleDateString('es-CR')}
                  </p>
                </div>
                <button onClick={() => marcarDefault(t)} title={t.isDefault ? 'Es la que se usa al imprimir' : 'Usar esta al imprimir'}
                  className={`p-1.5 rounded-lg ${t.isDefault ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}>
                  <Star size={17} fill={t.isDefault ? 'currentColor' : 'none'} />
                </button>
              </div>
              {t.isDefault && (
                <p className="text-[11px] font-bold text-amber-700 mt-1">Se usa al imprimir</p>
              )}
              <div className="flex items-center gap-1 mt-3">
                <button onClick={() => setEditando(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800">
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => previa(t)} title="Vista previa"
                  className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Eye size={14} /></button>
                <button onClick={() => duplicar(t)} title="Duplicar"
                  className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Copy size={14} /></button>
                <button onClick={() => borrar(t)} disabled={borrando === t.id} title="Borrar"
                  className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">
                  {borrando === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentTemplatesDashboard;
