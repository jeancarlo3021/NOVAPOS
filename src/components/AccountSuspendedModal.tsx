import { LogOut, Lock, Mail, Phone, MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const STATUS_META: Record<string, { title: string; description: string; color: string }> = {
  suspended: {
    title: 'Cuenta suspendida',
    description: 'Tu negocio ha sido suspendido. Contacta al administrador para reactivarlo.',
    color: 'amber',
  },
  inactive: {
    title: 'Cuenta inactiva',
    description: 'Tu negocio está inactivo. Contacta al administrador para reactivarlo.',
    color: 'gray',
  },
  cancelled: {
    title: 'Cuenta cancelada',
    description: 'Tu negocio ha sido cancelado. Contacta al administrador si necesitas reactivarlo.',
    color: 'red',
  },
};

export function AccountSuspendedModal({ status }: { status: string }) {
  const { tenant, logout } = useAuth();
  const meta = STATUS_META[status] ?? STATUS_META.suspended;

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden my-auto">
        {/* Top accent */}
        <div className={`bg-${meta.color}-500 h-2`} />

        <div className="p-8 text-center">
          {/* Icon */}
          <div className={`w-20 h-20 mx-auto mb-5 rounded-3xl bg-${meta.color}-100 flex items-center justify-center`}>
            <Lock size={36} className={`text-${meta.color}-600`} />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-black text-gray-900 mb-2">{meta.title}</h1>
          <p className="text-gray-600 text-sm leading-relaxed mb-6">
            {meta.description}
          </p>

          {/* Tenant info */}
          {tenant?.name && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-6">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">Negocio</p>
              <p className="text-gray-800 font-bold text-sm">{tenant.name}</p>
            </div>
          )}

          {/* Contact methods */}
          <div className="space-y-2 mb-6">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-black">Contacta al administrador</p>

            <a href="mailto:soporte@novapos.cr"
              className="flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl px-4 py-2.5 text-sm font-bold transition">
              <Mail size={15} /> soporte@novapos.cr
            </a>
            <a href="tel:+50688888888"
              className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl px-4 py-2.5 text-sm font-bold transition">
              <Phone size={15} /> +506 8888-8888
            </a>
            <a href="https://wa.me/50688888888"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-bold transition">
              <MessageCircle size={15} /> WhatsApp
            </a>
          </div>

          {/* Logout */}
          <button
            onClick={() => { logout(); }}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-4 py-2.5 text-sm font-bold transition"
          >
            <LogOut size={15} /> Cerrar sesión
          </button>

          <p className="text-[11px] text-gray-400 mt-5">
            Si crees que se trata de un error, comunícate por cualquiera de los medios anteriores.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AccountSuspendedModal;
