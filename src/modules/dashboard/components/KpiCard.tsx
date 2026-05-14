import { type ComponentType } from 'react';

export interface KpiCardProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  onClick?: () => void;
}

export function KpiCard({ icon: Icon, label, value, sub, color, onClick }: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-200 transition' : ''
      }`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-black text-gray-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
