import React, { ReactNode } from 'react';

// ============ BADGE ============
export const Badge = ({
  children,
  variant = 'default',
  className = '',
}: {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}) => {
  const variants = {
    default: 'bg-gray-200 text-gray-800',
    success: 'bg-green-200 text-green-800',
    warning: 'bg-yellow-200 text-yellow-800',
    error: 'bg-red-200 text-red-800',
    info: 'bg-blue-200 text-blue-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

// ============ STATUS BADGE ============
export const StatusBadge = ({
  status = 'pending',
  label,
}: {
  status?: 'pending' | 'success' | 'error' | 'warning' | 'info';
  label?: string;
}) => {
  const statusConfig = {
    pending: { variant: 'info' as const, text: 'Pendiente' },
    success: { variant: 'success' as const, text: 'Completado' },
    error: { variant: 'error' as const, text: 'Error' },
    warning: { variant: 'warning' as const, text: 'Advertencia' },
    info: { variant: 'info' as const, text: 'Información' },
  };

  const config = statusConfig[status];

  return <Badge variant={config.variant}>{label || config.text}</Badge>;
};
