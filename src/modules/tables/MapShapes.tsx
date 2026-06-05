import type { MapItem, TableItem, WallItem, ZoneItem, SeatItem, FreeTableItem } from './types';
import { tableMeta, STATUS_FILL } from './types';

// ── Sillas helper ──────────────────────────────────────────────────────────

const CHAIR_W = 14;
const CHAIR_H = 18;

function chairPositions(width: number, height: number, seats: number): { x: number; y: number; r: number }[] {
  const gap = 16;
  const out: { x: number; y: number; r: number }[] = [];
  const ratio = width / height;
  let top = 0, bottom = 0, left = 0, right = 0;

  if (ratio > 2) {
    top    = Math.ceil(seats / 2);
    bottom = seats - top;
  } else if (Math.abs(ratio - 1) < 0.05) {
    const per = Math.floor(seats / 4);
    const rem = seats % 4;
    top = bottom = left = right = per;
    if (rem > 0) top    += 1;
    if (rem > 1) bottom += 1;
    if (rem > 2) left   += 1;
  } else {
    const longSide  = Math.ceil(seats * 0.35);
    const shortSide = Math.max(1, Math.floor((seats - longSide * 2) / 2));
    top = bottom = longSide;
    left = right = shortSide;
    let total = top + bottom + left + right;
    while (total > seats) { if (left > 0) { left--; } else if (right > 0) { right--; } total--; }
    while (total < seats) { top++; total++; }
  }

  const placeAlong = (count: number, axis: 'x' | 'y', edge: number, start: number, end: number, baseRot: number) => {
    if (count === 0) return;
    const step = (end - start) / (count + 1);
    for (let i = 1; i <= count; i++) {
      const along = start + step * i;
      if (axis === 'x') out.push({ x: along, y: edge, r: baseRot });
      else              out.push({ x: edge, y: along, r: baseRot });
    }
  };

  placeAlong(top,    'x', -gap,         0, width,  0);
  placeAlong(bottom, 'x', height + gap, 0, width,  180);
  placeAlong(left,   'y', -gap,         0, height, 270);
  placeAlong(right,  'y', width + gap,  0, height, 90);

  return out;
}

function Chair({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) translate(${-CHAIR_W / 2} 0)`}>
      <rect x={0} y={-CHAIR_H}     width={CHAIR_W} height={4}            rx={2} fill="#7c5a3a" />
      <rect x={0} y={-CHAIR_H + 4} width={CHAIR_W} height={CHAIR_H - 4} rx={2} fill="#a47148" />
    </g>
  );
}

// ── Props comunes ──────────────────────────────────────────────────────────

interface ShapeProps<T extends MapItem> {
  item: T;
  selected: boolean;
  editMode: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>, id: string) => void;
  onClick: (id: string) => void;
  onResizeStart?: (e: React.PointerEvent<SVGRectElement>, id: string) => void;
}

// Handle pequeño de redimensionar (esquina inferior derecha).
function ResizeHandle({ x, y, id, onResizeStart }: {
  x: number; y: number; id: string;
  onResizeStart?: (e: React.PointerEvent<SVGRectElement>, id: string) => void;
}) {
  if (!onResizeStart) return null;
  return (
    <rect
      x={x - 7} y={y - 7} width={14} height={14} rx={3}
      fill="#3b82f6" stroke="#fff" strokeWidth={2}
      style={{ cursor: 'nwse-resize' }}
      onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, id); }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ── Mesas ──────────────────────────────────────────────────────────────────

export function TableShape({ item, selected, editMode, onPointerDown, onClick }: ShapeProps<TableItem>) {
  const meta = tableMeta(item.type);
  const w = meta.width;
  const h = meta.height;
  const fill = STATUS_FILL[item.status];
  const cx = w / 2;
  const cy = h / 2;
  const chairs = chairPositions(w, h, meta.seats);

  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${cx} ${cy})`}
      onPointerDown={(e) => { if (editMode) onPointerDown(e, item.id); }}
      onClick={(e) => { e.stopPropagation(); onClick(item.id); }}
      style={{ cursor: editMode ? 'grab' : 'pointer' }}
    >
      {chairs.map((c, i) => <Chair key={i} x={c.x} y={c.y} r={c.r} />)}

      <rect x={2} y={4} width={w} height={h}
        rx={meta.shape === 'round' ? Math.min(w, h) / 2 : 8}
        fill="rgba(0,0,0,0.12)" />

      {meta.shape === 'round' ? (
        <circle cx={cx} cy={cy} r={Math.min(w, h) / 2} fill={fill} stroke="#0f172a" strokeWidth={2} />
      ) : (
        <rect x={0} y={0} width={w} height={h} rx={8} fill={fill} stroke="#0f172a" strokeWidth={2} />
      )}

      <text x={cx} y={cy - 4} textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={900} fontSize={meta.height < 50 ? 12 : 16} fill="#fff"
        pointerEvents="none">
        {item.label}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={600} fontSize={11} fill="rgba(255,255,255,0.85)"
        pointerEvents="none">
        {meta.seats} pers.
      </text>

      {selected && (
        meta.shape === 'round'
          ? <circle cx={cx} cy={cy} r={Math.min(w, h) / 2 + 6} fill="none" stroke="#3b82f6" strokeWidth={3} strokeDasharray="6 4" />
          : <rect x={-6} y={-6} width={w + 12} height={h + 12} rx={12}
                  fill="none" stroke="#3b82f6" strokeWidth={3} strokeDasharray="6 4" />
      )}
    </g>
  );
}

// ── Paredes ────────────────────────────────────────────────────────────────

export function WallShape({ item, selected, editMode, onPointerDown, onClick, onResizeStart }: ShapeProps<WallItem>) {
  const { length, thickness } = item;
  const cx = length / 2;
  const cy = thickness / 2;
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${cx} ${cy})`}
      onPointerDown={(e) => { if (editMode) onPointerDown(e, item.id); }}
      onClick={(e) => { e.stopPropagation(); onClick(item.id); }}
      style={{ cursor: editMode ? 'grab' : 'default' }}
    >
      <rect x={0} y={0} width={length} height={thickness}
        fill="#475569" stroke="#0f172a" strokeWidth={1.5} />
      {/* Textura: líneas verticales tipo ladrillo */}
      <g pointerEvents="none" opacity={0.25}>
        {Array.from({ length: Math.floor(length / 12) }).map((_, i) => (
          <line key={i}
            x1={i * 12} y1={0} x2={i * 12} y2={thickness}
            stroke="#0f172a" strokeWidth={0.5} />
        ))}
      </g>
      {selected && (
        <rect x={-4} y={-4} width={length + 8} height={thickness + 8} rx={4}
          fill="none" stroke="#3b82f6" strokeWidth={3} strokeDasharray="6 4" />
      )}
      {selected && editMode && (
        <ResizeHandle x={length} y={thickness} id={item.id} onResizeStart={onResizeStart} />
      )}
    </g>
  );
}

// ── Zonas ──────────────────────────────────────────────────────────────────

export function ZoneShape({ item, selected, editMode, onPointerDown, onClick, onResizeStart }: ShapeProps<ZoneItem>) {
  const { width, height, color, label } = item;
  const cx = width / 2;
  const cy = height / 2;
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${cx} ${cy})`}
      onPointerDown={(e) => { if (editMode) onPointerDown(e, item.id); }}
      onClick={(e) => { e.stopPropagation(); onClick(item.id); }}
      style={{ cursor: editMode ? 'grab' : 'default' }}
    >
      <rect x={0} y={0} width={width} height={height} rx={14}
        fill={color} fillOpacity={0.18}
        stroke={color} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="8 6" />
      {label && (
        <text x={cx} y={28} textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight={900} fontSize={18}
          fill={color} fillOpacity={0.85}
          pointerEvents="none">
          {label}
        </text>
      )}
      {selected && (
        <rect x={-4} y={-4} width={width + 8} height={height + 8} rx={18}
          fill="none" stroke="#3b82f6" strokeWidth={3} strokeDasharray="6 4" />
      )}
      {selected && editMode && (
        <ResizeHandle x={width} y={height} id={item.id} onResizeStart={onResizeStart} />
      )}
    </g>
  );
}

// ── Mesa libre ─────────────────────────────────────────────────────────────

export function FreeTableShape({ item, selected, editMode, onPointerDown, onClick, onResizeStart }: ShapeProps<FreeTableItem>) {
  const { width, height, status, label } = item;
  const cx = width / 2;
  const cy = height / 2;
  const fill = STATUS_FILL[status];
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${cx} ${cy})`}
      onPointerDown={(e) => { if (editMode) onPointerDown(e, item.id); }}
      onClick={(e) => { e.stopPropagation(); onClick(item.id); }}
      style={{ cursor: editMode ? 'grab' : 'pointer' }}
    >
      {/* Sombra */}
      <rect x={2} y={4} width={width} height={height} rx={10} fill="rgba(0,0,0,0.12)" />
      {/* Cuerpo */}
      <rect x={0} y={0} width={width} height={height} rx={10}
        fill={fill} stroke="#0f172a" strokeWidth={2} />
      {/* Patrón sutil para distinguir de mesa fija */}
      <rect x={0} y={0} width={width} height={height} rx={10}
        fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} strokeDasharray="4 6"
        pointerEvents="none" />

      <text x={cx} y={cy - 2} textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={900} fontSize={Math.min(20, height / 4)} fill="#fff"
        pointerEvents="none">
        {label}
      </text>
      <text x={cx} y={cy + Math.min(16, height / 5)} textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={600} fontSize={10} fill="rgba(255,255,255,0.85)"
        pointerEvents="none">
        {Math.round(width)}×{Math.round(height)}
      </text>

      {selected && (
        <rect x={-6} y={-6} width={width + 12} height={height + 12} rx={14}
          fill="none" stroke="#3b82f6" strokeWidth={3} strokeDasharray="6 4" />
      )}
      {selected && editMode && (
        <ResizeHandle x={width} y={height} id={item.id} onResizeStart={onResizeStart} />
      )}
    </g>
  );
}

// ── Asientos sueltos ───────────────────────────────────────────────────────

const SOLO_SEAT_SIZE = 24;

// Versión más oscura del color de estado para el respaldo.
const SEAT_BACKREST: Record<string, string> = {
  '#10b981': '#047857',  // free
  '#ef4444': '#991b1b',  // occupied
  '#f59e0b': '#92400e',  // reserved
};

export function SeatShape({ item, selected, editMode, onPointerDown, onClick }: ShapeProps<SeatItem>) {
  const cx = SOLO_SEAT_SIZE / 2;
  const cy = SOLO_SEAT_SIZE / 2;
  const fill = STATUS_FILL[item.status];
  const backrest = SEAT_BACKREST[fill] ?? '#0f172a';
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${cx} ${cy})`}
      onPointerDown={(e) => { if (editMode) onPointerDown(e, item.id); }}
      onClick={(e) => { e.stopPropagation(); onClick(item.id); }}
      style={{ cursor: editMode ? 'grab' : 'pointer' }}
    >
      {/* Sombra */}
      <ellipse cx={cx} cy={SOLO_SEAT_SIZE + 2} rx={cx - 2} ry={2} fill="rgba(0,0,0,0.15)" />
      {/* Respaldo (más oscuro) */}
      <rect x={0} y={0} width={SOLO_SEAT_SIZE} height={6} rx={2} fill={backrest} />
      {/* Asiento (color del estado) */}
      <rect x={2} y={6} width={SOLO_SEAT_SIZE - 4} height={SOLO_SEAT_SIZE - 8} rx={3}
        fill={fill} stroke={backrest} strokeWidth={1} />
      {selected && (
        <rect x={-5} y={-5} width={SOLO_SEAT_SIZE + 10} height={SOLO_SEAT_SIZE + 10} rx={6}
          fill="none" stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="4 3" />
      )}
    </g>
  );
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

interface MapItemShapeProps {
  item: MapItem;
  selected: boolean;
  editMode: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>, id: string) => void;
  onClick: (id: string) => void;
  onResizeStart?: (e: React.PointerEvent<SVGRectElement>, id: string) => void;
}

export function MapItemShape(props: MapItemShapeProps) {
  switch (props.item.kind) {
    case 'table':     return <TableShape     {...(props as any)} />;
    case 'wall':      return <WallShape      {...(props as any)} />;
    case 'zone':      return <ZoneShape      {...(props as any)} />;
    case 'seat':      return <SeatShape      {...(props as any)} />;
    case 'freeTable': return <FreeTableShape {...(props as any)} />;
  }
}
