import React, { useEffect, useState } from 'react';
import {
  Smartphone, Download, ShieldCheck, AlertCircle, CheckCircle2, QrCode, Copy, Printer,
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
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
export const AndroidApp: React.FC = () => {
  const { settings } = useSettings('general');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  // URL configurable: si el negocio (o el super-admin) puso una propia, manda esa.
  const apkUrl: string = String(
    (settings as any)?.apkUrl
    || (import.meta as any).env?.VITE_APK_URL
    || `${window.location.origin}/app/colonclick.apk`,
  );

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

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 bg-white border border-gray-200 rounded-2xl p-5">
        <div className="space-y-3">
          <a
            href={apkUrl}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black transition"
          >
            <Download size={18} /> Descargar la app
          </a>
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

      {/* Honestidad sobre lo que la app hace y lo que no. Prometer impresión que
          no funciona sale más caro que avisarlo antes de instalar. */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-bold mb-1">Antes de instalar, tené en cuenta</p>
          <p className="text-[13px]">
            La app sirve para vender, consultar y trabajar sin conexión. Para
            imprimir tiquetes térmicos por Bluetooth se necesita la versión de la app
            que trae el módulo de impresión; si no, imprimí abriendo ColónClick en Chrome.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AndroidApp;
