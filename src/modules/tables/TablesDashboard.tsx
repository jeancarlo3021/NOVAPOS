import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Save, Trash2, RotateCw, Plus, MousePointer2, Pencil,
  Eye, Grid as GridIcon, Download, Upload, Hand,
  Square, BoxSelect, Armchair, Copy, ClipboardPaste, Maximize2,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { MapItemShape } from './MapShapes';
import {
  tableMeta, STATUS_FILL, STATUS_LABEL, ZONE_COLORS, migrateItems, itemSize,
  type MapItem, type TableType, type TableStatus, type ItemKind,
} from './types';

const STORAGE_KEY = (tenantId: string) => `novapos_tables_map_${tenantId}`;
const CANVAS_W = 1600;
const CANVAS_H = 1000;
const SNAP_GRID = 16;

function uid(prefix = 'itm') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadItems(tenantId: string): MapItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(tenantId));
    if (!raw) return [];
    return migrateItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveItems(tenantId: string, items: MapItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY(tenantId), JSON.stringify(items));
  } catch { /* cuota llena */ }
}

// Para que zonas se rendericen detrás, paredes después, mesas/sillas arriba.
const KIND_Z: Record<ItemKind, number> = { zone: 0, wall: 1, table: 2, freeTable: 2, seat: 3 };

export function TablesDashboard() {
  const { tenantId } = useTenantId();
  const [items, setItems] = useState<MapItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [dirty, setDirty] = useState(false);

  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startW: number; startH: number; startX: number; startY: number } | null>(null);
  const clipboardRef = useRef<MapItem | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setItems(loadItems(tenantId));
    setDirty(false);
  }, [tenantId]);

  const selected = useMemo(() => items.find(i => i.id === selectedId) ?? null, [items, selectedId]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => KIND_Z[a.kind] - KIND_Z[b.kind]),
    [items],
  );

  const toSVGPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const tx = pt.matrixTransform(ctm.inverse());
    return { x: tx.x, y: tx.y };
  }, []);

  const handleItemPointerDown = useCallback((e: React.PointerEvent<SVGGElement>, id: string) => {
    if (!editMode) return;
    e.stopPropagation();
    const it = items.find(x => x.id === id);
    if (!it) return;
    setSelectedId(id);
    const p = toSVGPoint(e.clientX, e.clientY);
    dragRef.current = { id, offsetX: p.x - it.x, offsetY: p.y - it.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [editMode, items, toSVGPoint]);

  const handleResizeStart = useCallback((e: React.PointerEvent<SVGRectElement>, id: string) => {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    const { w, h } = itemSize(it);
    resizeRef.current = { id, startW: w, startH: h, startX: p.x, startY: p.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [items, toSVGPoint]);

  const handleSVGPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Redimensionando (prioridad sobre drag).
    const rs = resizeRef.current;
    if (rs) {
      const p = toSVGPoint(e.clientX, e.clientY);
      let dx = p.x - rs.startX;
      let dy = p.y - rs.startY;
      if (showGrid) {
        dx = Math.round(dx / SNAP_GRID) * SNAP_GRID;
        dy = Math.round(dy / SNAP_GRID) * SNAP_GRID;
      }
      setItems(prev => prev.map(it => {
        if (it.id !== rs.id) return it;
        if (it.kind === 'zone') {
          return {
            ...it,
            width:  Math.max(60, Math.min(CANVAS_W - it.x, rs.startW + dx)),
            height: Math.max(60, Math.min(CANVAS_H - it.y, rs.startH + dy)),
          };
        }
        if (it.kind === 'wall') {
          return {
            ...it,
            length:    Math.max(20, Math.min(CANVAS_W - it.x, rs.startW + dx)),
            thickness: Math.max(4,  Math.min(60,             rs.startH + dy)),
          };
        }
        if (it.kind === 'freeTable') {
          return {
            ...it,
            width:  Math.max(40, Math.min(CANVAS_W - it.x, rs.startW + dx)),
            height: Math.max(30, Math.min(CANVAS_H - it.y, rs.startH + dy)),
          };
        }
        return it;
      }));
      setDirty(true);
      return;
    }

    // Moviendo.
    const drag = dragRef.current;
    if (!drag) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    let nx = p.x - drag.offsetX;
    let ny = p.y - drag.offsetY;
    if (showGrid) {
      nx = Math.round(nx / SNAP_GRID) * SNAP_GRID;
      ny = Math.round(ny / SNAP_GRID) * SNAP_GRID;
    }
    setItems(prev => prev.map(it => {
      if (it.id !== drag.id) return it;
      const { w, h } = itemSize(it);
      const cx = Math.max(0, Math.min(CANVAS_W - w, nx));
      const cy = Math.max(0, Math.min(CANVAS_H - h, ny));
      return { ...it, x: cx, y: cy };
    }));
    setDirty(true);
  }, [toSVGPoint, showGrid]);

  const handleSVGPointerUp = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
  }, []);

  const handleSVGClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  // ── Adders ────────────────────────────────────────────────────────────────

  const addTable = (type: TableType) => {
    const idx = items.filter(i => i.kind === 'table' && i.type === type).length + 1;
    const it: MapItem = {
      kind: 'table',
      id: uid('tbl'),
      type, label: `M${idx}`,
      x: 120 + Math.random() * 200, y: 120 + Math.random() * 200,
      rotation: 0, status: 'free',
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
    setDirty(true);
  };

  const addWall = () => {
    const it: MapItem = {
      kind: 'wall', id: uid('wall'),
      x: 200, y: 200, rotation: 0,
      length: 200, thickness: 10,
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
    setDirty(true);
  };

  const addZone = () => {
    const idx = items.filter(i => i.kind === 'zone').length + 1;
    const color = ZONE_COLORS[(idx - 1) % ZONE_COLORS.length].hex;
    const it: MapItem = {
      kind: 'zone', id: uid('zn'),
      x: 80, y: 80, rotation: 0,
      width: 320, height: 220,
      label: `Zona ${idx}`, color,
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
    setDirty(true);
  };

  const addSeat = () => {
    const it: MapItem = {
      kind: 'seat', id: uid('seat'),
      x: 150, y: 150, rotation: 0,
      status: 'free',
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
    setDirty(true);
  };

  const addFreeTable = () => {
    const idx = items.filter(i => i.kind === 'freeTable').length + 1;
    const it: MapItem = {
      kind: 'freeTable', id: uid('ftbl'),
      x: 180, y: 180, rotation: 0,
      width: 160, height: 80,
      label: `ML${idx}`, status: 'free',
    };
    setItems(prev => [...prev, it]);
    setSelectedId(it.id);
    setDirty(true);
  };

  // ── Copiar / pegar / duplicar ────────────────────────────────────────────

  const copySelected = useCallback(() => {
    if (!selectedId) return;
    const it = items.find(x => x.id === selectedId);
    if (it) clipboardRef.current = it;
  }, [selectedId, items]);

  const pasteClipboard = useCallback(() => {
    const src = clipboardRef.current;
    if (!src) return;
    const offset = 20;
    const { w, h } = itemSize(src);
    const copy: MapItem = {
      ...src,
      id: uid(src.kind),
      x: Math.min(CANVAS_W - w, src.x + offset),
      y: Math.min(CANVAS_H - h, src.y + offset),
    };
    setItems(prev => [...prev, copy]);
    setSelectedId(copy.id);
    setDirty(true);
  }, []);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const it = items.find(x => x.id === selectedId);
    if (!it) return;
    const offset = 20;
    const { w, h } = itemSize(it);
    const copy: MapItem = {
      ...it,
      id: uid(it.kind),
      x: Math.min(CANVAS_W - w, it.x + offset),
      y: Math.min(CANVAS_H - h, it.y + offset),
    };
    setItems(prev => [...prev, copy]);
    setSelectedId(copy.id);
    setDirty(true);
  }, [selectedId, items]);

  // Atajos de teclado en modo edición: Ctrl/Cmd + C/V/D y Delete.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignora si está escribiendo en un input/textarea.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        const id = selectedId;
        setItems(prev => prev.filter(it => it.id !== id));
        setSelectedId(null);
        setDirty(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, selectedId, copySelected, pasteClipboard, duplicateSelected]);

  // ── Update / Delete ──────────────────────────────────────────────────────

  const updateSelected = <T extends MapItem>(patch: Partial<T>) => {
    if (!selected) return;
    setItems(prev => prev.map(it => it.id === selected.id ? ({ ...it, ...patch } as MapItem) : it));
    setDirty(true);
  };

  const deleteSelected = useCallback(() => {
    const id = selectedId;
    if (!id) return;
    setItems(prev => prev.filter(it => it.id !== id));
    setSelectedId(null);
    setDirty(true);
  }, [selectedId]);

  const save = () => {
    if (!tenantId) return;
    saveItems(tenantId, items);
    setDirty(false);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa_mesas_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setItems(migrateItems(parsed));
        setSelectedId(null);
        setDirty(true);
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
  };

  // ── Stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    // Mesas fijas + libres se cuentan juntas; sillas también tienen estado.
    const tableLike   = items.filter(i => i.kind === 'table' || i.kind === 'freeTable');
    const stateBearing = items.filter(i => i.kind === 'table' || i.kind === 'freeTable' || i.kind === 'seat');
    const seats = items
      .filter(i => i.kind === 'table')
      .reduce((s, t) => s + tableMeta((t as any).type).seats, 0)
      + items.filter(i => i.kind === 'seat').length;
    return {
      tables: tableLike.length,
      seats,
      free: stateBearing.filter(t => (t as any).status === 'free').length,
      occ:  stateBearing.filter(t => (t as any).status === 'occupied').length,
      res:  stateBearing.filter(t => (t as any).status === 'reserved').length,
      walls: items.filter(i => i.kind === 'wall').length,
      zones: items.filter(i => i.kind === 'zone').length,
    };
  }, [items]);

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <GridIcon size={20} className="text-blue-600" />
          <h1 className="font-black text-gray-900">Mapa del Salón</h1>
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-gray-50 border border-gray-200 font-semibold text-gray-600">
            {stats.tables} mesas · {stats.seats} asientos · {stats.zones} zonas
          </span>
          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">✓ {stats.free}</span>
          <span className="px-2 py-1 rounded bg-red-50 text-red-700 font-bold border border-red-200">● {stats.occ}</span>
          <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">◷ {stats.res}</span>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => { setEditMode(true); setSelectedId(null); }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition ${editMode ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            <Pencil size={13} /> Editar
          </button>
          <button onClick={() => { setEditMode(false); setSelectedId(null); }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition ${!editMode ? 'bg-white shadow text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}>
            <Eye size={13} /> Operar
          </button>
        </div>

        {editMode && (
          <button onClick={() => setShowGrid(g => !g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
              showGrid ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500'
            }`}>
            Snap a grilla
          </button>
        )}

        <button onClick={save} disabled={!dirty}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
            dirty ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}>
          <Save size={13} /> Guardar{dirty ? ' *' : ''}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {editMode && (
          <aside className="w-72 bg-white border-r border-gray-200 p-4 overflow-y-auto shrink-0 space-y-5">

            {/* Mesas */}
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2">Mesas</p>
              <div className="grid grid-cols-2 gap-2">
                {(['small', 'medium', 'long', 'bar'] as TableType[]).map(t => {
                  const meta = tableMeta(t);
                  return (
                    <button key={t} onClick={() => addTable(t)}
                      className="flex flex-col items-center gap-1 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 border-2 border-gray-200 rounded-xl px-2 py-3 transition">
                      <Plus size={14} className="text-blue-500" />
                      <span className="text-xs font-bold text-gray-700">{meta.label}</span>
                      <span className="text-[10px] text-gray-400">{meta.seats} asientos</span>
                    </button>
                  );
                })}
                <button onClick={addFreeTable}
                  className="col-span-2 flex items-center justify-center gap-1.5 bg-gray-50 hover:bg-amber-50 hover:border-amber-300 border-2 border-gray-200 rounded-xl px-2 py-2 transition">
                  <Maximize2 size={13} className="text-amber-600" />
                  <span className="text-xs font-bold text-gray-700">Mesa libre</span>
                  <span className="text-[10px] text-gray-400">tamaño personalizado</span>
                </button>
              </div>
            </div>

            {/* Copy / Paste */}
            <div className="flex gap-1.5">
              <button onClick={copySelected} disabled={!selectedId}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <Copy size={11} /> Copiar
              </button>
              <button onClick={pasteClipboard} disabled={!clipboardRef.current}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ClipboardPaste size={11} /> Pegar
              </button>
              <button onClick={duplicateSelected} disabled={!selectedId}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <Copy size={11} /> Duplicar
              </button>
            </div>

            {/* Estructura */}
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2">Estructura</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={addWall}
                  className="flex flex-col items-center gap-1 bg-gray-50 hover:bg-slate-100 hover:border-slate-400 border-2 border-gray-200 rounded-xl px-2 py-3 transition">
                  <Square size={14} className="text-slate-600" />
                  <span className="text-[11px] font-bold text-gray-700">Pared</span>
                </button>
                <button onClick={addZone}
                  className="flex flex-col items-center gap-1 bg-gray-50 hover:bg-violet-50 hover:border-violet-300 border-2 border-gray-200 rounded-xl px-2 py-3 transition">
                  <BoxSelect size={14} className="text-violet-600" />
                  <span className="text-[11px] font-bold text-gray-700">Zona</span>
                </button>
                <button onClick={addSeat}
                  className="flex flex-col items-center gap-1 bg-gray-50 hover:bg-amber-50 hover:border-amber-300 border-2 border-gray-200 rounded-xl px-2 py-3 transition">
                  <Armchair size={14} className="text-amber-600" />
                  <span className="text-[11px] font-bold text-gray-700">Silla</span>
                </button>
              </div>
            </div>

            {/* Edición seleccionada */}
            {selected ? (
              <SelectedPanel selected={selected} onUpdate={updateSelected} onDelete={deleteSelected} />
            ) : (
              <div className="border-t border-gray-100 pt-4 text-center">
                <MousePointer2 size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-500 font-semibold">Selecciona un elemento</p>
                <p className="text-[11px] text-gray-400">o agrégalo desde arriba</p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <button onClick={exportJSON}
                className="w-full flex items-center justify-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs font-bold transition border border-gray-200">
                <Download size={13} /> Exportar mapa
              </button>
              <label className="w-full flex items-center justify-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs font-bold transition border border-gray-200 cursor-pointer">
                <Upload size={13} /> Importar mapa
                <input type="file" accept="application/json" className="hidden"
                  onChange={e => e.target.files?.[0] && importJSON(e.target.files[0])} />
              </label>
            </div>
          </aside>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-gray-200 p-4">
          <div className="bg-white rounded-2xl shadow-lg" style={{ width: CANVAS_W, height: CANVAS_H }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerMove={handleSVGPointerMove}
              onPointerUp={handleSVGPointerUp}
              onClick={handleSVGClick}
              style={{ userSelect: 'none', touchAction: 'none' }}
            >
              {editMode && showGrid && (
                <g>
                  <defs>
                    <pattern id="tbl-grid" width={SNAP_GRID} height={SNAP_GRID} patternUnits="userSpaceOnUse">
                      <path d={`M ${SNAP_GRID} 0 L 0 0 0 ${SNAP_GRID}`} fill="none" stroke="#e5e7eb" strokeWidth={1} />
                    </pattern>
                  </defs>
                  <rect width={CANVAS_W} height={CANVAS_H} fill="url(#tbl-grid)" />
                </g>
              )}

              {sortedItems.map(it => (
                <MapItemShape
                  key={it.id}
                  item={it}
                  selected={it.id === selectedId}
                  editMode={editMode}
                  onPointerDown={handleItemPointerDown}
                  onResizeStart={handleResizeStart}
                  onClick={(id) => {
                    if (!editMode) {
                      // Operar: cicla estado en mesas (fijas, libres) y sillas.
                      const cur = items.find(x => x.id === id);
                      if (!cur) return;
                      const cycles = cur.kind === 'table' || cur.kind === 'freeTable' || cur.kind === 'seat';
                      if (!cycles) return;
                      const order: TableStatus[] = ['free', 'occupied', 'reserved'];
                      const next = order[(order.indexOf((cur as any).status) + 1) % order.length];
                      setItems(prev => prev.map(x =>
                        x.id === id && (x.kind === 'table' || x.kind === 'freeTable' || x.kind === 'seat')
                          ? ({ ...x, status: next })
                          : x
                      ));
                      setDirty(true);
                    } else {
                      setSelectedId(id);
                    }
                  }}
                />
              ))}

              {items.length === 0 && (
                <g pointerEvents="none">
                  <text x={CANVAS_W / 2} y={CANVAS_H / 2 - 10}
                    textAnchor="middle" fontSize={24} fontWeight={900} fill="#9ca3af">
                    Mapa vacío
                  </text>
                  <text x={CANVAS_W / 2} y={CANVAS_H / 2 + 16}
                    textAnchor="middle" fontSize={14} fill="#9ca3af">
                    Empieza agregando una zona o una mesa desde el panel izquierdo
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 px-6 py-2 text-[11px] text-gray-500 flex items-center gap-3 shrink-0">
        <Hand size={12} />
        {editMode
          ? <span>Arrastra cualquier elemento · Click para seleccionar · Las zonas quedan detrás, mesas/sillas arriba</span>
          : <span>Click sobre una mesa para cambiar su estado (Libre → Ocupada → Reservada)</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de edición por tipo de elemento
// ─────────────────────────────────────────────────────────────────────────────

interface SelectedPanelProps {
  selected: MapItem;
  onUpdate: <T extends MapItem>(patch: Partial<T>) => void;
  onDelete: () => void;
}

function RotationControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">Rotación</label>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange((value - 15 + 360) % 360)}
          className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold">−15°</button>
        <button onClick={() => onChange((value + 15) % 360)}
          className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-bold flex items-center gap-1">
          <RotateCw size={11} /> +15°
        </button>
        <span className="text-xs font-mono text-gray-500 ml-auto">{value}°</span>
      </div>
    </div>
  );
}

function SelectedPanel({ selected, onUpdate, onDelete }: SelectedPanelProps) {
  const kindLabel = selected.kind === 'table'     ? 'mesa'
                  : selected.kind === 'freeTable' ? 'mesa libre'
                  : selected.kind === 'wall'      ? 'pared'
                  : selected.kind === 'zone'      ? 'zona'
                  : 'silla';

  // Confirmación inline: primer click pone el botón en estado "confirmar",
  // segundo click ejecuta. Se resetea si pasa 4s o si cambia la selección.
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { setConfirmDel(false); }, [selected.id]);
  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDel]);

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Editar {kindLabel} seleccionada</p>

      {selected.kind === 'table' && (
        <>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Etiqueta</label>
            <input type="text" value={selected.label}
              onChange={e => onUpdate({ label: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Tipo</label>
            <select value={selected.type}
              onChange={e => onUpdate({ type: e.target.value as TableType })}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400">
              {(['small', 'medium', 'long', 'bar'] as TableType[]).map(t => (
                <option key={t} value={t}>{tableMeta(t).label} — {tableMeta(t).seats} asientos</option>
              ))}
            </select>
          </div>
          <RotationControl value={selected.rotation} onChange={r => onUpdate({ rotation: r })} />
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Estado</label>
            <div className="grid grid-cols-3 gap-1">
              {(['free', 'occupied', 'reserved'] as TableStatus[]).map(s => (
                <button key={s} onClick={() => onUpdate({ status: s })}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                    selected.status === s
                      ? 'text-white border-transparent'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={selected.status === s ? { backgroundColor: STATUS_FILL[s] } : undefined}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {selected.kind === 'wall' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Largo</label>
              <input type="number" min={20} max={1200} value={selected.length}
                onChange={e => onUpdate({ length: Math.max(20, Math.min(1200, parseInt(e.target.value) || 20)) })}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Grosor</label>
              <input type="number" min={4} max={40} value={selected.thickness}
                onChange={e => onUpdate({ thickness: Math.max(4, Math.min(40, parseInt(e.target.value) || 4)) })}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <RotationControl value={selected.rotation} onChange={r => onUpdate({ rotation: r })} />
        </>
      )}

      {selected.kind === 'zone' && (
        <>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Nombre de zona</label>
            <input type="text" value={selected.label}
              onChange={e => onUpdate({ label: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Ancho</label>
              <input type="number" min={80} max={1400} value={selected.width}
                onChange={e => onUpdate({ width: Math.max(80, Math.min(1400, parseInt(e.target.value) || 80)) })}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Alto</label>
              <input type="number" min={80} max={900} value={selected.height}
                onChange={e => onUpdate({ height: Math.max(80, Math.min(900, parseInt(e.target.value) || 80)) })}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <RotationControl value={selected.rotation} onChange={r => onUpdate({ rotation: r })} />
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Color</label>
            <div className="grid grid-cols-6 gap-1.5">
              {ZONE_COLORS.map(c => (
                <button key={c.hex} onClick={() => onUpdate({ color: c.hex })}
                  title={c.name}
                  className={`w-8 h-8 rounded-lg border-2 transition ${
                    selected.color === c.hex ? 'border-gray-900 scale-110' : 'border-gray-200'
                  }`}
                  style={{ backgroundColor: c.hex }} />
              ))}
            </div>
          </div>
        </>
      )}

      {selected.kind === 'seat' && (
        <>
          <RotationControl value={selected.rotation} onChange={r => onUpdate({ rotation: r })} />
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Estado</label>
            <div className="grid grid-cols-3 gap-1">
              {(['free', 'occupied', 'reserved'] as TableStatus[]).map(s => (
                <button key={s} onClick={() => onUpdate({ status: s })}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                    selected.status === s ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={selected.status === s ? { backgroundColor: STATUS_FILL[s] } : undefined}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {selected.kind === 'freeTable' && (
        <>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Etiqueta</label>
            <input type="text" value={selected.label}
              onChange={e => onUpdate({ label: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Ancho</label>
              <input type="number" min={40} max={1400} value={selected.width}
                onChange={e => onUpdate({ width: Math.max(40, Math.min(1400, parseInt(e.target.value) || 40)) })}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Alto</label>
              <input type="number" min={30} max={900} value={selected.height}
                onChange={e => onUpdate({ height: Math.max(30, Math.min(900, parseInt(e.target.value) || 30)) })}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <RotationControl value={selected.rotation} onChange={r => onUpdate({ rotation: r })} />
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Estado</label>
            <div className="grid grid-cols-3 gap-1">
              {(['free', 'occupied', 'reserved'] as TableStatus[]).map(s => (
                <button key={s} onClick={() => onUpdate({ status: s })}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                    selected.status === s ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={selected.status === s ? { backgroundColor: STATUS_FILL[s] } : undefined}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => {
          if (!confirmDel) { setConfirmDel(true); return; }
          onDelete();
          setConfirmDel(false);
        }}
        className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition border ${
          confirmDel
            ? 'bg-red-600 hover:bg-red-700 text-white border-red-700'
            : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
        }`}
      >
        <Trash2 size={13} /> {confirmDel ? `Confirmar eliminar ${kindLabel}` : 'Eliminar'}
      </button>
    </div>
  );
}

export default TablesDashboard;
