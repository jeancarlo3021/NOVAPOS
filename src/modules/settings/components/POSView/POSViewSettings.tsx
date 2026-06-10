import { useState } from 'react';
import {
  Hand, Mouse, Sparkles, Check, MonitorSmartphone,
  LayoutGrid, List, Accessibility, KeyRound,
} from 'lucide-react';
import { usePOSViewMode, type POSViewPreference } from '@/hooks/usePOSViewMode';
import { usePOSLayout, type POSLayout } from '@/hooks/usePOSLayout';
import { useAssistedMode } from '@/hooks/useAssistedMode';
import { useAuth } from '@/context/AuthContext';

interface Option {
  value: POSViewPreference;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
}


const LAYOUT_OPTIONS: { value: POSLayout; title: string; description: string; icon: React.ElementType; accent: string }[] = [
  {
    value: 'grid',
    title: 'Cuadrícula',
    description: 'Tarjetas grandes con imagen, ideal para POS con muchos productos visuales.',
    icon: LayoutGrid,
    accent: 'blue',
  },
  {
    value: 'list',
    title: 'Lista',
    description: 'Filas compactas con buscador grande. Perfecto cuando trabajas mayormente por código o nombre.',
    icon: List,
    accent: 'cyan',
  },
];

const KIOSK_KEY = 'novapos_pos_kiosk_enabled';

export function POSViewSettings() {
  const { layout, setLayout } = usePOSLayout();
  const { assisted, setAssisted } = useAssistedMode();
  const { planFeatures } = useAuth();
  const planAllowsKiosk = !!planFeatures?.pos_kiosk;
  const [kioskEnabled, setKioskEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(KIOSK_KEY) === '1'; } catch { return false; }
  });
  const toggleKiosk = () => {
    const next = !kioskEnabled;
    setKioskEnabled(next);
    try {
      if (next) localStorage.setItem(KIOSK_KEY, '1');
      else      localStorage.removeItem(KIOSK_KEY);
    } catch { /* SSR */ }
  };

  return (
    <div className="space-y-8">
      
      {/* ── Sección 2: Layout del POS ───────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <LayoutGrid size={24} className="text-cyan-600" />
          Cómo se ven los productos
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Define la disposición principal del catálogo dentro del POS.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {LAYOUT_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const selected = layout === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLayout(opt.value)}
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

      {/* ── Modo Kiosk POS (PIN por cajero) ─ solo si el plan lo incluye ── */}
      {planAllowsKiosk && (
      <>
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <KeyRound size={24} className="text-amber-600" />
          Modo Kiosk con PIN
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Mantiene el POS abierto con un único usuario base y permite que los cajeros entren
          y salgan con un PIN propio. Útil cuando varios cajeros comparten el mismo terminal.
        </p>
      </div>

      <button
        type="button"
        onClick={toggleKiosk}
        className={`w-full text-left rounded-2xl border-2 p-5 transition flex items-start gap-4 ${
          kioskEnabled
            ? 'border-amber-500 bg-amber-50/50 shadow-md'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${kioskEnabled ? 'bg-amber-100' : 'bg-gray-100'}`}>
          <KeyRound size={22} className={kioskEnabled ? 'text-amber-600' : 'text-gray-400'} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-gray-900 text-base mb-1">
            {kioskEnabled ? 'Modo Kiosk ACTIVO' : 'Modo Kiosk (desactivado)'}
          </h3>
          <ul className="text-xs text-gray-600 space-y-0.5 mt-1">
            <li>• Al abrir el POS, pide PIN del cajero antes de operar</li>
            <li>• Botón "Cambiar cajero" arriba para alternar entre cajeros</li>
            <li>• Cada factura queda atribuida al cajero que estaba activo</li>
            <li>• El PIN de cada usuario se configura en <strong>Usuarios → Editar → 🔐 PIN del POS</strong></li>
          </ul>
        </div>
        <span className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition ${kioskEnabled ? 'bg-amber-500' : 'bg-gray-300'}`}>
          <span className={`block w-6 h-6 bg-white rounded-full shadow transition-transform ${kioskEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </span>
      </button>
      </>
      )}

      {/* ── Sección 3: Modo Asistido ───────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Accessibility size={24} className="text-emerald-600" />
          Modo Asistido
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Para usuarios con poco conocimiento de computadoras o personas mayores.
          Simplifica toda la app: menú principal con pocas opciones grandes, texto más grande y menos confirmaciones que confunden.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setAssisted(!assisted)}
        className={`w-full text-left rounded-2xl border-2 p-5 transition flex items-start gap-4 ${
          assisted
            ? 'border-emerald-500 bg-emerald-50/50 shadow-md'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${assisted ? 'bg-emerald-100' : 'bg-gray-100'}`}>
          <Accessibility size={22} className={assisted ? 'text-emerald-600' : 'text-gray-400'} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-gray-900 text-base mb-1">
            {assisted ? 'Modo Asistido ACTIVO' : 'Modo Asistido (desactivado)'}
          </h3>
          <ul className="text-xs text-gray-600 space-y-0.5 mt-1">
            <li>• Menú lateral con 4 botones grandes: Vender · Inventario · Mis Ventas · Caja</li>
            <li>• Tipografía un 20% más grande en toda la app</li>
            <li>• Menos preguntas "¿estás seguro?": cambios menores se pueden deshacer</li>
            <li>• POS muestra el total en pantalla con letra muy grande</li>
          </ul>
        </div>
        <span className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition ${assisted ? 'bg-emerald-500' : 'bg-gray-300'}`}>
          <span className={`block w-6 h-6 bg-white rounded-full shadow transition-transform ${assisted ? 'translate-x-5' : 'translate-x-0'}`} />
        </span>
      </button>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-xs">
        <p className="font-bold mb-1">Notas importantes</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Todas estas preferencias son <strong>por equipo</strong>. Si tienes 3 PCs cada una puede tener su configuración propia.</li>
          <li>El cambio aplica al instante, no necesitas reiniciar.</li>
          <li>Para acceder a un módulo que no esté en el menú reducido, usa el botón <strong>Más</strong>.</li>
        </ul>
      </div>
    </div>
  );
}

export default POSViewSettings;
