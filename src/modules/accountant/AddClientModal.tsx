import React, { useState } from 'react';
import {
  X, Loader2, UserPlus, ShieldCheck, KeyRound, Eye, EyeOff, Upload, CheckCircle2, AlertCircle,
} from 'lucide-react';
import {
  accountantService, type NewClientPayload, type NewClientResult,
} from '@/services/accountant/accountantService';

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
 * Alta de un cliente: negocio, datos de Hacienda y credenciales del portal.
 *
 * Los pedazos van juntos a propósito. Antes había que crear el negocio en un
 * lado, cargarle la llave criptográfica en otro y darle el usuario al cliente en
 * un tercero — y cualquiera de los tres se olvidaba. Acá, apenas los datos están
 * completos y el .p12 sube, la empresa se registra sola en Alanube.
 *
 * El bloque de credenciales solo sale con `allowAccess`: crear usuarios es del
 * administrador. El contador carga los datos del negocio, nada más.
 */
export const AddClientModal: React.FC<Props> = ({ submit, allowAccess = true, onClose, onCreated }) => {
  const [name, setName]     = useState('');
  const [ident, setIdent]   = useState('');
  const [legal, setLegal]   = useState('');
  const [comm, setComm]     = useState('');
  const [email, setEmail]   = useState('');
  const [phone, setPhone]   = useState('');
  const [address, setAddress] = useState('');
  const [activity, setActivity] = useState('');
  const [env, setEnv] = useState<'production' | 'sandbox'>('production');

  const [pin, setPin]         = useState('');
  const [atvUser, setAtvUser] = useState('');
  const [atvPass, setAtvPass] = useState('');
  const [cert, setCert]       = useState<{ name: string; base64: string } | null>(null);

  const [withAccess, setWithAccess] = useState(allowAccess);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [step, setStep]   = useState('');

  const pickCert = (f: File | null) => {
    if (!f) { setCert(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? '');
      setCert({ name: f.name, base64: res.slice(res.indexOf(',') + 1) });
    };
    reader.readAsDataURL(f);
  };

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
      const res = await submit({
        name: name.trim(),
        hacienda: {
          identification: ident.replace(/\D/g, '') || undefined,
          name: legal.trim() || name.trim(),
          commercial_name: comm.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.replace(/\D/g, '') || undefined,
          address: address.trim() || undefined,
          economic_activity_code: activity.replace(/\D/g, '') || undefined,
          p12_password: pin || undefined,
          atv_username: atvUser.trim() || undefined,
          atv_password: atvPass || undefined,
          environment: env,
        },
        access: allowAccess && withAccess
          ? { username: username.trim(), password, full_name: name.trim() }
          : undefined,
      });

      const tenantId = res.tenant_id;
      let alanubeMsg = res.alanube?.message ?? '';

      // El certificado va después: necesita el id del negocio recién creado. Al
      // subirlo, el backend reintenta solo el alta en Alanube.
      if (tenantId && cert) {
        setStep('Subiendo la llave criptográfica…');
        const up = await accountantService.uploadCertificate(tenantId, {
          file_base64: cert.base64, filename: cert.name,
          p12_password: pin || undefined, environment: env,
        });
        alanubeMsg = (up as any)?.alanube?.message ?? alanubeMsg;
      }

      onCreated(
        `Cliente "${name.trim()}" creado`
        + (res.user_email ? ` · usuario ${res.user_email.replace('@nexoerp.local', '')}` : '')
        + (alanubeMsg ? ` · ${alanubeMsg}` : ''),
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

          {/* ── Hacienda ── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-600" />
              <p className="text-xs font-black text-gray-700">Datos de Hacienda</p>
              <div className="ml-auto flex gap-1">
                {(['production', 'sandbox'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setEnv(v)}
                    className={`px-2 py-1 rounded-md text-[10px] font-black transition ${
                      env === v ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
                    {v === 'production' ? 'Producción' : 'Pruebas'}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Cédula</label>
                <input value={ident} onChange={e => setIdent(e.target.value)} className={field} placeholder="3101123456" />
              </div>
              <div>
                <label className={label}>Actividad económica</label>
                <input value={activity} onChange={e => setActivity(e.target.value)} className={field} placeholder="620100" />
              </div>
              <div>
                <label className={label}>Razón social</label>
                <input value={legal} onChange={e => setLegal(e.target.value)} className={field} placeholder="Igual al nombre si se deja vacío" />
              </div>
              <div>
                <label className={label}>Nombre comercial</label>
                <input value={comm} onChange={e => setComm(e.target.value)} className={field} />
              </div>
              <div>
                <label className={label}>Correo</label>
                <input value={email} onChange={e => setEmail(e.target.value)} className={field} placeholder="facturas@negocio.cr" />
              </div>
              <div>
                <label className={label}>Teléfono</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className={field} placeholder="88887777" />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Dirección (otras señas)</label>
                <input value={address} onChange={e => setAddress(e.target.value)} className={field} />
              </div>

              <div className="sm:col-span-2 border-t border-gray-100 pt-3">
                <p className="text-[11px] text-gray-400 mb-2">
                  Llave criptográfica y credenciales de ATV. Con esto completo, la empresa
                  se registra sola en Alanube.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Llave criptográfica (.p12)</label>
                <label className={`flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg cursor-pointer text-sm transition ${
                  cert ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-500 hover:border-indigo-300'}`}>
                  {cert ? <CheckCircle2 size={15} /> : <Upload size={15} />}
                  <span className="truncate">{cert ? cert.name : 'Seleccionar archivo .p12'}</span>
                  <input type="file" accept=".p12,.pfx" className="hidden"
                    onChange={e => pickCert(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <div>
                <label className={label}>PIN del certificado</label>
                <input type="password" value={pin} onChange={e => setPin(e.target.value)} className={field} />
              </div>
              <div />
              <div>
                <label className={label}>Usuario de API de ATV</label>
                <input value={atvUser} onChange={e => setAtvUser(e.target.value)} className={field}
                  placeholder="cpj-3-101-123456@stag.comprobanteselectronicos.go.cr" />
              </div>
              <div>
                <label className={label}>Contraseña de API de ATV</label>
                <input type="password" value={atvPass} onChange={e => setAtvPass(e.target.value)} className={field} />
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
