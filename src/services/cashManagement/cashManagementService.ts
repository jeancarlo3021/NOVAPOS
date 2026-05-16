import { apiFetch } from '@/lib/api';

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
  async getAllSessions(tenantId: string) {
    return apiFetch<CashSession[]>(`/cash-sessions?tenant_id=${tenantId}`);
  },

  // Obtener sesión de caja abierta
  async getActiveCashSession(tenantId: string) {
    return apiFetch<CashSession | null>(`/cash-sessions/active?tenant_id=${tenantId}`);
  },

  // Obtener sesión por ID
  async getSessionById(id: string) {
    return apiFetch<CashSession>(`/cash-sessions/${id}`);
  },

  // Abrir caja
  async openCashSession(
    tenantId: string,
    userId: string,
    openingAmount: number,
    notes?: string
  ) {
    const session = await apiFetch<CashSession>('/cash-sessions', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId,
        user_id: userId,
        opening_amount: openingAmount,
        status: 'open',
        notes,
        opened_at: new Date().toISOString(),
      }),
    });

    // Registrar movimiento de apertura
    await cashMovementsService.createMovement(
      session.id,
      tenantId,
      'income',
      openingAmount,
      'Apertura de caja'
    );

    return session;
  },

  // Cerrar caja
  async closeCashSession(
    sessionId: string,
    closingAmount: number,
    notes?: string
  ) {
    const session = await apiFetch<CashSession>(`/cash-sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        closing_amount: closingAmount,
        status: 'closed',
        closed_at: new Date().toISOString(),
        notes,
      }),
    });

    // Registrar movimiento de cierre
    await cashMovementsService.createMovement(
      sessionId,
      session.tenant_id,
      'expense',
      closingAmount,
      'Cierre de caja'
    );

    return session;
  },

  // Obtener resumen de sesión
  async getSessionSummary(sessionId: string) {
    const session = await this.getSessionById(sessionId);
    const movements = await cashMovementsService.getSessionMovements(sessionId);

    const totalSales = movements
      ?.filter((m) => m.type === 'sale')
      .reduce((sum, m) => sum + m.amount, 0) || 0;

    const totalAdjustments = movements
      ?.filter((m) => m.type === 'adjustment')
      .reduce((sum, m) => sum + m.amount, 0) || 0;

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
    tenantId: string,
    startDate: string,
    endDate: string
  ) {
    return apiFetch<CashSession[]>(
      `/cash-sessions?tenant_id=${tenantId}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
    );
  },

  // Obtener sesiones de un usuario
  async getSessionsByUser(tenantId: string, userId: string) {
    return apiFetch<CashSession[]>(
      `/cash-sessions?tenant_id=${tenantId}&user_id=${encodeURIComponent(userId)}`
    );
  },

  // Obtener estadísticas de caja
  async getCashStats(tenantId: string) {
    const data = await apiFetch<CashSession[]>(
      `/cash-sessions?tenant_id=${tenantId}&status=closed`
    );

    const totalOpened = data?.reduce((sum, s) => sum + s.opening_amount, 0) || 0;
    const totalClosed = data?.reduce((sum, s) => sum + (s.closing_amount || 0), 0) || 0;
    const totalSessions = data?.length || 0;

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
  async getAllMovements(tenantId: string) {
    return apiFetch<CashMovement[]>(`/cash-sessions/movements?tenant_id=${tenantId}`);
  },

  // Obtener movimientos de una sesión
  async getSessionMovements(sessionId: string) {
    return apiFetch<CashMovement[]>(`/cash-sessions/${sessionId}/movements`);
  },

  // Crear movimiento
  async createMovement(
    sessionId: string,
    _tenantId: string,
    type: 'income' | 'expense' | 'sale',
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
    tenantId: string,
    type: 'opening' | 'sale' | 'adjustment' | 'closing'
  ) {
    return apiFetch<CashMovement[]>(
      `/cash-sessions/movements?tenant_id=${tenantId}&type=${encodeURIComponent(type)}`
    );
  },

  // Obtener movimientos por rango de fechas
  async getMovementsByDateRange(
    tenantId: string,
    startDate: string,
    endDate: string
  ) {
    return apiFetch<CashMovement[]>(
      `/cash-sessions/movements?tenant_id=${tenantId}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
    );
  },

  // Obtener total de movimientos por tipo
  async getTotalByType(tenantId: string, type: string) {
    const data = await apiFetch<CashMovement[]>(
      `/cash-sessions/movements?tenant_id=${tenantId}&type=${encodeURIComponent(type)}`
    );
    return data?.reduce((sum, m) => sum + m.amount, 0) || 0;
  },
};

// ============================================
// EXPORTS
// ============================================

export const cashService = {
  sessions: cashSessionsService,
  movements: cashMovementsService,

  // Métodos rápidos
  getActiveCashSession: cashSessionsService.getActiveCashSession,
  openCashSession: cashSessionsService.openCashSession,
  closeCashSession: cashSessionsService.closeCashSession,
  getSessionSummary: cashSessionsService.getSessionSummary,
};
