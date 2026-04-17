import { useState, useCallback } from 'react';
import { offlineSyncService } from '@/services/offlineSyncService';

// Hook para gestionar estado de formulario
export const useFormState = <T extends Record<string, any>>(initialState: T) => {
  const [formData, setFormData] = useState<T>(initialState);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialState);
  }, [initialState]);

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  return { formData, handleChange, resetForm, setFieldValue };
};

// Hook para operaciones offline
interface UseOfflineOperationOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const useOfflineOperation = (options?: UseOfflineOperationOptions) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const saveOffline = useCallback(
    async (
      type: 'create' | 'update' | 'delete',
      table: string,
      data: any,
      apiCall?: () => Promise<any>
    ) => {
      try {
        setIsLoading(true);
        setMessage(null);

        // Guardar en IndexedDB
        await offlineSyncService.addOperation({
          type,
          table,
          data,
        });

        // Si hay conexión, ejecutar API inmediatamente
        if (apiCall) {
          try {
            await apiCall();
            setMessage('Guardado correctamente');
            setMessageType('success');
            options?.onSuccess?.();
            return true;
          } catch (apiError) {
            setMessage('Guardado localmente - Se sincronizará cuando recuperes conexión');
            setMessageType('info');
            return true;
          }
        } else {
          setMessage('Guardado localmente - Se sincronizará cuando recuperes conexión');
          setMessageType('info');
          return true;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error al guardar';
        setMessage(errorMessage);
        setMessageType('error');
        options?.onError?.(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  return {
    saveOffline,
    isLoading,
    message,
    messageType,
    clearMessage,
  };
};

// Hook para validación de formulario
interface ValidationRules {
  [key: string]: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: any) => boolean;
  };
}

export const useFormValidation = (rules: ValidationRules) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback((formData: Record<string, any>) => {
    const newErrors: Record<string, string> = {};

    Object.keys(rules).forEach(field => {
      const rule = rules[field];
      const value = formData[field];

      if (rule.required && (!value || value.toString().trim() === '')) {
        newErrors[field] = 'Este campo es requerido';
      } else if (rule.minLength && value?.toString().length < rule.minLength) {
        newErrors[field] = `Mínimo ${rule.minLength} caracteres`;
      } else if (rule.maxLength && value?.toString().length > rule.maxLength) {
        newErrors[field] = `Máximo ${rule.maxLength} caracteres`;
      } else if (rule.pattern && !rule.pattern.test(value?.toString())) {
        newErrors[field] = 'Formato inválido';
      } else if (rule.custom && !rule.custom(value)) {
        newErrors[field] = 'Valor inválido';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [rules]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  return { errors, validate, clearErrors };
};

// Hook para paginación
export const usePagination = (items: any[], itemsPerPage: number = 10) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = items.slice(startIndex, endIndex);

  const goToPage = useCallback((page: number) => {
    const pageNumber = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(pageNumber);
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  return {
    currentPage,
    totalPages,
    currentItems,
    goToPage,
    nextPage,
    prevPage,
  };
};

// Hook para búsqueda y filtrado
export const useSearch = <T extends Record<string, any>>(items: T[], searchFields: (keyof T)[]) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = items.filter(item =>
    searchFields.some(field =>
      item[field]?.toString().toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return {
    searchTerm,
    setSearchTerm,
    filteredItems,
  };
};