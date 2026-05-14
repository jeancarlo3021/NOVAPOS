import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Truck } from 'lucide-react';

// ── Expandable purchase-by-product row used in ProductDetailReport ────────────

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { dateStyle: 'short' });

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', received: 'Recibida', cancelled: 'Cancelada',
};
const PURCHASE_STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', received: '#10b981', cancelled: '#ef4444',
};

export interface PurchaseLine {
  purchase_number: string;
  purchase_date: string;
  supplier_name: string;
  status: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface PurchaseGroup {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_cost: number;
  purchase_count: number;
  lines: PurchaseLine[];
}

export interface PurchaseProductRowProps {
  group: PurchaseGroup;
  rank: number;
}

export function PurchaseProductRow({ group, rank }: PurchaseProductRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer transition border-b border-gray-100" onClick={() => setOpen(o => !o)}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${rank <= 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{rank}</span>
            <span className="font-semibold text-gray-900 text-sm">{group.product_name}</span>
          </div>
        </td>
        <td className="px-5 py-3 text-center text-sm font-semibold text-gray-600">{group.total_qty}</td>
        <td className="px-5 py-3 text-center text-sm text-gray-500">{group.purchase_count}</td>
        <td className="px-5 py-3 text-right font-black text-blue-600 text-sm">{fmt(group.total_cost)}</td>
        <td className="px-5 py-3 text-right text-gray-400">{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</td>
      </tr>
      {open && group.lines.map((line, i) => (
        <tr key={i} className="bg-blue-50/30 border-b border-blue-100/50">
          <td className="pl-14 pr-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-blue-700 font-bold">{line.purchase_number}</span>
              <span className="text-xs text-gray-400">{fmtDate(line.purchase_date)}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Truck size={11} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-700">{line.supplier_name}</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: (PURCHASE_STATUS_COLORS[line.status] ?? '#94a3b8') + '22', color: PURCHASE_STATUS_COLORS[line.status] ?? '#6b7280' }}
              >
                {PURCHASE_STATUS_LABELS[line.status] ?? line.status}
              </span>
            </div>
          </td>
          <td className="px-5 py-2.5 text-center text-sm text-gray-700 font-semibold">{line.quantity}</td>
          <td className="px-5 py-2.5 text-center text-xs text-gray-400">{fmt(line.unit_price)} c/u</td>
          <td className="px-5 py-2.5 text-right font-bold text-gray-800 text-sm">{fmt(line.subtotal)}</td>
          <td />
        </tr>
      ))}
    </>
  );
}
