import React, { ReactNode } from 'react';
import { AlertCircle, CheckCircle, Info, X, Loader, Wifi, WifiOff, Eye, EyeOff } from 'lucide-react';

// ============ ALERT ============
export const Alert = ({ 
  type = 'info', 
  title, 
  message, 
  onClose 
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

// ============ BADGE ============
export const Badge = ({ 
  children, 
  variant = 'default',
  className = ''
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

// ============ BUTTON ============
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
    ghost: 'text-gray-700 hover:bg-gray-100 disabled:text-gray-400',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`rounded-lg font-medium transition-colors flex items-center gap-2 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Loader className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

// ============ CARD ============
export const Card = ({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string;
}) => (
  <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
    {children}
  </div>
);

export const CardHeader = ({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string;
}) => (
  <div className={`px-6 py-4 border-b border-gray-200 ${className}`}>
    {children}
  </div>
);

export const CardContent = ({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string;
}) => (
  <div className={`px-6 py-4 ${className}`}>
    {children}
  </div>
);

export const CardFooter = ({ 
  children, 
  className = '' 
}: { 
  children: ReactNode; 
  className?: string;
}) => (
  <div className={`px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg ${className}`}>
    {children}
  </div>
);

// ============ INPUT ============
export const Input = ({
  type = 'text',
  placeholder = '',
  value,
  onChange,
  disabled = false,
  error = false,
  className = '',
  ...props
}: {
  type?: string;
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  [key: string]: any;
}) => (
  <input
    type={type}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    disabled={disabled}
    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
      error ? 'border-red-500' : 'border-gray-300'
    } ${className}`}
    {...props}
  />
);

// ============ TEXTAREA ============
export const Textarea = ({
  placeholder = '',
  value,
  onChange,
  disabled = false,
  rows = 4,
  className = '',
  ...props
}: {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  rows?: number;
  className?: string;
  [key: string]: any;
}) => (
  <textarea
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    disabled={disabled}
    rows={rows}
    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${className}`}
    {...props}
  />
);

// ============ SELECT ============
export const Select = ({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  disabled = false,
  className = '',
}: {
  options: { value: string | number; label: string }[];
  value?: string | number;
  onChange?: (value: string | number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <select
    value={value}
    onChange={(e) => onChange?.(e.target.value)}
    disabled={disabled}
    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${className}`}
  >
    <option value="">{placeholder}</option>
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

// ============ SPINNER ============
export const Spinner = ({ 
  size = 'md', 
  className = '' 
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
  className = '' 
}: { 
  size?: 'sm' | 'md' | 'lg'; 
  className?: string;
}) => <Spinner size={size} className={className} />;

// ============ SKELETON ============
export const Skeleton = ({ 
  className = '' 
}: { 
  className?: string;
}) => (
  <div className={`bg-gray-200 animate-pulse rounded-lg ${className}`} />
);

// ============ LOADING STATE ============
export const LoadingState = ({ 
  message = 'Cargando...' 
}: { 
  message?: string;
}) => (
  <div className="flex flex-col items-center justify-center py-12">
    <Spinner size="lg" className="mb-4" />
    <p className="text-gray-600">{message}</p>
  </div>
);

// ============ OFFLINE WARNING ============
export const OfflineWarning = ({ 
  isOnline = true 
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

// ============ MODAL ============
export const Modal = ({
  isOpen = false,
  title,
  children,
  onClose,
  footer,
  size = 'md',
}: {
  isOpen?: boolean;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white rounded-lg shadow-lg ${sizes[size]} w-full mx-4`}>
        {title && (
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex gap-2 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

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

// ============ PASSWORD INPUT ============
export const PasswordInput = ({
  placeholder = 'Contraseña',
  value,
  onChange,
  disabled = false,
  className = '',
  ...props
}: {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  [key: string]: any;
}) => {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {showPassword ? (
          <EyeOff className="w-4 h-4" />
        ) : (
          <Eye className="w-4 h-4" />
        )}
      </button>
    </div>
  );
};

// ============ DIVIDER ============
export const Divider = ({ 
  className = '' 
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

export default {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Input,
  Textarea,
  Select,
  Spinner,
  LoadingSpinner,
  Skeleton,
  LoadingState,
  OfflineWarning,
  SyncingIndicator,
  StatusBadge,
  Modal,
  Pagination,
  PasswordInput,
  Divider,
  EmptyState,
};