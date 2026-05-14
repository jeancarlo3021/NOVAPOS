import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

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
