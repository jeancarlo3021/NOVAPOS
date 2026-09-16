import { AlertTriangle, Clock } from 'lucide-react';

export interface DaysTagProps {
  days: number | null;
}

export function DaysTag({ days }: DaysTagProps) {
  /**
   * Sin fecha de fin = NO VENCE.
   *
   * Es como se representa un plan vitalicio, y el control de acceso lo trata
   * así. Decir «Sin fecha» parecía un dato faltante y no una decisión.
   */
  if (days === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full"
        title="La suscripción no tiene fecha de vencimiento">
        ∞ Sin vencimiento
      </span>
    );
  }
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
        <AlertTriangle size={10} /> Vencido hace {Math.abs(days)}d
      </span>
    );
  if (days <= 7)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
        <Clock size={10} /> {days}d
      </span>
    );
  return <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{days}d</span>;
}
