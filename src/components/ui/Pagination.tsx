import React, { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

// ============ PAGINATION ============
export const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}: {
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}) => {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange?.(currentPage - 1)}
      >
        Anterior
      </Button>

      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange?.(page)}
          className={`w-8 h-8 rounded-lg font-medium transition-colors ${
            currentPage === page
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          {page}
        </button>
      ))}

      <Button
        variant="secondary"
        size="sm"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange?.(currentPage + 1)}
      >
        Siguiente
      </Button>
    </div>
  );
};

// ============ DIVIDER ============
export const Divider = ({
  className = '',
}: {
  className?: string;
}) => (
  <div className={`border-t border-gray-200 ${className}`} />
);

// ============ EMPTY STATE ============
export const EmptyState = ({
  icon: Icon = AlertCircle,
  title = 'Sin datos',
  description = 'No hay información para mostrar',
  action,
}: {
  icon?: React.ComponentType<{ className: string }>;
  title?: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <Icon className="w-12 h-12 text-gray-300 mb-4" />
    <h3 className="text-lg font-semibold text-gray-700 mb-2">{title}</h3>
    <p className="text-gray-500 mb-4">{description}</p>
    {action && <div>{action}</div>}
  </div>
);
