import { apiFetch } from '@/lib/api';

// ============================================
// CONSTANTES
// ============================================

export const COLONES_DENOMINATIONS = [
  { value: 50000, label: '₡50,000' },
  { value: 20000, label: '₡20,000' },
  { value: 10000, label: '₡10,000' },
  { value: 5000, label: '₡5,000' },
  { value: 2000, label: '₡2,000' },
  { value: 1000, label: '₡1,000' },
  { value: 500, label: '₡500' },
  { value: 100, label: '₡100' },
  { value: 50, label: '₡50' },
  { value: 25, label: '₡25' },
  { value: 10, label: '₡10' },
  { value: 5, label: '₡5' },
  { value: 1, label: '₡1' },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'sinpe', label: 'SINPE' },
];

// ============================================
// INTERFACES
// ============================================

export interface CashSession {
  id: string;
  tenant_id: string;
  user_id: string;
  opening_amount: number;
  closing_amount?: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CashMovement {
  id: string;
  cash_session_id: string;
  tenant_id: string;
  type: 'opening' | 'sale' | 'adjustment' | 'closing';
  amount: number;
  description: string;
  reference_id?: string;
  created_at: string;
}

// ============================================
// CASH SESSIONS SERVICE
// ============================================

export const cashSessionsService = {
  // Obtener todas las sesiones de caja
  async getAllSessions(_tenantId: string) {
    return apiFetch<CashSession[]>('/cash-sessions');
  },

  // Obtener sesión de caja abierta
  async getActiveCashSession(_tenantId: string) {
    return apiFetch<CashSession | null>('/cash-sessions/active');
  },

  // Obtener sesión por ID
  async getSessionById(id: string) {
    return apiFetch<CashSession>('/cash-sessions/' + id);
  },

  // Abrir caja
  async openCashSession(
    _tenantId: string,
    userId: string,
    openingAmount: number,
    notes?: string
  ) {
    const data = await apiFetch<CashSession>('/cash-sessions/open', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        opening_amount: openingAmount,
        notes,
      }),
    });

    return data;
  },

  // Cerrar caja
  async closeCashSession(
    sessionId: string,
    closingAmount: number,
    notes?: string
  ) {
    return apiFetch<CashSession>('/cash-sessions/' + sessionId + '/close', {
      method: 'POST',
      body: JSON.stringify({ closing_amount: closingAmount, notes }),
    });
  },

  // Obtener resumen de sesión
  async getSessionSummary(sessionId: string) {
    const session = await this.getSessionById(sessionId);
    const movements = await cashMovementsService.getSessionMovements(sessionId);

    const totalSales = movements
      .filter((m) => m.type === 'sale')
      .reduce((sum, m) => sum + m.amount, 0);

    const totalAdjustments = movements
      .filter((m) => m.type === 'adjustment')
      .reduce((sum, m) => sum + m.amount, 0);

    const expectedAmount = session.opening_amount + totalSales + totalAdjustments;
    const difference = (session.closing_amount || 0) - expectedAmount;

    return {
      session,
      movements,
      totalSales,
      totalAdjustments,
      expectedAmount,
      closingAmount: session.closing_amount || 0,
      difference,
      isBalanced: Math.abs(difference) < 0.01, // Tolerancia de 0.01
    };
  },

  // Obtener sesiones por rango de fechas
  async getSessionsByDateRange(
    _tenantId: string,
    startDate: string,
    endDate: string
  ) {
    return apiFetch<CashSession[]>(`/cash-sessions?from=${startDate}&to=${endDate}`);
  },

  // Obtener sesiones de un usuario
  async getSessionsByUser(_tenantId: string, userId: string) {
    return apiFetch<CashSession[]>(`/cash-sessions?user_id=${userId}`);
  },

  // Obtener estadísticas de caja
  async getCashStats(_tenantId: string) {
    const data = await apiFetch<CashSession[]>('/cash-sessions?status=closed');

    const totalOpened = data.reduce((sum, s) => sum + s.opening_amount, 0);
    const totalClosed = data.reduce((sum, s) => sum + (s.closing_amount || 0), 0);
    const totalSessions = data.length;

    return {
      totalSessions,
      totalOpened,
      totalClosed,
      averagePerSession: totalSessions > 0 ? totalClosed / totalSessions : 0,
    };
  },
};

// ============================================
// CASH MOVEMENTS SERVICE
// ============================================

export const cashMovementsService = {
  // Obtener todos los movimientos
  async getAllMovements(_tenantId: string) {
    return apiFetch<CashMovement[]>('/cash-sessions/movements');
  },

  // Obtener movimientos de una sesión
  async getSessionMovements(sessionId: string) {
    return apiFetch<CashMovement[]>(`/cash-sessions/${sessionId}/movements`);
  },

  // Crear movimiento
  async createMovement(
    sessionId: string,
    _tenantId: string,
    type: 'opening' | 'sale' | 'adjustment' | 'closing',
    amount: number,
    description: string,
    referenceId?: string
  ) {
    return apiFetch<CashMovement>(`/cash-sessions/${sessionId}/movements`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        amount,
        description,
        reference_id: referenceId,
      }),
    });
  },

  // Obtener movimientos por tipo
  async getMovementsByType(
    _tenantId: string,
    type: 'opening' | 'sale' | 'adjustment' | 'closing'
  ) {
    return apiFetch<CashMovement[]>(`/cash-sessions/movements?type=${type}`);
  },

  // Obtener movimientos por rango de fechas
  async getMovementsByDateRange(
    _tenantId: string,
    startDate: string,
    endDate: string
  ) {
    return apiFetch<CashMovement[]>(`/cash-sessions/movements?from=${startDate}&to=${endDate}`);
  },

  // Obtener total de movimientos por tipo
  async getTotalByType(_tenantId: string, type: string) {
    const data = await apiFetch<CashMovement[]>(`/cash-sessions/movements?type=${type}`);
    return data.reduce((sum, m) => sum + m.amount, 0);
  },
};

// ============================================
// EXPORTS
// ============================================

export const cashService = {
  sessions: cashSessionsService,
  movements: cashMovementsService,

  // Métodos rápidos
  getActiveCashSession: cashSessionsService.getActiveCashSession.bind(cashSessionsService),
  openCashSession: cashSessionsService.openCashSession.bind(cashSessionsService),
  closeCashSession: cashSessionsService.closeCashSession.bind(cashSessionsService),
  getSessionSummary: cashSessionsService.getSessionSummary.bind(cashSessionsService),
};

export default cashService;
