import { Hand, Mouse, Sparkles, Check, MonitorSmartphone } from 'lucide-react';
import { usePOSViewMode, type POSViewPreference } from '@/hooks/usePOSViewMode';

interface Option {
  value: POSViewPreference;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
}

const OPTIONS: Option[] = [
  {
    value: 'auto',
    title: 'Automático',
    description: 'Detecta táctil o mouse y elige el mejor modo por dispositivo.',
    icon: Sparkles,
    accent: 'violet',
  },
  {
    value: 'touch',
    title: 'Táctil',
    description: 'Botones grandes, espacios amplios, sin estados hover. Ideal para monitores táctiles y tablets.',
    icon: Hand,
    accent: 'emerald',
  },
  {
    value: 'desktop',
    title: 'Escritorio',
    description: 'Vista compacta con más densidad de información. Optimizado para teclado y mouse.',
    icon: Mouse,
    accent: 'blue',
  },
];

export function POSViewSettings() {
  const { preference, mode, setPreference } = usePOSViewMode();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <MonitorSmartphone size={24} className="text-blue-600" />
          Vista del POS
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Elige cómo se ve el punto de venta en este equipo. La preferencia se guarda solo para esta computadora o tablet.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OPTIONS.map(opt => {
          const Icon = opt.icon;
          const selected = preference === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPreference(opt.value)}
              className={`text-left rounded-2xl border-2 p-5 transition relative ${
                selected
                  ? `border-${opt.accent}-500 bg-${opt.accent}-50/50 shadow-md`
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {selected && (
                <span className={`absolute top-3 right-3 w-6 h-6 rounded-full bg-${opt.accent}-500 flex items-center justify-center`}>
                  <Check size={14} className="text-white" />
                </span>
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 bg-${opt.accent}-100`}>
                <Icon size={22} className={`text-${opt.accent}-600`} />
              </div>
              <h3 className="font-black text-gray-900 text-base mb-1">{opt.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{opt.description}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-start gap-3">
        <Sparkles size={18} className="text-gray-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold text-gray-800">
            Modo actualmente aplicado: <span className={`px-2 py-0.5 rounded-md text-xs font-mono ${mode === 'touch' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {mode === 'touch' ? 'Táctil' : 'Escritorio'}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {preference === 'auto'
              ? 'Detectado automáticamente según el equipo. Conecta o desconecta un mouse para forzar el cambio.'
              : 'Forzado manualmente. Cambia a "Automático" si quieres que se ajuste solo en este equipo.'}
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-sm">
        <p className="font-bold mb-1">¿Cómo se diferencian?</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li><strong>Táctil:</strong> botones de al menos 44 px, áreas de toque ampliadas, fuentes más grandes en el carrito y el total.</li>
          <li><strong>Escritorio:</strong> filas más densas, accesos rápidos con teclado, más productos visibles a la vez.</li>
          <li>El cambio aplica al instante en este equipo; no afecta a otros cajeros del negocio.</li>
        </ul>
      </div>
    </div>
  );
}

export default POSViewSettings;
