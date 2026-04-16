import React from 'react';
import { AlertTriangle, RefreshCw, Package, DollarSign, TrendingUp } from 'lucide-react';

// Loading Spinner
export const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Cargando...' }) => (
  <div className="text-center py-8">
    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    <p className="mt-2 text-gray-600">{message}</p>
  </div>
);

// Error Alert
export const ErrorAlert: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <p className="text-red-800">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 flex items-center gap-2"
      >
        <RefreshCw size={16} />
        Reintentar
      </button>
    )}
  </div>
);

// Success Alert
export const SuccessAlert: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
    <p className="text-green-800">✓ {message}</p>
  </div>
);

// Warning Alert
export const WarningAlert: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
    <p className="text-yellow-800">⚠ {message}</p>
  </div>
);

// Stat Card
export interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}

export const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color }) => (
  <div className={`rounded-lg p-6 ${color}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold opacity-75">{label}</p>
        <p className="text-3xl font-bold mt-2">{value}</p>
      </div>
      <div className="opacity-20">{icon}</div>
    </div>
  </div>
);

// Product Card
export interface ProductCardProps {
  name: string;
  sku: string;
  quantity: number;
  minStock: number;
  isLowStock?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  name,
  sku,
  quantity,
  minStock,
  isLowStock = false,
}) => (
  <div className={`rounded-lg p-4 border ${isLowStock ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
    <h3 className="font-semibold text-gray-900">{name}</h3>
    <p className="text-sm text-gray-600">SKU: {sku}</p>
    <p className={`text-2xl font-bold mt-2 ${isLowStock ? 'text-red-600' : 'text-blue-600'}`}>
      {quantity}
    </p>
    <p className="text-xs text-gray-500">Mínimo: {minStock}</p>
  </div>
);

// Low Stock Item
export const LowStockItem: React.FC<{
  name: string;
  current: number;
  minimum: number;
}> = ({ name, current, minimum }) => (
  <div className="text-sm text-yellow-800 bg-white bg-opacity-50 p-2 rounded">
    <p className="font-medium">{name}</p>
    <p className="text-xs">
      Stock: {current} / Mínimo: {minimum}
    </p>
  </div>
);

// Select Input
export const SelectInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}> = ({ label, value, onChange, options, required = false }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      required={required}
    >
      <option value="">Seleccionar...</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

// Number Input
export const NumberInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  required?: boolean;
}> = ({ label, value, onChange, placeholder = '0', min = 1, required = false }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      placeholder={placeholder}
      min={min}
      required={required}
    />
  </div>
);

// Submit Button
export const SubmitButton: React.FC<{
  label: string;
  icon?: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
}> = ({ label, icon, loading = false, onClick }) => (
  <button
    type="submit"
    onClick={onClick}
    disabled={loading}
    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
  >
    {icon && !loading && icon}
    {loading ? 'Procesando...' : label}
  </button>
);