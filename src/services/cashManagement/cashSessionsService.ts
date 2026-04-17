import { supabase } from '@/lib/supabase';
import { CashSession, CreateCashSessionInput, CloseCashSessionInput } from '@/types/Types_POS';

// ============================================
// CONFIGURACIÓN
// ============================================

const QUERY_TIMEOUT = 8000; // 8 segundos
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

// ============================================
// HELPER: Timeout
// ============================================

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout después de ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

// ============================================
// HELPER: Retry
// ============================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔄 Intento ${i + 1}/${maxRetries}...`);
      return await withTimeout(fn(), QUERY_TIMEOUT);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`⚠️ Intento ${i + 1} falló:`, lastError.message);

      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  throw lastError || new Error('Todos los intentos fallaron');
}

// ============================================
// GET OPEN CASH SESSION
// ============================================

export async function getOpenCashSession(
  tenantId: string
): Promise<CashSession | null> {
  console.log('📋 Buscando caja abierta...');
  console.log('Tenant ID:', tenantId);

  return withRetry(async () => {
    try {
      console.log('🔍 Ejecutando query...');

      const { data, error, status } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .order('opening_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('📊 Response status:', status);

      if (error) {
        console.error('❌ Error de Supabase:', error);
        throw error;
      }

      if (data) {
        console.log('✅ Caja encontrada:', data.id);
        console.log('Datos:', data);
      } else {
        console.log('ℹ️ No hay caja abierta');
      }

      return data as CashSession | null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('❌ Error:', msg);
      throw error;
    }
  });
}

// ============================================
// GET CASH SESSIONS BY TENANT
// ============================================

export async function getCashSessionsByTenant(
  tenantId: string,
  limit: number = 10
): Promise<CashSession[]> {
  console.log('📋 Buscando cajas...');

  return withRetry(async () => {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('opening_date', { ascending: false })
        .limit(limit);

      if (error) throw error;

      console.log(`✅ ${data?.length || 0} cajas encontradas`);
      return (data || []) as CashSession[];
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  });
}

// ============================================
// CREATE CASH SESSION
// ============================================

export async function createCashSession(
  input: CreateCashSessionInput
): Promise<CashSession> {
  console.log('💾 Creando caja...');
  console.log('Input:', input);

  return withRetry(async () => {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .insert([
          {
            tenant_id: input.tenant_id,
            user_id: input.user_id,
            opening_amount: input.opening_amount,
            notes: input.notes || null,
            status: 'open',
            opening_date: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      console.log('✅ Caja creada:', data.id);
      return data as CashSession;
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  });
}

// ============================================
// CLOSE CASH SESSION
// ============================================

export async function closeCashSession(
  input: CloseCashSessionInput
): Promise<CashSession> {
  console.log('🔒 Cerrando caja...');
  console.log('Input:', input);

  return withRetry(async () => {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .update({
          status: 'closed',
          closing_amount: input.closing_amount,
          closing_date: new Date().toISOString(),
          notes: input.notes || null,
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      console.log('✅ Caja cerrada:', data.id);
      return data as CashSession;
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  });
}

// ============================================
// EXPORT SERVICE
// ============================================

export const cashSessionService = {
  getOpenCashSession,
  getCashSessionsByTenant,
  createCashSession,
  closeCashSession,
};

export default cashSessionService;