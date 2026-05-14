import React from 'react';
import type { ExpenseCategory } from './types';

function CategoryBadge({ category }: { category?: ExpenseCategory | null }) {
  if (!category) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: category.color }}
    >
      {category.icon} {category.name}
    </span>
  );
}

export default CategoryBadge;
