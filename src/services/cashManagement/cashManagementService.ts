import { supabase } from '@/lib/supabase';

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
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('opened_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener sesión de caja abierta
  async getActiveCashSession(tenantId: string) {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  },

  // Obtener sesión por ID
  async getSessionById(id: string) {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Abrir caja
  async openCashSession(
    tenantId: string,
    userId: string,
    openingAmount: number,
    notes?: string
  ) {
    const { data, error } = await supabase
      .from('cash_sessions')
      .insert([
        {
          tenant_id: tenantId,
          user_id: userId,
          opening_amount: openingAmount,
          status: 'open',
          notes,
          opened_at: new Date().toISOString(),
        },
      ])
      .select()
      .maybeSingle();

    if (error) throw error;

    // Registrar movimiento de apertura
    await cashMovementsService.createMovement(
      data.id,
      tenantId,
      'income',
      openingAmount,
      'Apertura de caja'
    );

    return data;
  },

  // Cerrar caja
  async closeCashSession(
    sessionId: string,
    closingAmount: number,
    notes?: string
  ) {
    const { data, error } = await supabase
      .from('cash_sessions')
      .update({
        closing_amount: closingAmount,
        status: 'closed',
        closed_at: new Date().toISOString(),
        notes,
      })
      .eq('id', sessionId)
      .select()
      .maybeSingle();

    if (error) throw error;

    // Registrar movimiento de cierre
    await cashMovementsService.createMovement(
      sessionId,
      data.tenant_id,
      'expense',
      closingAmount,
      'Cierre de caja'
    );

    return data;
  },

  // Obtener resumen de sesión
  async getSessionSummary(sessionId: string) {
    const session = await this.getSessionById(sessionId);

    const { data: movements, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('cash_session_id', sessionId);

    if (error) throw error;

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
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('opened_at', startDate)
      .lte('opened_at', endDate)
      .order('opened_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener sesiones de un usuario
  async getSessionsByUser(tenantId: string, userId: string) {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('opened_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener estadísticas de caja
  async getCashStats(tenantId: string) {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('opening_amount, closing_amount, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'closed');

    if (error) throw error;

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
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener movimientos de una sesión
  async getSessionMovements(sessionId: string) {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('cash_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
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
    const { data, error } = await supabase
      .from('cash_movements')
      .insert([
        {
          cash_session_id: sessionId,
          type,
          amount,
          description,
          reference_id: referenceId,
        },
      ])
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Obtener movimientos por tipo
  async getMovementsByType(
    tenantId: string,
    type: 'opening' | 'sale' | 'adjustment' | 'closing'
  ) {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener movimientos por rango de fechas
  async getMovementsByDateRange(
    tenantId: string,
    startDate: string,
    endDate: string
  ) {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Obtener total de movimientos por tipo
  async getTotalByType(tenantId: string, type: string) {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('type', type);

    if (error) throw error;

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