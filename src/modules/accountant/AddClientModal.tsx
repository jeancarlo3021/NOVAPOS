import React, { useState } from 'react';
import {
  X, Loader2, UserPlus, ShieldCheck, KeyRound, Eye, EyeOff, AlertCircle, Hash,
} from 'lucide-react';
import type { NewClientPayload, NewClientResult } from '@/services/accountant/accountantService';

interface Props {
  /** Cómo se crea el cliente. El Panel Admin lo hace dentro de un grupo; el
   *  portal del contador, dentro de su propia cartera. El formulario es el mismo. */
  submit: (payload: NewClientPayload) => Promise<NewClientResult>;
  /** Si se le puede dar acceso al cliente. Solo el administrador crea usuarios;
   *  el contador únicamente carga los datos del negocio. */
  allowAccess?: boolean;
  onClose: () => void;
  onCreated: (msg: string) => void;
}

const field = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-400';
const label = 'block text-[11px] font-bold text-gray-500 uppercase mb-1';

/**
 * Alta de un cliente: nombre, desde qué consecutivo sigue y su acceso.
 *
 * Deliberadamente NO pide los datos del emisor ni la llave .p12. Dar de alta al
 * cliente y configurarle la firma electrónica son dos momentos distintos —
 * mezclarlos obligaba a tener el certificado a mano solo para crear el negocio.
 * Lo único que no puede esperar es el consecutivo: si se arranca de 1 sobre una
 * cédula que ya facturó, Hacienda rechaza todo con -99.
 *
 * El bloque de credenciales solo sale con `allowAccess`: crear usuarios es del
 * administrador.
 */
export const AddClientModal: React.FC<Props> = ({ submit, allowAccess = true, onClose, onCreated }) => {
  const [name, setName] = useState('');

  // Último consecutivo YA emitido en el sistema anterior. Es lo único que hay que
  // saber al dar de alta: el resto de los datos del emisor —y la llave .p12— los
  // carga el administrador después.
  const [lastFactura, setLastFactura] = useState('');
  const [lastTiquete, setLastTiquete] = useState('');
  const [lastNc, setLastNc] = useState('');

  const [withAccess, setWithAccess] = useState(allowAccess);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [step, setStep]   = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { setError('Poné el nombre del negocio.'); return; }
    if (allowAccess && withAccess && (username.trim().length < 3 || password.length < 6)) {
      setError('El usuario del cliente necesita al menos 3 letras y la contraseña 6 caracteres.');
      return;
    }
    setBusy(true); setError('');
    try {
      setStep('Creando el negocio…');
      const num = (v: string) => {
        const n = parseInt(v.replace(/\D/g, ''), 10);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      const res = await submit({
        name: name.trim(),
        consecutivos: {
          factura: num(lastFactura),
          tiquete: num(lastTiquete),
          nota_credito: num(lastNc),
        },
        access: allowAccess && withAccess
          ? { username: username.trim(), password, full_name: name.trim() }
          : undefined,
      });

      onCreated(
        `Cliente "${name.trim()}" creado`
        + (res.user_email ? ` · usuario ${res.user_email.replace('@nexoerp.local', '')}` : ''),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el cliente');
    } finally { setBusy(false); setStep(''); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <UserPlus size={18} className="text-indigo-600" /> Añadir cliente
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
            </div>
          )}

          {/* ── Negocio ── */}
          <div>
            <label className={label}>Nombre del negocio *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={field}
              placeholder="Panadería La Espiga" autoFocus />
          </div>

          {/* ── Último consecutivo ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <Hash size={14} className="text-indigo-600" />
              <p className="text-xs font-black text-gray-700">Último consecutivo emitido</p>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-gray-500">
                El <b>último número que el cliente ya emitió</b> en su sistema anterior. La
                numeración sigue desde ahí: si se arranca de 1 sobre una cédula que ya
                facturó, Hacienda rechaza con <span className="font-mono">-99</span> (consecutivo
                duplicado). Dejalo vacío si nunca ha facturado electrónicamente.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={label}>Factura</label>
                  <input value={lastFactura} inputMode="numeric"
                    onChange={e => setLastFactura(e.target.value.replace(/\D/g, ''))}
                    className={field} placeholder="0" />
                </div>
                <div>
                  <label className={label}>Tiquete</label>
                  <input value={lastTiquete} inputMode="numeric"
                    onChange={e => setLastTiquete(e.target.value.replace(/\D/g, ''))}
                    className={field} placeholder="0" />
                </div>
                <div>
                  <label className={label}>Nota de crédito</label>
                  <input value={lastNc} inputMode="numeric"
                    onChange={e => setLastNc(e.target.value.replace(/\D/g, ''))}
                    className={field} placeholder="0" />
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-800">
                <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                <span>
                  Los datos del emisor (cédula, actividad, dirección) y la <b>llave
                  criptográfica .p12</b> los carga el administrador desde la configuración de
                  facturación electrónica.
                </span>
              </div>
            </div>
          </div>

          {/* ── Acceso del cliente ── */}
          {allowAccess && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <KeyRound size={14} className="text-amber-600" />
              <p className="text-xs font-black text-gray-700">Acceso del cliente al portal</p>
              <label className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-gray-600 cursor-pointer">
                <input type="checkbox" checked={withAccess} onChange={e => setWithAccess(e.target.checked)} />
                Crear usuario
              </label>
            </div>
            {withAccess && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Usuario</label>
                  <input value={username} onChange={e => setUsername(e.target.value)} className={field}
                    placeholder="laespiga" autoComplete="off" />
                  <p className="text-[10px] text-gray-400 mt-1">Sin arroba se vuelve un usuario interno.</p>
                </div>
                <div>
                  <label className={label}>Contraseña</label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)} className={field} autoComplete="new-password" />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Mínimo 6 caracteres.</p>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          {busy && step && (
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> {step}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition">
              Cancelar
            </button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-lg transition disabled:opacity-50 flex items-center gap-2">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              Crear cliente
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AddClientModal;
