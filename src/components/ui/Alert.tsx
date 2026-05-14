import React from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

// ============ ALERT ============
export const Alert = ({
  type = 'info',
  title,
  message,
  onClose,
}: {
  type?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  message: string;
  onClose?: () => void;
}) => {
  const bgColor = {
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200',
    error: 'bg-red-50 border-red-200',
    success: 'bg-green-50 border-green-200',
  }[type];

  const textColor = {
    info: 'text-blue-800',
    warning: 'text-yellow-800',
    error: 'text-red-800',
    success: 'text-green-800',
  }[type];

  const Icon = {
    info: Info,
    warning: AlertCircle,
    error: AlertCircle,
    success: CheckCircle,
  }[type];

  return (
    <div className={`border rounded-lg p-4 ${bgColor}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${textColor}`} />
        <div className="flex-1">
          {title && <h3 className={`font-semibold ${textColor}`}>{title}</h3>}
          <p className={textColor}>{message}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};

// ============ OFFLINE WARNING ============
export const OfflineWarning = ({
  isOnline = true,
}: {
  isOnline?: boolean;
}) => {
  if (isOnline) return null;

  return (
    <Alert
      type="warning"
      title="Sin conexión"
      message="Estás trabajando sin conexión a internet. Los cambios se sincronizarán cuando recuperes la conexión."
    />
  );
};
