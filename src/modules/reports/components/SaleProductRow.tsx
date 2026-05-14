import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

// ── Expandable sale-by-product row used in ProductDetailReport ────────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE',
  check: 'Cheque', transfer: 'Transferencia',
};
const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981', card: '#3b82f6', sinpe: '#8b5cf6',
  check: '#f59e0b', transfer: '#6b7280',
};

export interface SaleLine {
  invoice_number: string;
  issued_at: string;
  customer_name: string | null;
  payment_method: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface SaleGroup {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_revenue: number;
  sales_count: number;
  lines: SaleLine[];
}

export interface SaleProductRowProps {
  group: SaleGroup;
  rank: number;
}

export function SaleProductRow({ group, rank }: SaleProductRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer transition border-b border-gray-100" onClick={() => setOpen(o => !o)}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${rank <= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{rank}</span>
            <span className="font-semibold text-gray-900 text-sm">{group.product_name}</span>
          </div>
        </td>
        <td className="px-5 py-3 text-center text-sm font-semibold text-gray-600">{group.total_qty}</td>
        <td className="px-5 py-3 text-center text-sm text-gray-500">{group.sales_count}</td>
        <td className="px-5 py-3 text-right font-black text-emerald-600 text-sm">{fmt(group.total_revenue)}</td>
        <td className="px-5 py-3 text-right text-gray-400">{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</td>
      </tr>
      {open && group.lines.map((line, i) => (
        <tr key={i} className="bg-emerald-50/30 border-b border-emerald-100/50">
          <td className="pl-14 pr-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-emerald-700 font-bold">{line.invoice_number}</span>
              <span className="text-xs text-gray-400">{fmtDateTime(line.issued_at)}</span>
            </div>
            <p className="text-xs mt-0.5">
              {line.customer_name
                ? <span className="font-medium text-gray-700">{line.customer_name}</span>
                : <span className="italic text-gray-400">Cliente anónimo</span>}
            </p>
          </td>
          <td className="px-5 py-2.5 text-center text-sm text-gray-700 font-semibold">{line.quantity}</td>
          <td className="px-5 py-2.5 text-center">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: (PAYMENT_COLORS[line.payment_method] ?? '#94a3b8') + '22', color: PAYMENT_COLORS[line.payment_method] ?? '#6b7280' }}>
              {PAYMENT_LABELS[line.payment_method] ?? line.payment_method}
            </span>
          </td>
          <td className="px-5 py-2.5 text-right">
            <p className="text-xs text-gray-400">{fmt(line.unit_price)} c/u</p>
            <p className="font-bold text-gray-800 text-sm">{fmt(line.subtotal)}</p>
          </td>
          <td />
        </tr>
      ))}
    </>
  );
}
