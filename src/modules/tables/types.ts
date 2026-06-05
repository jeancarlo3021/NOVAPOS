// Tipos centrales del mapa de mesas (SVG-based).

export type ItemKind   = 'table' | 'wall' | 'zone' | 'seat' | 'freeTable';
export type TableType  = 'small' | 'medium' | 'long' | 'bar';
export type TableStatus = 'free'  | 'occupied' | 'reserved';

export interface BaseItem {
  id: string;
  kind: ItemKind;
  x: number;        // posición en el canvas
  y: number;
  rotation: number; // grados
}

export interface TableItem extends BaseItem {
  kind: 'table';
  type: TableType;
  label: string;
  status: TableStatus;
}

export interface WallItem extends BaseItem {
  kind: 'wall';
  length: number;   // largo
  thickness: number;
}

export interface ZoneItem extends BaseItem {
  kind: 'zone';
  width: number;
  height: number;
  label: string;
  color: string;    // hex, usado como fill suave
}

export interface SeatItem extends BaseItem {
  kind: 'seat';
  status: TableStatus;
}

// Mesa libre: rectángulo de tamaño arbitrario con etiqueta y estado.
// Se comporta como una pared (redimensionable libremente) pero tiene
// color de estado y label como una mesa normal.
export interface FreeTableItem extends BaseItem {
  kind: 'freeTable';
  label: string;
  width: number;
  height: number;
  status: TableStatus;
}

export type MapItem = TableItem | WallItem | ZoneItem | SeatItem | FreeTableItem;

// ── Mesas ───────────────────────────────────────────────────────────────────

export interface TableMeta {
  label: string;
  seats: number;
  width: number;
  height: number;
  shape: 'rect' | 'round';
}

const META: Record<TableType, TableMeta> = {
  small:  { label: 'Mesa 2',     seats: 2, width: 72,  height: 72,  shape: 'round' },
  medium: { label: 'Mesa 4',     seats: 4, width: 96,  height: 96,  shape: 'rect'  },
  long:   { label: 'Mesa larga', seats: 8, width: 200, height: 80,  shape: 'rect'  },
  bar:    { label: 'Barra',      seats: 4, width: 240, height: 36,  shape: 'rect'  },
};

export function tableMeta(t: TableType): TableMeta {
  return META[t];
}

export const STATUS_FILL: Record<TableStatus, string> = {
  free:     '#10b981',
  occupied: '#ef4444',
  reserved: '#f59e0b',
};

export const STATUS_LABEL: Record<TableStatus, string> = {
  free:     'Libre',
  occupied: 'Ocupada',
  reserved: 'Reservada',
};

// ── Zonas: paleta de colores predefinida ──────────────────────────────────

export const ZONE_COLORS: { name: string; hex: string }[] = [
  { name: 'Azul',     hex: '#3b82f6' },
  { name: 'Verde',    hex: '#10b981' },
  { name: 'Ámbar',    hex: '#f59e0b' },
  { name: 'Violeta',  hex: '#8b5cf6' },
  { name: 'Rosa',     hex: '#ec4899' },
  { name: 'Gris',     hex: '#64748b' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

// Normaliza items cargados desde versiones antiguas (sin `kind`).
// Las versiones previas guardaban solo TableItem sin esa propiedad.
export function migrateItems(raw: unknown): MapItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it: any) => {
      if (!it || typeof it !== 'object') return null;
      let item = it as any;
      // Item antiguo sin `kind` = mesa
      if (!item.kind) {
        item = {
          ...item,
          kind: 'table',
          rotation: item.rotation ?? 0,
          status:   item.status   ?? 'free',
        };
      }
      // Las sillas ahora tienen status; las viejas (sin status) → 'free'
      if (item.kind === 'seat' && !item.status) {
        item = { ...item, status: 'free' };
      }
      return item as MapItem;
    })
    .filter((x): x is MapItem => x !== null);
}

// Devuelve un bounding box aproximado para un item en sus coordenadas locales
// (sin aplicar rotación). Útil para clamping de drag.
export function itemSize(item: MapItem): { w: number; h: number } {
  switch (item.kind) {
    case 'table': {
      const m = tableMeta(item.type);
      return { w: m.width, h: m.height };
    }
    case 'wall':
      return { w: item.length, h: item.thickness };
    case 'zone':
      return { w: item.width,  h: item.height };
    case 'seat':
      return { w: 28, h: 28 };
    case 'freeTable':
      return { w: item.width, h: item.height };
  }
}
