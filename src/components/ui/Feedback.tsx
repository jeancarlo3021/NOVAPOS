import React from 'react';
import { Loader, CheckCircle, Wifi } from 'lucide-react';

// ============ SPINNER ============
export const Spinner = ({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <Loader className={`${sizes[size]} animate-spin text-blue-600 ${className}`} />
  );
};

// ============ LOADING SPINNER (Alias) ============
export const LoadingSpinner = ({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => <Spinner size={size} className={className} />;

// ============ SKELETON ============
export const Skeleton = ({
  className = '',
}: {
  className?: string;
}) => (
  <div className={`bg-gray-200 animate-pulse rounded-lg ${className}`} />
);

// ============ LOADING STATE ============
export const LoadingState = ({
  message = 'Cargando...',
}: {
  message?: string;
}) => (
  <div className="flex flex-col items-center justify-center py-12">
    <Spinner size="lg" className="mb-4" />
    <p className="text-gray-600">{message}</p>
  </div>
);

// ============ SYNCING INDICATOR ============
export const SyncingIndicator = ({
  isSyncing = false,
  lastSyncTime,
  message = 'Sincronizando...',
  className = '',
}: {
  isSyncing?: boolean;
  lastSyncTime?: Date;
  message?: string;
  className?: string;
}) => {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Hace un momento';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    return `Hace ${days}d`;
  };

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      {isSyncing ? (
        <>
          <Loader className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-gray-700">{message}</span>
        </>
      ) : lastSyncTime ? (
        <>
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-gray-600">Sincronizado {formatTime(lastSyncTime)}</span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 text-gray-400" />
          <span className="text-gray-500">Pendiente de sincronización</span>
        </>
      )}
    </div>
  );
};
