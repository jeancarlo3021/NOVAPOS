import React, { ReactNode } from 'react';
import { X } from 'lucide-react';

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
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className={`bg-white rounded-lg shadow-lg ${sizes[size]} w-full`}>
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
