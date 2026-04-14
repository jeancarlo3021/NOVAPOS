import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  icon, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
  
  const variants = {
    primary: "bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-500",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-brand-500",
    danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-500"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </button>
  );
};


interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, icon, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            {icon}
          </div>
        )}
        <input
          className={`block w-full rounded-lg border ${error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-brand-500 focus:border-brand-500'} sm:text-sm px-4 py-2 focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors ${icon ? 'pl-10' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>
    {children}
  </div>
);

export const CardHeader = ({ title, action }: { title: string, action?: React.ReactNode }) => (
  <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {action && <div>{action}</div>}
  </div>
);

export const CardContent = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-6 ${className}`}>
    {children}
  </div>
);


export const Badge = ({ children, variant = 'info' }: { children: React.ReactNode, variant?: 'success' | 'warning' | 'danger' | 'info' }) => {
  const variants = {
    success: "bg-brand-50 text-brand-700 border-brand-200",
    warning: "bg-orange-50 text-orange-700 border-orange-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-blue-50 text-blue-700 border-blue-200"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}>
      {children}
    </span>
  );
};
