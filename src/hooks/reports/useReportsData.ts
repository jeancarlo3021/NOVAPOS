import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface DailyStat {
  date: string;       // 'YYYY-MM-DD'
  label: string;      // 'Lun', 'Mar', …
  total: number;
  count: number;
}

export interface PaymentStat {
  method: string;
  label: string;
  total: number;
  count: number;
}

export interface TopProduct {
  product_id: string;
  name: string;
  qty: number;
  revenue: number;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  issued_at: string;
  total: number;
  payment_method: string;
  customer_name?: string;
}

export interface ReportsSummary {
  todayTotal: number;
  todayCount: number;
  periodTotal: number;
  periodCount: number;
  avgTicket: number;
  dailyStats: DailyStat[];
  paymentStats: PaymentStat[];
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  sinpe: 'SINPE',
  check: 'Cheque',
  transfer: 'Transferencia',
};

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function useReportsData(tenantId: string | null) {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (from: string, to: string) => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { data: rows, error: err } = await supabase
        .from('invoices')
        .select('id, issued_at, total, payment_method, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('issued_at', `${from}T00:00:00`)
        .lte('issued_at', `${to}T23:59:59`);

      if (err) throw err;
      const all = rows ?? [];

      // Today subset
      const today = all.filter(r => {
        const d = new Date(r.issued_at);
        return d >= todayStart && d <= todayEnd;
      });

      // Daily stats — build a map keyed by YYYY-MM-DD
      const dayMap: Record<string, { total: number; count: number }> = {};
      all.forEach(r => {
        const key = r.issued_at.slice(0, 10);
        if (!dayMap[key]) dayMap[key] = { total: 0, count: 0 };
        dayMap[key].total += Number(r.total);
        dayMap[key].count += 1;
      });

      // Generate every date in [from, to]
      const dailyStats: DailyStat[] = [];
      const cursor = new Date(`${from}T12:00:00`);
      const end = new Date(`${to}T12:00:00`);
      while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        dailyStats.push({
          date: key,
          label: DAY_LABELS[cursor.getDay()],
          total: dayMap[key]?.total ?? 0,
          count: dayMap[key]?.count ?? 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      // Payment breakdown
      const pmMap: Record<string, { total: number; count: number }> = {};
      all.forEach(r => {
        const m = r.payment_method;
        if (!pmMap[m]) pmMap[m] = { total: 0, count: 0 };
        pmMap[m].total += Number(r.total);
        pmMap[m].count += 1;
      });
      const paymentStats: PaymentStat[] = Object.entries(pmMap).map(([m, v]) => ({
        method: m,
        label: PAYMENT_LABELS[m] ?? m,
        total: v.total,
        count: v.count,
      }));

      const periodTotal = all.reduce((s, r) => s + Number(r.total), 0);
      const periodCount = all.length;

      setSummary({
        todayTotal: today.reduce((s, r) => s + Number(r.total), 0),
        todayCount: today.length,
        periodTotal,
        periodCount,
        avgTicket: periodCount > 0 ? periodTotal / periodCount : 0,
        dailyStats,
        paymentStats,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const fetchTopProducts = useCallback(async (from: string, to: string) => {
    if (!tenantId) return;
    try {
      const { data, error: err } = await supabase
        .from('invoice_items')
        .select('product_id, quantity, subtotal, products(name), invoices!inner(tenant_id, status, issued_at)')
        .eq('invoices.tenant_id', tenantId)
        .eq('invoices.status', 'completed')
        .gte('invoices.issued_at', `${from}T00:00:00`)
        .lte('invoices.issued_at', `${to}T23:59:59`);

      if (err) throw err;

      const map: Record<string, TopProduct> = {};
      (data ?? []).forEach((item: any) => {
        const pid = item.product_id;
        if (!map[pid]) map[pid] = { product_id: pid, name: item.products?.name ?? pid, qty: 0, revenue: 0 };
        map[pid].qty += item.quantity;
        map[pid].revenue += Number(item.subtotal);
      });

      setTopProducts(
        Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
      );
    } catch (e) {
      console.error('Error top products:', e);
    }
  }, [tenantId]);

  const fetchInvoices = useCallback(async (from: string, to: string) => {
    if (!tenantId) return;
    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('id, invoice_number, issued_at, total, payment_method, customer_name, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('issued_at', `${from}T00:00:00`)
        .lte('issued_at', `${to}T23:59:59`)
        .order('issued_at', { ascending: false })
        .limit(200);

      if (err) throw err;
      setInvoices(data ?? []);
    } catch (e) {
      console.error('Error invoices:', e);
    }
  }, [tenantId]);

  const exportCSV = useCallback(() => {
    if (!invoices.length) return;
    const header = 'Factura,Fecha,Total,Método,Cliente';
    const rows = invoices.map(r =>
      `${r.invoice_number},${new Date(r.issued_at).toLocaleString('es-CR')},${r.total},${PAYMENT_LABELS[r.payment_method] ?? r.payment_method},${r.customer_name ?? ''}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [invoices]);

  return { summary, topProducts, invoices, loading, error, fetchSummary, fetchTopProducts, fetchInvoices, exportCSV };
}
