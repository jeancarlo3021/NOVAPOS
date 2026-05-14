import { type ComponentType } from 'react';
import { ArrowUpRight } from 'lucide-react';

export interface QuickTileProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  desc: string;
  color: string;
  bg: string;
  onClick: () => void;
}

export function QuickTile({ icon: Icon, label, desc, color, bg, onClick }: QuickTileProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-start p-4 rounded-2xl border transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${bg} border-transparent text-left w-full`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon size={19} className="text-white" />
      </div>
      <p className="font-black text-gray-900 text-sm leading-tight">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      <div className="flex items-center gap-0.5 mt-2 text-xs font-semibold text-gray-400 group-hover:text-gray-600 transition">
        Abrir <ArrowUpRight size={12} />
      </div>
    </button>
  );
}
