import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Building, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function BranchSwitcher() {
  const { branches, currentBranchId, switchBranch } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (branches.length === 0) return null;
  const current = branches.find(b => b.id === currentBranchId) ?? branches[0];

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-blue-300 text-sm font-bold text-gray-700 transition">
        <Building size={14} className="text-blue-600" />
        <span className="hidden sm:inline">{current.name}</span>
        <span className="sm:hidden text-xs font-mono text-gray-500">{current.code}</span>
        {branches.length > 1 && <ChevronDown size={13} className="text-gray-400" />}
      </button>

      {open && branches.length > 1 && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-wider">
            Cambiar sucursal
          </div>
          {branches.map(b => {
            const active = b.id === current.id;
            return (
              <button key={b.id}
                onClick={() => { switchBranch(b.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition ${
                  active ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}>
                <Building size={13} className={active ? 'text-blue-600' : 'text-gray-400'} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                    {b.name}
                  </p>
                  <p className="text-[11px] text-gray-400 font-mono">{b.code}{b.is_default ? ' · principal' : ''}</p>
                </div>
                {active && <Check size={14} className="text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BranchSwitcher;
