import React from 'react';

// ── Empty state placeholder used in ProductDetailReport ───────────────────────

export interface EmptyStateProps {
  icon: React.ElementType;
  text: string;
}

export function EmptyState({ icon: Icon, text }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <Icon size={36} className="text-gray-200" />
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  );
}
