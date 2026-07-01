import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { wallClockDate } from '@/utils/datetime';

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

      const response = await apiFetch<{
        invoices: Array<{
          id: string;
          issued_at: string;
          total: number;
          payment_method: string;
          status: string;
        }>;
      }>(`/reports/sales?from=${from}&to=${to}`);

      const all = response?.invoices ?? [];

      // Today subset
      const today = all.filter(r => {
        const d = wallClockDate(r.issued_at) ?? new Date(r.issued_at);
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
      const response = await apiFetch<Array<{
        product_id: string;
        product_name: string;
        total_qty: number;
        total_revenue: number;
      }>>(`/reports/products/sales?from=${from}&to=${to}`);
      const topByRevenue = (response ?? [])
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 10)
        .map(p => ({
          product_id: p.product_id,
          name: p.product_name,
          qty: p.total_qty,
          revenue: p.total_revenue,
        }));
      setTopProducts(topByRevenue);
    } catch (e) {
    }
  }, [tenantId]);

  const fetchInvoices = useCallback(async (from: string, to: string) => {
    if (!tenantId) return;
    try {
      const res = await apiFetch<{ invoices: InvoiceRow[] }>(`/reports/sales?from=${from}&to=${to}&detail=true`);
      setInvoices(res?.invoices ?? []);
    } catch (e) {
    }
  }, [tenantId]);

  const exportCSV = useCallback(() => {
    if (!invoices.length) return;
    const header = 'Factura,Fecha,Total,Método,Cliente';
    const rows = invoices.map(r =>
      `${r.invoice_number},${(wallClockDate(r.issued_at) ?? new Date(r.issued_at)).toLocaleString('es-CR')},${r.total},${PAYMENT_LABELS[r.payment_method] ?? r.payment_method},${r.customer_name ?? ''}`
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
