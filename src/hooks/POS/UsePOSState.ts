import { useState, useCallback } from 'react';
import { POSState } from '@/types/Pos.types';

const initialState: POSState = {
  isOpen: true,
  cashierName: 'Vendedor',
  totalSales: 0,
  transactionsCount: 0,
};

export const usePOSState = () => {
  const [state, setState] = useState<POSState>(initialState);

  const updateState = useCallback((updates: Partial<POSState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const addSale = useCallback((amount: number) => {
    setState(prev => ({
      ...prev,
      totalSales: prev.totalSales + amount,
      transactionsCount: prev.transactionsCount + 1,
    }));
  }, []);

  const closeCash = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openCash = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: true }));
  }, []);

  return { state, updateState, addSale, closeCash, openCash };
};