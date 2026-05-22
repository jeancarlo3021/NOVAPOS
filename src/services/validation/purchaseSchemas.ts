import { z } from 'zod';

/**
 * Validation schemas for purchase offline operations
 */

export const PurchaseItemSchema = z.object({
  product_id: z.string().uuid('ID de producto inválido'),
  product_name: z.string().min(1, 'Nombre de producto requerido'),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unit_price: z.number().nonnegative('El precio unitario no puede ser negativo'),
  subtotal: z.number().nonnegative('El subtotal no puede ser negativo'),
});

export const PurchaseDataSchema = z.object({
  supplier_id: z.string().uuid('ID de proveedor inválido'),
  supplier_name: z.string().min(1, 'Nombre de proveedor requerido'),
  purchase_number: z.string().min(1, 'Número de compra requerido'),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  expected_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido').nullable().optional(),
  total_amount: z.number().positive('El monto total debe ser mayor a 0'),
  notes: z.string().nullable().optional(),
});

export const PendingPurchaseCreateSchema = z.object({
  tenantId: z.string().uuid('ID de tenant inválido'),
  purchaseData: PurchaseDataSchema,
  items: z.array(PurchaseItemSchema).optional().default([]),
});

export const PendingReceiveItemSchema = z.object({
  id: z.string().min(1, 'ID del item requerido'),
  product_id: z.string().uuid('ID de producto inválido'),
  qty_received: z.number().positive('La cantidad debe ser mayor a 0'),
  price_received: z.number().nonnegative('El precio no puede ser negativo'),
});

export const PendingReceiveSchema = z.object({
  purchaseId: z.string().uuid('ID de compra inválido'),
  tenantId: z.string().uuid('ID de tenant inválido'),
  items: z.array(PendingReceiveItemSchema).min(1, 'Debe haber al menos un item'),
  notes: z.string().nullable().optional(),
  canUpdateStock: z.boolean().default(true),
  totalReceived: z.number().positive('El monto total debe ser mayor a 0'),
  supplierTerms: z.string().nullable().optional(),
  supplierId: z.string().uuid('ID de proveedor inválido'),
  purchaseNumber: z.string().min(1, 'Número de compra requerido'),
  supplierName: z.string().min(1, 'Nombre de proveedor requerido'),
});

export const PendingCancelSchema = z.object({
  purchaseId: z.string().uuid('ID de compra inválido'),
  tenantId: z.string().uuid('ID de tenant inválido'),
});

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Helper to validate and return friendly error messages
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const validData = schema.parse(data);
    return { success: true, data: validData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return { success: false, error: messages };
    }
    return { success: false, error: 'Error de validación desconocido' };
  }
}
