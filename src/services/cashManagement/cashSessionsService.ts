import { apiFetch } from '@/lib/api';
import { CashSession, CreateCashSessionInput, CloseCashSessionInput } from '@/types/Types_POS';

// ============================================
// CONFIGURACIÓN
// ============================================

const QUERY_TIMEOUT = 5000; // 5 segundos
const MAX_RETRIES = 1;
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
      return await withTimeout(fn(), QUERY_TIMEOUT);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

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
  _tenantId: string
): Promise<CashSession | null> {

  return withRetry(async () => {
    try {
      const data = await apiFetch<CashSession | null>('/cash-sessions/active');

      if (data) {
      } else {
      }

      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });
}

// ============================================
// GET CASH SESSIONS BY TENANT
// ============================================

export async function getCashSessionsByTenant(
  _tenantId: string,
  limit: number = 10
): Promise<CashSession[]> {

  return withRetry(async () => {
    try {
      const data = await apiFetch<CashSession[]>(`/cash-sessions?limit=${limit}`);
      return data;
    } catch (error) {
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

  return withRetry(async () => {
    try {
      const data = await apiFetch<CashSession>('/cash-sessions/open', {
        method: 'POST',
        body: JSON.stringify({
          opening_amount: input.opening_amount,
          opening_usd: (input as any).opening_usd ?? 0,
          notes: input.notes || null,
        }),
      });

      return data;
    } catch (error) {
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

  return withRetry(async () => {
    try {
      const data = await apiFetch<CashSession>('/cash-sessions/' + input.id + '/close', {
        method: 'POST',
        body: JSON.stringify({
          closing_amount: input.closing_amount,
          closing_usd: (input as any).closing_usd ?? null,
          notes: input.notes || null,
        }),
      });

      return data;
    } catch (error) {
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
