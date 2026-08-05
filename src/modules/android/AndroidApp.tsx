import React, { useEffect, useState } from 'react';
import {
  Smartphone, Download, ShieldCheck, AlertCircle, CheckCircle2, QrCode, Copy, Printer,
  Loader2, Save, Link2,
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/context/AuthContext';
import { isNativeApp } from '@/services/pos/nativePlatform';

/**
 * Descarga de la app de Android.
 *
 * El APK no se publica en Play Store, así que la instalación es directa: el
 * negocio abre este enlace desde el teléfono y lo instala. Como Android bloquea
 * por defecto lo que no viene de la tienda, la pantalla explica el paso de
 * "permitir esta instalación" — sin eso la descarga termina y no pasa nada, que
 * es donde la gente se queda trabada.
 */
/**
 * De dónde se descarga la app.
 *
 * Vive en Supabase Storage y no dentro del sitio: publicar una versión nueva es
 * reemplazar el archivo en el bucket, sin redesplegar ni engordar el repositorio
 * con 10 MB por cada versión.
 */
const DEFAULT_APK_URL =
  'https://hdmxpjscmkgfettmqcyl.supabase.co/storage/v1/object/public/app/app-release.apk';

export const AndroidAppUrl = DEFAULT_APK_URL;

export const AndroidApp: React.FC = () => {
  const { settings, updateSettings } = useSettings('general');
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  /** null = todavía sin comprobar. El archivo puede no estar publicado. */
  const [available, setAvailable] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  // El negocio (o el super-admin) puede apuntar a otro archivo; si no, el oficial.
  const apkUrl: string = String(
    (settings as any)?.apkUrl
    || (import.meta as any).env?.VITE_APK_URL
    || DEFAULT_APK_URL,
  );

  // Se comprueba que el archivo EXISTA antes de ofrecerlo. Sin esto, el botón
  // llevaba a un 404 y no había forma de saber si faltaba subir el APK o si el
  // enlace estaba mal escrito.
  useEffect(() => {
    let alive = true;
    setAvailable(null);
    (async () => {
      try {
        const r = await fetch(apkUrl, { method: 'HEAD' });
        if (alive) setAvailable(r.ok);
      } catch {
        // Un fallo de red NO significa que el archivo no esté: si el APK vive en
        // otro dominio (Supabase Storage, por ejemplo) el navegador bloquea la
        // comprobación por CORS. Bloquear la descarga por eso sería peor que el
        // 404 que se quería evitar, así que se deja pasar.
        if (alive) setAvailable(true);
      }
    })();
    return () => { alive = false; };
  }, [apkUrl]);

  useEffect(() => {
    // El QR se genera en el navegador: así el dueño lo muestra y cada empleado
    // instala desde su propio teléfono sin pasarse el enlace por chat.
    let alive = true;
    import('qrcode')
      .then(m => m.toDataURL(apkUrl, { width: 420, margin: 1 }))
      .then(url => { if (alive) setQr(url); })
      .catch(() => { /* sin QR, queda el enlace */ });
    return () => { alive = false; };
  }, [apkUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* algunos navegadores lo bloquean; el enlace está a la vista */ }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Smartphone size={26} className="text-emerald-600" /> App de Android
        </h1>
        <p className="text-gray-600 text-sm">
          Instalá ColónClick en el teléfono o la tablet del negocio.
        </p>
      </div>

      {isNativeApp() && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <span>Ya estás usando la app instalada. Esta pantalla sirve para instalarla en otro equipo.</span>
        </div>
      )}

      {available === false && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">El archivo de la app todavía no está publicado</p>
            <p className="text-[13px]">
              La dirección de descarga responde <b>404</b>. Hay que subir el APK a esa ruta
              {isAdmin ? ' o apuntar el enlace a donde esté publicado (botón «Cambiar enlace»).' : ' — pedíselo al administrador.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 bg-white border border-gray-200 rounded-2xl p-5">
        <div className="space-y-3">
          {available === false ? (
            <span className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-200 text-gray-500 font-black cursor-not-allowed">
              <Download size={18} /> Descarga no disponible
            </span>
          ) : (
            <a
              href={apkUrl}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black transition"
            >
              {available === null ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              Descargar la app
            </a>
          )}
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-gray-600">
              {apkUrl}
            </code>
            <button onClick={copy}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50">
              <Copy size={13} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Abrí este enlace <b>desde el teléfono</b>. Descargado en la computadora no sirve
            para instalar.
          </p>

          {/* El enlace se puede cambiar sin recompilar: el APK puede vivir en el
              propio sitio, en Supabase Storage o en cualquier otro lado. */}
          {isAdmin && (editing ? (
            <div className="flex items-center gap-2">
              <input
                value={draftUrl}
                onChange={e => setDraftUrl(e.target.value)}
                placeholder="https://…/colonclick.apk"
                className="flex-1 min-w-0 px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-emerald-400"
              />
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateSettings({ ...(settings ?? {}), apkUrl: draftUrl.trim() || undefined });
                    setEditing(false);
                  } finally { setSaving(false); }
                }}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
              </button>
              <button onClick={() => setEditing(false)}
                className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-bold">
                Cancelar
              </button>
            </div>
          ) : (
            <button onClick={() => { setDraftUrl(apkUrl); setEditing(true); }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-emerald-700">
              <Link2 size={13} /> Cambiar enlace de descarga
            </button>
          ))}
        </div>

        {qr && (
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <img src={qr} alt="Código QR de descarga" className="w-36 h-36 rounded-lg border border-gray-200" />
            <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
              <QrCode size={11} /> Escaneá con el teléfono
            </span>
            <button onClick={() => window.print()}
              className="text-[10px] text-gray-400 hover:text-gray-600 inline-flex items-center gap-1">
              <Printer size={11} /> Imprimir
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="font-black text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck size={17} className="text-emerald-600" /> Cómo instalarla
        </h2>
        <ol className="space-y-2.5 text-sm text-gray-700">
          {[
            'Abrí este enlace desde el teléfono (o escaneá el código QR).',
            'Descargá el archivo y tocá "Abrir" cuando termine.',
            'Android va a avisar que la app no viene de Play Store: tocá "Configuración" y activá "Permitir de esta fuente".',
            'Volvé atrás y tocá "Instalar".',
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black flex items-center justify-center">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Qué trae la app. El módulo de impresión Bluetooth va SIEMPRE incluido:
          una app de punto de venta que no imprime no sirve de nada. */}
      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm">
        <Printer size={16} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-bold mb-1">Qué incluye</p>
          <p className="text-[13px]">
            Vender, consultar y trabajar sin conexión, e <b>impresión térmica por
            Bluetooth</b> integrada. La primera vez, Android va a pedir permiso para
            conectarse a la impresora — hay que aceptarlo.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AndroidApp;
