import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { ok, fail } from '../utils/response.js';

const purchases = new Hono<{ Variables: { userId: string; tenantId: string; role: string } }>();

const ItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity:   z.number().positive(),
  unit_price: z.number().nonnegative(),
  subtotal:   z.number().nonnegative().optional().nullable(),
});

const PurchaseSchema = z.object({
  supplier_id:            z.string().uuid(),
  purchase_number:        z.string().min(1),
  purchase_date:          z.string(),
  expected_delivery_date: z.string().optional().nullable(),
  notes:                  z.string().optional().nullable(),
  total_amount:           z.number().nonnegative().optional().nullable(),
  items:                  z.array(ItemSchema).min(1),
});

purchases.get('/', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const status   = c.req.query('status');

    let query = db.from('purchases')
      .select('*, suppliers(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ok(c, data);
  } catch (err: any) { return fail(c, err.message, 500); }
});

purchases.get('/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { id }   = c.req.param();

    // Get purchase
    const { data: purchase, error: pErr } = await db.from('purchases')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (pErr) throw new Error(pErr.message);
    if (!purchase) return fail(c, 'Compra no encontrada', 404);

    // Get supplier name
    const { data: supplier, error: sErr } = await db.from('suppliers')
      .select('name')
      .eq('id', purchase.supplier_id)
      .maybeSingle();

    if (sErr) console.error('Error fetching supplier:', sErr);

    // Get items for this purchase
    const { data: purchaseItems, error: iErr } = await db.from('purchase_items')
      .select('*')
      .eq('purchase_id', id);

    if (iErr) {
      console.error('Error fetching items:', iErr);
      return fail(c, 'Error al obtener items: ' + iErr.message, 500);
    }

    return ok(c, {
      ...purchase,
      suppliers: supplier ? { name: supplier.name } : null,
      purchase_items: purchaseItems || []
    });
  } catch (err: any) { return fail(c, err.message, 500); }
});

purchases.post('/', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const parsed = PurchaseSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, parsed.error.message, 422);

    const { items, ...purchaseData } = parsed.data;
    const { data: purchase, error: pErr } = await db.from('purchases')
      .insert({ ...purchaseData, tenant_id: tenantId, status: 'pending' }).select().single();
    if (pErr) throw new Error(pErr.message);

    const itemRows = items.map(item => ({ ...item, purchase_id: purchase.id }));
    const { error: iErr } = await db.from('purchase_items').insert(itemRows);
    if (iErr) throw new Error(iErr.message);

    return ok(c, purchase, 201);
  } catch (err: any) { return fail(c, err.message, 500); }
});

purchases.put('/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { id }   = c.req.param();
    const body     = await c.req.json();
    const { data, error } = await db.from('purchases')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId).select().single();
    if (error) throw new Error(error.message);
    return ok(c, data);
  } catch (err: any) { return fail(c, err.message, 500); }
});

// POST /:id/receive — mark as received, increment stock, create accounts payable if needed
purchases.post('/:id/receive', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { id }   = c.req.param();
    const { items } = await c.req.json() as { items: { product_id: string; quantity: number }[] };

    // Get purchase
    const { data: purchase, error: pErr } = await db.from('purchases')
      .select('*')
      .eq('id', id).eq('tenant_id', tenantId).single();
    if (pErr) throw new Error(pErr.message);
    if (!purchase) return fail(c, 'Compra no encontrada', 404);

    // Get supplier details
    const { data: supplier } = await db.from('suppliers')
      .select('name, payment_terms')
      .eq('id', purchase.supplier_id)
      .maybeSingle();

    // Mark as received
    const { data: updated, error: uErr } = await db.from('purchases')
      .update({ status: 'received', actual_delivery_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId).select().single();
    if (uErr) throw new Error(uErr.message);

    // Increment stock for each received item
    for (const item of (items ?? [])) {
      const { data: p } = await db.from('products').select('stock_quantity').eq('id', item.product_id).single();
      if (p) await db.from('products').update({
        stock_quantity: (p.stock_quantity ?? 0) + item.quantity,
        updated_at: new Date().toISOString(),
      }).eq('id', item.product_id);
    }

    // Create accounts payable if supplier has payment terms (credit)
    const paymentTerms = supplier?.payment_terms;
    if (paymentTerms && paymentTerms.trim().toLowerCase() !== 'contado') {
      const dueDate = calculateDueDate(purchase.purchase_date, paymentTerms);
      await db.from('accounts_payable').insert({
        tenant_id: tenantId,
        purchase_id: id,
        supplier_id: purchase.supplier_id,
        purchase_number: purchase.purchase_number,
        supplier_name: supplier?.name ?? 'Proveedor desconocido',
        total_amount: purchase.total_amount ?? 0,
        paid_amount: 0,
        due_date: dueDate,
        status: 'pending',
        payment_terms: paymentTerms,
        notes: purchase.notes,
      }).then(({ error }) => {
        if (error) console.error('Error creating accounts payable:', error.message);
      });
    }

    return ok(c, updated);
  } catch (err: any) { return fail(c, err.message, 500); }
});

// Helper to calculate due date from payment terms
function calculateDueDate(baseDate: string, terms: string): string {
  const match = terms.match(/(\d+)/);
  if (!match) return baseDate;
  const days = parseInt(match[1]);
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

purchases.delete('/:id', async (c) => {
  try {
    const tenantId = c.get('tenantId');
    const { id }   = c.req.param();
    const { data, error } = await db.from('purchases')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', tenantId).select().single();
    if (error) throw new Error(error.message);
    return ok(c, data);
  } catch (err: any) { return fail(c, err.message, 500); }
});

export default purchases;
