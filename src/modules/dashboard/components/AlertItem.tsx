import { type ComponentType } from 'react';
import { ChevronRight } from 'lucide-react';

export interface AlertItemProps {
  color: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  text: string;
  path: string;
  navigate: (p: string) => void;
}

export function AlertItem({ color, icon: Icon, text, path, navigate }: AlertItemProps) {
  return (
    <button
      onClick={() => navigate(path)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left w-full sm:w-auto transition hover:shadow-sm ${color}`}
    >
      <Icon size={15} className="shrink-0" />
      <span className="text-sm font-semibold flex-1">{text}</span>
      <ChevronRight size={14} className="shrink-0 opacity-60" />
    </button>
  );
}
