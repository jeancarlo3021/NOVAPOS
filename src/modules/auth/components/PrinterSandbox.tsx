import { useEffect, useRef, useState } from 'react';
import {
  Printer, Wifi, WifiOff, RefreshCw, Send, AlertCircle, CheckCircle2,
  Code, Type, Banknote, Sparkles, Eraser, Bookmark,
} from 'lucide-react';
import {
  qzConnect, qzIsAvailable, qzIsConnected, qzGetPrinters,
  qzPrintUSB, qzPrintNetwork,
} from '@/services/pos/qzTrayService';
import { PRINTER_LANGUAGES, LANGUAGE_BY_ID, type PrinterFamily } from './printerLanguages';

interface RawCommand {
  id: string;
  label: string;
  bytes: number[];
  notes?: string;
}

// ── Secuencias ESC/POS típicas ─────────────────────────────────────────────
const ESCPOS: RawCommand[] = [
  { id: 'init',         label: 'Init impresora',         bytes: [0x1B, 0x40], notes: 'Resetea estado' },
  { id: 'feed3',        label: 'Avanzar 3 líneas',       bytes: [0x1B, 0x64, 0x03] },
  { id: 'cut',          label: 'Cortar papel (full)',    bytes: [0x1D, 0x56, 0x00] },
  { id: 'cutPartial',   label: 'Cortar parcial',         bytes: [0x1D, 0x56, 0x01] },
  { id: 'cutFeed',      label: 'Cortar + avanzar',       bytes: [0x1D, 0x56, 0x42, 0x00] },
  { id: 'beep',         label: 'Beep (5×9)',             bytes: [0x1B, 0x42, 0x05, 0x09] },
  { id: 'bold',         label: 'Negrita ON',             bytes: [0x1B, 0x45, 0x01] },
  { id: 'boldOff',      label: 'Negrita OFF',            bytes: [0x1B, 0x45, 0x00] },
  { id: 'double',       label: 'Doble alto + ancho',     bytes: [0x1B, 0x21, 0x30] },
  { id: 'normal',       label: 'Tamaño normal',          bytes: [0x1B, 0x21, 0x00] },
  { id: 'alignL',       label: 'Alinear izquierda',      bytes: [0x1B, 0x61, 0x00] },
  { id: 'alignC',       label: 'Alinear centro',         bytes: [0x1B, 0x61, 0x01] },
  { id: 'alignR',       label: 'Alinear derecha',        bytes: [0x1B, 0x61, 0x02] },
];

// ── Secuencias para abrir cajón ────────────────────────────────────────────
const DRAWER_KICKS: RawCommand[] = [
  {
    id: 'std-p2',
    label: 'ESC/POS estándar — pin 2',
    bytes: [0x1B, 0x70, 0x00, 0x19, 0xFA],
    notes: 'ESC p 0 25 250 — funciona en 90% de cajones (Epson, Xprinter, etc.)',
  },
  {
    id: 'std-p5',
    label: 'ESC/POS estándar — pin 5',
    bytes: [0x1B, 0x70, 0x01, 0x19, 0xFA],
    notes: 'ESC p 1 25 250 — usar si el pin 2 no funciona',
  },
  {
    id: 'long-pulse',
    label: 'ESC/POS pulso largo — pin 2',
    bytes: [0x1B, 0x70, 0x00, 0x32, 0xFA],
    notes: 'ESC p 0 50 250 — más fuerza para cajones duros',
  },
  {
    id: 'epson-alt',
    label: 'Epson alternativa (DLE DC4)',
    bytes: [0x10, 0x14, 0x01, 0x00, 0x05],
    notes: 'DLE DC4 — algunos Epson nuevos',
  },
  {
    id: 'star-bel',
    label: 'Star Line BEL (antiguo)',
    bytes: [0x07],
    notes: 'Solo Star Micronics modelos viejos',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
// El armado de bytes vive en printerLanguages.ts (cada lenguaje tiene su
// propia función wrap()). Acá solo necesitamos parsear input hex y previews.

function parseHexInput(text: string): Uint8Array {
  // Acepta "1B 40 0A" o "0x1B 0x40 0x0A" o "1B,40,0A" o sin separadores "1B400A".
  const cleaned = text.trim().replace(/0x/gi, '').replace(/[,\s]+/g, ' ');
  const tokens = cleaned.includes(' ')
    ? cleaned.split(' ').filter(Boolean)
    : (cleaned.match(/.{1,2}/g) ?? []);
  const out: number[] = [];
  for (const t of tokens) {
    const n = parseInt(t, 16);
    if (Number.isNaN(n) || n < 0 || n > 0xff) {
      throw new Error(`Byte inválido: "${t}"`);
    }
    out.push(n);
  }
  return new Uint8Array(out);
}

function hexPreview(bytes: Uint8Array, max = 32): string {
  const arr = Array.from(bytes.slice(0, max)).map(b => b.toString(16).padStart(2, '0').toUpperCase());
  const more = bytes.length > max ? ` … (+${bytes.length - max})` : '';
  return arr.join(' ') + more;
}

// ── Componente principal ───────────────────────────────────────────────────
export function PrinterSandbox() {
  // Conexión QZ
  const [qzReady,   setQzReady]   = useState(false);
  const [qzAvail,   setQzAvail]   = useState<boolean | null>(null);
  const [printers,  setPrinters]  = useState<string[]>([]);
  const [scanning,  setScanning]  = useState(false);

  // Destino seleccionado
  const [target,    setTarget]    = useState<'usb' | 'network'>('usb');
  const [usbName,   setUsbName]   = useState('');
  const [netIp,     setNetIp]     = useState('192.168.1.100');
  const [netPort,   setNetPort]   = useState('9100');

  // Texto plano + lenguaje seleccionado
  const [lang,      setLang]      = useState<string>('escpos');
  const [text,      setText]      = useState('PRUEBA DE IMPRESIÓN\nColónClick - Sandbox\n--- línea ---');

  // Bytes raw en hex
  const [rawHex,    setRawHex]    = useState('1B 40 1B 61 01 1B 21 30 53 41 4E 44 42 4F 58 0A 1B 21 00 0A 1D 56 00');

  // Estado de operación
  const [busy,      setBusy]      = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState<string | null>(null);

  // Log de operaciones
  const [log,       setLog]       = useState<Array<{ ts: string; msg: string; ok: boolean }>>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // ── Lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const avail = await qzIsAvailable();
      setQzAvail(avail);
      if (avail && !qzIsConnected()) {
        try { await qzConnect(); setQzReady(true); } catch { setQzReady(false); }
      } else if (qzIsConnected()) {
        setQzReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log.length]);

  // ── Helpers UI ───────────────────────────────────────────────────────────
  const flash = (ok: boolean, msg: string) => {
    setError(ok ? null : msg);
    setSuccess(ok ? msg : null);
    setLog(l => [...l, { ts: new Date().toLocaleTimeString('es-CR'), msg, ok }].slice(-50));
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  };

  // ── Acciones ─────────────────────────────────────────────────────────────
  const handleConnectQZ = async () => {
    setBusy('qz-connect');
    try {
      await qzConnect();
      setQzReady(true);
      setQzAvail(true);
      flash(true, 'QZ Tray conectado');
    } catch (e: any) {
      flash(false, `No se pudo conectar a QZ Tray: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const handleScanPrinters = async () => {
    setScanning(true);
    try {
      if (!qzReady) await handleConnectQZ();
      const list = await qzGetPrinters();
      setPrinters(list);
      if (list.length > 0 && !usbName) setUsbName(list[0]);
      flash(true, `${list.length} impresora${list.length === 1 ? '' : 's'} detectada${list.length === 1 ? '' : 's'}`);
    } catch (e: any) {
      flash(false, `Error al escanear: ${e?.message ?? e}`);
    } finally {
      setScanning(false);
    }
  };

  const sendBytes = async (bytes: Uint8Array, label: string) => {
    if (bytes.length === 0) { flash(false, 'No hay bytes para enviar'); return; }
    setBusy(label);
    try {
      if (target === 'usb') {
        if (!usbName) throw new Error('Seleccioná una impresora USB');
        await qzPrintUSB(usbName, bytes);
      } else {
        if (!netIp) throw new Error('IP de red requerida');
        const p = parseInt(netPort, 10);
        if (!p || p <= 0 || p > 65535) throw new Error('Puerto inválido');
        await qzPrintNetwork(netIp, p, bytes);
      }
      flash(true, `${label} → enviado (${bytes.length} bytes)`);
    } catch (e: any) {
      flash(false, `${label}: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSendText = () => {
    const def = LANGUAGE_BY_ID[lang];
    if (!def) { flash(false, `Lenguaje desconocido: ${lang}`); return; }
    sendBytes(def.wrap(text), `Texto plano (${def.label})`);
  };

  const handleSendRawHex = () => {
    try {
      const bytes = parseHexInput(rawHex);
      sendBytes(bytes, 'Bytes raw');
    } catch (e: any) {
      flash(false, e?.message ?? 'Hex inválido');
    }
  };

  const handleSendCmd = (cmd: RawCommand) => {
    sendBytes(new Uint8Array(cmd.bytes), cmd.label);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Cabecera */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
          <Sparkles size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black text-gray-900">Sandbox de Impresoras y Cajón</h2>
          <p className="text-xs text-gray-500">
            Probá comandos, lenguajes y secuencias en tiempo real sin afectar tu configuración productiva.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm">
          <CheckCircle2 size={16} /> <span>{success}</span>
        </div>
      )}

      {/* ── Conexión QZ + selección de destino ────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-black text-gray-700 uppercase tracking-wide flex items-center gap-2">
          {qzReady ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-gray-400" />}
          Conexión QZ Tray
        </h3>

        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
            qzReady ? 'bg-emerald-100 text-emerald-700' : qzAvail === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${qzReady ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            {qzReady ? 'Conectado' : qzAvail === false ? 'No instalado' : 'Desconectado'}
          </span>
          {!qzReady && (
            <button onClick={handleConnectQZ} disabled={busy === 'qz-connect'}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition">
              Conectar
            </button>
          )}
          <button onClick={handleScanPrinters} disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs font-bold rounded-lg transition">
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
            Escanear impresoras
          </button>
        </div>

        {/* Selección de destino */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
            target === 'usb' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
            <input type="radio" checked={target === 'usb'} onChange={() => setTarget('usb')} className="mt-1" />
            <div className="flex-1">
              <p className="font-bold text-sm text-gray-900">USB (vía QZ Tray)</p>
              <select value={usbName} onChange={e => setUsbName(e.target.value)}
                className="mt-2 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                <option value="">— seleccioná —</option>
                {printers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {printers.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1">Tocá "Escanear impresoras" para listarlas</p>
              )}
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
            target === 'network' ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}>
            <input type="radio" checked={target === 'network'} onChange={() => setTarget('network')} className="mt-1" />
            <div className="flex-1">
              <p className="font-bold text-sm text-gray-900">Red (TCP)</p>
              <div className="mt-2 flex gap-2">
                <input value={netIp} onChange={e => setNetIp(e.target.value)} placeholder="192.168.1.100"
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono" />
                <input value={netPort} onChange={e => setNetPort(e.target.value)} placeholder="9100"
                  className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono" />
              </div>
            </div>
          </label>
        </div>
      </section>

      {/* ── Cajón de dinero ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <Banknote size={14} className="text-amber-600" /> Cajón de dinero
        </h3>
        <p className="text-xs text-gray-500">
          Probá secuencias hasta que tu cajón abra. La 1ra funciona en la mayoría; las otras son fallbacks.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DRAWER_KICKS.map(k => (
            <button key={k.id} onClick={() => handleSendCmd(k)} disabled={!!busy}
              className="text-left p-3 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition disabled:opacity-40">
              <p className="font-bold text-sm text-gray-800">{k.label}</p>
              {k.notes && <p className="text-[10px] text-gray-500 mt-0.5">{k.notes}</p>}
              <p className="text-[10px] font-mono text-gray-400 mt-1">{hexPreview(new Uint8Array(k.bytes))}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Texto plano con selector de lenguaje ───────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <Type size={14} className="text-blue-600" /> Texto plano · selector de lenguaje
        </h3>
        <p className="text-xs text-gray-500">
          Cada lenguaje envuelve el texto en su protocolo nativo (init, formato, cut/feed).
          Si tu impresora muestra basura con uno, probá el siguiente — así identificás qué habla.
        </p>

        {/* Selector agrupado por familia */}
        <div className="space-y-3">
          {(['thermal', 'matrix', 'label', 'portable', 'raw'] as PrinterFamily[]).map(family => {
            const items = PRINTER_LANGUAGES.filter(l => l.family === family);
            if (items.length === 0) return null;
            const familyLabel = {
              thermal:  'Térmicos de recibo',
              matrix:   'Matriciales / impacto',
              label:    'Etiquetas',
              portable: 'Portátiles / móviles',
              raw:      'Texto sin códigos',
            }[family];
            const familyColor = {
              thermal:  'text-blue-700 bg-blue-50',
              matrix:   'text-amber-700 bg-amber-50',
              label:    'text-violet-700 bg-violet-50',
              portable: 'text-rose-700 bg-rose-50',
              raw:      'text-gray-700 bg-gray-50',
            }[family];
            return (
              <div key={family}>
                <p className={`inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded mb-1.5 ${familyColor}`}>
                  {familyLabel}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {items.map(l => {
                    const active = lang === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => setLang(l.id)}
                        title={l.description}
                        className={`text-left p-2 rounded-lg border text-xs transition ${
                          active
                            ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <p className="font-bold leading-tight">{l.label}</p>
                        <p className={`text-[10px] mt-0.5 truncate ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                          {l.vendors}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detalle del lenguaje seleccionado */}
        {LANGUAGE_BY_ID[lang] && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs">
            <p className="font-bold text-blue-900">{LANGUAGE_BY_ID[lang].label}</p>
            <p className="text-blue-700/80 mt-0.5">{LANGUAGE_BY_ID[lang].description}</p>
            <p className="text-blue-600/60 mt-1">
              <span className="font-bold">Bytes generados (preview):</span>{' '}
              <code className="font-mono">
                {hexPreview(LANGUAGE_BY_ID[lang].wrap(text), 24)}
              </code>{' '}
              <span className="text-blue-500/60">({LANGUAGE_BY_ID[lang].wrap(text).length} bytes total)</span>
            </p>
          </div>
        )}

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          placeholder="Escribí lo que quieras imprimir…"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button onClick={handleSendText} disabled={!!busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition">
          <Send size={14} /> {busy?.startsWith('Texto') ? 'Enviando…' : 'Imprimir texto'}
        </button>
      </section>

      {/* ── Comandos ESC/POS individuales ──────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <Bookmark size={14} className="text-emerald-600" /> Comandos ESC/POS individuales
        </h3>
        <p className="text-xs text-gray-500">
          Útil para ver qué soporta tu impresora. Cada botón envía solo esa secuencia.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {ESCPOS.map(c => (
            <button key={c.id} onClick={() => handleSendCmd(c)} disabled={!!busy}
              className="text-left p-2 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition disabled:opacity-40">
              <p className="font-bold text-xs text-gray-800">{c.label}</p>
              <p className="text-[10px] font-mono text-gray-400 mt-0.5">{hexPreview(new Uint8Array(c.bytes))}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── Bytes raw en hex ───────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <Code size={14} className="text-violet-600" /> Bytes raw (hex)
        </h3>
        <p className="text-xs text-gray-500">
          Pegá secuencias en hexadecimal. Acepta <code className="bg-gray-100 px-1 rounded">1B 40</code>,
          <code className="bg-gray-100 px-1 rounded ml-1">0x1B 0x40</code>,
          <code className="bg-gray-100 px-1 rounded ml-1">1B,40</code> o sin separadores <code className="bg-gray-100 px-1 rounded">1B40</code>.
        </p>
        <textarea value={rawHex} onChange={e => setRawHex(e.target.value)} rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleSendRawHex} disabled={!!busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition">
            <Send size={14} /> Enviar bytes
          </button>
          <button onClick={() => setRawHex('')}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-bold rounded-xl transition">
            <Eraser size={14} /> Limpiar
          </button>
          <span className="text-xs text-gray-400 self-center">
            {(() => { try { return `${parseHexInput(rawHex).length} bytes`; } catch { return 'hex inválido'; } })()}
          </span>
        </div>
      </section>

      {/* ── Log de operaciones ─────────────────────────────────────────── */}
      <section className="bg-slate-900 rounded-2xl shadow-sm p-5">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2"><Printer size={13} /> Log de operaciones</span>
          {log.length > 0 && (
            <button onClick={() => setLog([])} className="text-slate-500 hover:text-slate-300 text-[10px] normal-case font-bold">
              Limpiar
            </button>
          )}
        </h3>
        <div ref={logRef} className="h-40 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-0.5">
          {log.length === 0 ? (
            <p className="text-slate-500 italic">Las acciones aparecerán acá…</p>
          ) : (
            log.map((l, i) => (
              <div key={i} className={`flex gap-2 ${l.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                <span className="text-slate-500">{l.ts}</span>
                <span>{l.ok ? '✓' : '✗'}</span>
                <span className="flex-1 break-all">{l.msg}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default PrinterSandbox;
