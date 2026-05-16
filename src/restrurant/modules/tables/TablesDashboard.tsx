'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Circle, Text, Group, Line, Path } from 'react-konva';
import Konva from 'konva';
import { Users, ZoomIn, ZoomOut, Maximize2, X, Check, Trash2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type TableShape = 'round' | 'rect';
type TableStatus = 'free' | 'occupied' | 'reserved';

interface TableItem {
  id: string;
  x: number;
  y: number;
  tableNumber: number;
  shape: TableShape;
  seats: number;
  status: TableStatus;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<TableStatus, string> = {
  free: '#10b981',
  occupied: '#ef4444',
  reserved: '#f59e0b',
};

const CHAIR_SIZE = 16;
const CHAIR_COLOR = '#d4a574';
const TABLE_WOOD_COLOR = '#a0826d';
const TABLE_TOP_COLOR = '#c4a876';

// ── Silla Component ───────────────────────────────────────────────────────────
interface ChairProps {
  x: number;
  y: number;
  rotation: number;
}

const Chair: React.FC<ChairProps> = ({ x, y, rotation }) => {
  return (
    <Group x={x} y={y} rotation={rotation}>
      {/* Respaldo */}
      <Rect
        x={-CHAIR_SIZE / 2}
        y={-CHAIR_SIZE / 2 - 4}
        width={CHAIR_SIZE}
        height={CHAIR_SIZE + 4}
        fill={CHAIR_COLOR}
        cornerRadius={3}
        stroke="#8b6f47"
        strokeWidth={1}
      />
      {/* Asiento */}
      <Rect
        x={-CHAIR_SIZE / 2}
        y={-2}
        width={CHAIR_SIZE}
        height={CHAIR_SIZE - 4}
        fill={CHAIR_COLOR}
        cornerRadius={2}
        stroke="#8b6f47"
        strokeWidth={1}
      />
      {/* Patas */}
      <Line
        points={[-CHAIR_SIZE / 3, 0, -CHAIR_SIZE / 3, CHAIR_SIZE / 2]}
        stroke="#6b5344"
        strokeWidth={2}
      />
      <Line
        points={[CHAIR_SIZE / 3, 0, CHAIR_SIZE / 3, CHAIR_SIZE / 2]}
        stroke="#6b5344"
        strokeWidth={2}
      />
    </Group>
  );
};

// ── Calcular posiciones de sillas alrededor de la mesa ────────────────────────
function getChairPositions(
  centerX: number,
  centerY: number,
  shape: TableShape,
  seats: number,
  tableWidth: number,
  tableHeight: number
): Array<{ x: number; y: number; rotation: number }> {
  const positions: Array<{ x: number; y: number; rotation: number }> = [];
  const distance = 50; // Distancia de la silla al centro de la mesa

  if (shape === 'round') {
    // Para mesas redondas, distribuir sillas en círculo
    const angleStep = 360 / seats;
    for (let i = 0; i < seats; i++) {
      const angle = (i * angleStep - 90) * (Math.PI / 180);
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      const rotation = i * angleStep;
      positions.push({ x, y, rotation });
    }
  } else {
    // Para mesas rectangulares, distribuir en los 4 lados
    const sidesSeats = Math.ceil(seats / 4);

    // Lado superior
    for (let i = 0; i < Math.min(sidesSeats, seats); i++) {
      const x = centerX - tableWidth / 2 + (i + 1) * (tableWidth / (sidesSeats + 1));
      const y = centerY - tableHeight / 2 - distance;
      positions.push({ x, y, rotation: 0 });
    }

    // Lado derecho
    const remainingSeats1 = seats - positions.length;
    for (let i = 0; i < Math.min(sidesSeats, remainingSeats1); i++) {
      const x = centerX + tableWidth / 2 + distance;
      const y = centerY - tableHeight / 2 + (i + 1) * (tableHeight / (sidesSeats + 1));
      positions.push({ x, y, rotation: 90 });
    }

    // Lado inferior
    const remainingSeats2 = seats - positions.length;
    for (let i = 0; i < Math.min(sidesSeats, remainingSeats2); i++) {
      const x = centerX + tableWidth / 2 - (i + 1) * (tableWidth / (sidesSeats + 1));
      const y = centerY + tableHeight / 2 + distance;
      positions.push({ x, y, rotation: 180 });
    }

    // Lado izquierdo
    const remainingSeats3 = seats - positions.length;
    for (let i = 0; i < Math.min(sidesSeats, remainingSeats3); i++) {
      const x = centerX - tableWidth / 2 - distance;
      const y = centerY + tableHeight / 2 - (i + 1) * (tableHeight / (sidesSeats + 1));
      positions.push({ x, y, rotation: 270 });
    }
  }

  return positions;
}

// ── Mesa Redonda ──────────────────────────────────────────────────────────────
interface RoundTableProps {
  table: TableItem;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

const RoundTable: React.FC<RoundTableProps> = ({ table, isSelected, onSelect, onDragEnd }) => {
  const groupRef = useRef<Konva.Group>(null);
  const radius = 45;
  const chairPositions = getChairPositions(0, 0, 'round', table.seats, radius * 2, radius * 2);

  return (
    <Group
      ref={groupRef}
      x={table.x}
      y={table.y}
      draggable
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onClick={onSelect}
      onTap={onSelect}
    >
      {/* Sombra */}
      <Circle
        x={0}
        y={0}
        radius={radius + 5}
        fill="#000"
        opacity={0.1}
        listening={false}
      />

      {/* Sillas */}
      {chairPositions.map((pos, i) => (
        <Chair key={i} x={pos.x} y={pos.y} rotation={pos.rotation} />
      ))}

      {/* Mesa - Borde */}
      <Circle
        x={0}
        y={0}
        radius={radius}
        fill={TABLE_TOP_COLOR}
        stroke={TABLE_WOOD_COLOR}
        strokeWidth={3}
        shadowColor="#000"
        shadowBlur={8}
        shadowOpacity={0.3}
      />

      {/* Mesa - Decoración interior */}
      <Circle
        x={0}
        y={0}
        radius={radius - 6}
        fill="transparent"
        stroke={TABLE_WOOD_COLOR}
        strokeWidth={1}
        opacity={0.5}
        listening={false}
      />

      {/* Número de mesa */}
      <Text
        x={-15}
        y={-12}
        text={table.tableNumber.toString()}
        fontSize={24}
        fontStyle="bold"
        fill={TABLE_WOOD_COLOR}
        listening={false}
      />

      {/* Personas */}
      <Text
        x={-20}
        y={8}
        text={`${table.seats} 👤`}
        fontSize={11}
        fill={TABLE_WOOD_COLOR}
        listening={false}
      />

      {/* Indicador de estado */}
      <Circle
        x={radius - 12}
        y={-radius + 12}
        radius={8}
        fill={STATUS_COLORS[table.status]}
        stroke="white"
        strokeWidth={2}
        listening={false}
      />

      {/* Borde de selección */}
      {isSelected && (
        <Circle
          x={0}
          y={0}
          radius={radius + 8}
          stroke="#3b82f6"
          strokeWidth={3}
          fill="transparent"
          listening={false}
        />
      )}
    </Group>
  );
};

// ── Mesa Rectangular ──────────────────────────────────────────────────────────
interface RectTableProps {
  table: TableItem;
  isSelected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}

const RectTable: React.FC<RectTableProps> = ({ table, isSelected, onSelect, onDragEnd }) => {
  const groupRef = useRef<Konva.Group>(null);
  const width = 90;
  const height = 60;
  const chairPositions = getChairPositions(0, 0, 'rect', table.seats, width, height);

  return (
    <Group
      ref={groupRef}
      x={table.x}
      y={table.y}
      draggable
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onClick={onSelect}
      onTap={onSelect}
    >
      {/* Sombra */}
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width + 8}
        height={height + 8}
        fill="#000"
        opacity={0.1}
        cornerRadius={8}
        listening={false}
      />

      {/* Sillas */}
      {chairPositions.map((pos, i) => (
        <Chair key={i} x={pos.x} y={pos.y} rotation={pos.rotation} />
      ))}

      {/* Mesa - Borde exterior */}
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={TABLE_TOP_COLOR}
        stroke={TABLE_WOOD_COLOR}
        strokeWidth={3}
        cornerRadius={8}
        shadowColor="#000"
        shadowBlur={8}
        shadowOpacity={0.3}
      />

      {/* Mesa - Decoración interior */}
      <Rect
        x={-width / 2 + 6}
        y={-height / 2 + 6}
        width={width - 12}
        height={height - 12}
        fill="transparent"
        stroke={TABLE_WOOD_COLOR}
        strokeWidth={1}
        cornerRadius={6}
        opacity={0.5}
        listening={false}
      />

      {/* Número de mesa */}
      <Text
        x={-18}
        y={-10}
        text={table.tableNumber.toString()}
        fontSize={20}
        fontStyle="bold"
        fill={TABLE_WOOD_COLOR}
        listening={false}
      />

      {/* Personas */}
      <Text
        x={-20}
        y={6}
        text={`${table.seats} 👤`}
        fontSize={10}
        fill={TABLE_WOOD_COLOR}
        listening={false}
      />

      {/* Indicador de estado */}
      <Circle
        x={width / 2 - 12}
        y={-height / 2 + 10}
        radius={7}
        fill={STATUS_COLORS[table.status]}
        stroke="white"
        strokeWidth={2}
        listening={false}
      />

      {/* Borde de selección */}
      {isSelected && (
        <Rect
          x={-width / 2 - 8}
          y={-height / 2 - 8}
          width={width + 16}
          height={height + 16}
          stroke="#3b82f6"
          strokeWidth={3}
          cornerRadius={10}
          fill="transparent"
          listening={false}
        />
      )}
    </Group>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export const TablesDashboard: React.FC = () => {
  const [tables, setTables] = useState<TableItem[]>([
    { id: '1', x: 100, y: 100, tableNumber: 1, shape: 'round', seats: 4, status: 'free' },
    { id: '2', x: 250, y: 100, tableNumber: 2, shape: 'round', seats: 6, status: 'occupied' },
    { id: '3', x: 400, y: 100, tableNumber: 3, shape: 'rect', seats: 4, status: 'free' },
    { id: '4', x: 550, y: 100, tableNumber: 4, shape: 'round', seats: 6, status: 'reserved' },
    { id: '5', x: 100, y: 280, tableNumber: 5, shape: 'rect', seats: 4, status: 'free' },
    { id: '6', x: 250, y: 280, tableNumber: 6, shape: 'round', seats: 4, status: 'occupied' },
    { id: '7', x: 400, y: 280, tableNumber: 7, shape: 'rect', seats: 4, status: 'free' },
    { id: '8', x: 550, y: 280, tableNumber: 8, shape: 'round', seats: 6, status: 'free' },
    { id: '9', x: 100, y: 460, tableNumber: 9, shape: 'round', seats: 4, status: 'free' },
    { id: '10', x: 250, y: 460, tableNumber: 10, shape: 'rect', seats: 4, status: 'occupied' },
    { id: '11', x: 400, y: 460, tableNumber: 11, shape: 'round', seats: 6, status: 'free' },
    { id: '12', x: 550, y: 460, tableNumber: 12, shape: 'round', seats: 4, status: 'reserved' },
    { id: '13', x: 175, y: 620, tableNumber: 13, shape: 'round', seats: 6, status: 'occupied' },
    { id: '14', x: 325, y: 620, tableNumber: 14, shape: 'rect', seats: 4, status: 'free' },
    { id: '15', x: 475, y: 620, tableNumber: 15, shape: 'round', seats: 4, status: 'free' },
  ]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const stageRef = useRef<Konva.Stage>(null);

  const selectedTable = tables.find((t) => t.id === selectedId);

  const handleUpdateTable = (id: string, updates: Partial<TableItem>) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  };

  const handleDeleteTable = (id: string) => {
    setTables((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const newScale = direction === 'in' ? scale * 1.2 : scale / 1.2;
    setScale(Math.min(3, Math.max(0.5, newScale)));
  };

  const free = tables.filter((t) => t.status === 'free').length;
  const occupied = tables.filter((t) => t.status === 'occupied').length;
  const reserved = tables.filter((t) => t.status === 'reserved').length;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-gray-900 text-lg">PRINCIPAL - Mapa de Mesas</h1>
              <p className="text-sm text-gray-500">
                {tables.length} mesas · {free} libres · {occupied} ocupadas · {reserved} reservadas
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => handleZoom('in')}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => setScale(1)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100">
          <Stage
            ref={stageRef}
            width={typeof window !== 'undefined' ? window.innerWidth - 320 : 800}
            height={typeof window !== 'undefined' ? window.innerHeight - 100 : 600}
            scaleX={scale}
            scaleY={scale}
            style={{ cursor: 'grab' }}
          >
            <Layer>
              {/* Background */}
              <Rect
                x={0}
                y={0}
                width={1200}
                height={800}
                fill="#f3f4f6"
                listening={false}
              />

              {/* Grid */}
              {Array.from({ length: 20 }).map((_, i) => (
                <Line
                  key={`h-${i}`}
                  points={[0, i * 50, 1200, i * 50]}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                  listening={false}
                />
              ))}
              {Array.from({ length: 25 }).map((_, i) => (
                <Line
                  key={`v-${i}`}
                  points={[i * 50, 0, i * 50, 800]}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                  listening={false}
                />
              ))}

              {/* Tables */}
              {tables.map((table) =>
                table.shape === 'round' ? (
                  <RoundTable
                    key={table.id}
                    table={table}
                    isSelected={selectedId === table.id}
                    onSelect={() => setSelectedId(table.id)}
                    onDragEnd={(x, y) =>
                      handleUpdateTable(table.id, { x: Math.round(x), y: Math.round(y) })
                    }
                  />
                ) : (
                  <RectTable
                    key={table.id}
                    table={table}
                    isSelected={selectedId === table.id}
                    onSelect={() => setSelectedId(table.id)}
                    onDragEnd={(x, y) =>
                      handleUpdateTable(table.id, { x: Math.round(x), y: Math.round(y) })
                    }
                  />
                )
              )}
            </Layer>
          </Stage>
        </div>

        {/* Side Panel */}
        {selectedTable && (
          <div className="w-80 bg-white border-l border-gray-200 shadow-lg flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="font-black text-gray-900">Mesa {selectedTable.tableNumber}</h2>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1 rounded-lg hover:bg-gray-200 text-gray-500"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Estado */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">ESTADO</label>
                <div className="space-y-2">
                  {(['free', 'occupied', 'reserved'] as TableStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleUpdateTable(selectedTable.id, { status })}
                      className={`w-full px-4 py-2 rounded-lg text-sm font-bold transition ${
                        selectedTable.status === status
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {status === 'free' && '🟢 Libre'}
                      {status === 'occupied' && '🔴 Ocupada'}
                      {status === 'reserved' && '🟡 Reservada'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sillas */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">SILLAS</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      handleUpdateTable(selectedTable.id, {
                        seats: Math.max(2, selectedTable.seats - 1),
                      })
                    }
                    className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600"
                  >
                    −
                  </button>
                  <span className="text-2xl font-black text-gray-900 flex-1 text-center">
                    {selectedTable.seats}
                  </span>
                  <button
                    onClick={() =>
                      handleUpdateTable(selectedTable.id, {
                        seats: Math.min(12, selectedTable.seats + 1),
                      })
                    }
                    className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Forma */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">FORMA</label>
                <div className="space-y-2">
                  {(['round', 'rect'] as TableShape[]).map((shape) => (
                    <button
                      key={shape}
                      onClick={() => handleUpdateTable(selectedTable.id, { shape })}
                      className={`w-full px-4 py-2 rounded-lg text-sm font-bold transition ${
                        selectedTable.shape === shape
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {shape === 'round' ? '⭕ Redonda' : '▭ Rectangular'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Delete Button */}
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => handleDeleteTable(selectedTable.id)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition"
              >
                <Trash2 size={16} /> Eliminar Mesa
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};