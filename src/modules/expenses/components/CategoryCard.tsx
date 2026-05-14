import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { CategoryCardProps } from './types';

function CategoryCard({ cat, deletingId, onEdit, onDelete, isGeneral }: CategoryCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
        style={{ backgroundColor: cat.color + '22' }}
      >
        {cat.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-gray-900 truncate">{cat.name}</p>
          {isGeneral && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium shrink-0">general</span>
          )}
        </div>
        <div className="w-16 h-1.5 rounded-full mt-1" style={{ backgroundColor: cat.color }} />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          disabled={deletingId === cat.id}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default CategoryCard;
