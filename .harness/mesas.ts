import type { MapItem } from '@/modules/tables/types';
export const MESAS: MapItem[] = [
  { id: 'z1', kind: 'zone', x: 40,  y: 40, rotation: 0, width: 520, height: 400, label: 'Salón principal', color: '#3b82f6' },
  { id: 'z2', kind: 'zone', x: 600, y: 40, rotation: 0, width: 380, height: 400, label: 'Terraza', color: '#10b981' },
  { id: 'm1', kind: 'table', x: 90,  y: 110, rotation: 0, type: 'medium', label: 'Mesa 1', status: 'free' },
  { id: 'm2', kind: 'table', x: 250, y: 110, rotation: 0, type: 'small',  label: 'Mesa 2', status: 'free' },
  { id: 'm3', kind: 'table', x: 390, y: 110, rotation: 0, type: 'medium', label: 'Mesa 3', status: 'free' },
  { id: 'm4', kind: 'table', x: 90,  y: 290, rotation: 0, type: 'long',   label: 'Mesa 4', status: 'free' },
  { id: 'm5', kind: 'table', x: 390, y: 290, rotation: 0, type: 'small',  label: 'Mesa 5', status: 'free' },
  { id: 'm6', kind: 'table', x: 650, y: 110, rotation: 0, type: 'medium', label: 'Terraza 1', status: 'free' },
  { id: 'm7', kind: 'table', x: 810, y: 110, rotation: 0, type: 'medium', label: 'Terraza 2', status: 'free' },
];
