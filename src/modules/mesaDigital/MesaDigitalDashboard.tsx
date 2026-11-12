'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  QrCode, Bell, Lightbulb, Settings as SettingsIcon, Hand, Receipt, Check,
  Volume2, VolumeX, RefreshCw, Printer, Trash2, Loader2, ExternalLink, Copy,
  Nfc, Pencil, X, AlertTriangle, CheckCircle2, Smartphone, LayoutGrid,
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { useTenantId } from '@/hooks/useTenant';
import {
  mesaAdmin, enlaceMesa,
  type Llamada, type MesaQr, type MesaConfig, type Sugerencia, type ResumenMesas, type TipoLlamada,
} from '@/services/mesaDigital/mesaDigitalService';
import {
  sonar, sonidoListo, desbloquear, leerVolumen, guardarVolumen, leerRepetir, guardarRepetir,
} from './sonido';
import { soporteNfc, grabarEtiqueta, motivoNfc, type SoporteNfc } from './nfc';

/**
 * MESA DIGITAL — el panel del negocio.
 *
 * Cuatro pestañas, en el orden en que se usan: primero LLAMADAS, que es la que
 * queda abierta todo el día en la tablet del salón; después las mesas con sus
 * QR, las sugerencias y los ajustes.
 */

const ETIQUETA: Record<TipoLlamada, { emoji: string; texto: string; color: string }> = {
  ordenar: { emoji: '🙋', texto: 'Listo para ordenar', color: 'border-emerald-300 bg-emerald-50' },
  mesero:  { emoji: '🛎️', texto: 'Llama al mesero',    color: 'border-blue-300 bg-blue-50' },
  cuenta:  { emoji: '🧾', texto: 'Pide la cuenta',      color: 'border-amber-300 bg-amber-50' },
};
const PAGO: Record<string, string> = {
  efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', sinpe: '📲 SINPE Móvil',
};

/** Cada cuánto vuelve a sonar mientras una mesa sigue esperando. */
const REPETIR_CADA_MS = 20_000;

const haceCuanto = (iso: string): string => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  return new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
};

type Pestana = 'llamadas' | 'mesas' | 'sugerencias' | 'ajustes';

export const MesaDigitalDashboard: React.FC = () => {
  const [pestana, setPestana] = useState<Pestana>('llamadas');
  const [pendientes, setPendientes] = useState(0);

  const TABS: Array<[Pestana, string, React.ElementType]> = [
    ['llamadas', 'Llamadas', Bell],
    ['mesas', 'Mesas y QR', QrCode],
    ['sugerencias', 'Sugerencias', Lightbulb],
    ['ajustes', 'Ajustes', SettingsIcon],
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white">
              <QrCode size={20} />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">ColónTab</h1>
              <p className="text-xs text-gray-400">
                Mesa digital: el cliente escanea el QR de su mesa y avisa sin levantar la mano
              </p>
            </div>
          </div>
          {/* Se parten en dos filas en teléfono en vez de deslizarse: una
              pestaña que hay que arrastrar para descubrir no se descubre. */}
          <div className="flex flex-wrap gap-2 mt-4">
            {TABS.map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setPestana(id)}
                className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-bold whitespace-nowrap border-2 transition ${
                  pestana === id ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                <Icon size={15} /> {label}
                {id === 'llamadas' && pendientes > 0 && (
                  <span className="ml-1 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black">
                    {pendientes}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* El panel de llamadas se queda MONTADO aunque se cambie de pestaña:
            es el que suena, y desmontarlo dejaría al salón sin aviso mientras
            alguien revisa los ajustes. */}
        <div className={pestana === 'llamadas' ? '' : 'hidden'}>
          <PanelLlamadas onPendientes={setPendientes} />
        </div>
        {pestana === 'mesas' && <PanelMesas />}
        {pestana === 'sugerencias' && <PanelSugerencias />}
        {pestana === 'ajustes' && <PanelAjustes />}
      </div>
    </div>
  );
};

/* ══════════════════════ LLAMADAS EN VIVO ══════════════════════ */

const PanelLlamadas: React.FC<{ onPendientes: (n: number) => void }> = ({ onPendientes }) => {
  const { tenantId } = useTenantId();
  const [lista, setLista] = useState<Llamada[] | null>(null);
  const [error, setError] = useState('');
  const [volumen, setVolumen] = useState(leerVolumen);
  const [repetir, setRepetir] = useState(leerRepetir);
  const [listo, setListo] = useState(sonidoListo);
  const [, refrescar] = useState(0);
  const conocidas = useRef<Set<string> | null>(null);
  const ajustes = useRef({ volumen, repetir });

  useEffect(() => {
    ajustes.current = { volumen, repetir };
    guardarVolumen(volumen);
    guardarRepetir(repetir);
  }, [volumen, repetir]);

  // El navegador no deja sonar nada hasta el primer toque del usuario.
  useEffect(() => {
    if (listo) return;
    const revisar = () => setTimeout(() => setListo(sonidoListo()), 50);
    window.addEventListener('pointerdown', revisar);
    return () => window.removeEventListener('pointerdown', revisar);
  }, [listo]);

  const cargar = useCallback(async () => {
    try {
      const l = await mesaAdmin.llamadas('pendiente');
      const antes = conocidas.current;
      /* La primera carga NO suena: si no, al abrir el panel en la mañana suena
         por avisos de ayer que nadie borró. Solo suenan los nuevos. */
      const nuevas = antes ? l.filter(r => !antes.has(r.id)) : [];
      if (nuevas.length) sonar(nuevas[nuevas.length - 1].tipo, ajustes.current.volumen);
      conocidas.current = new Set(l.map(r => r.id));
      setLista(l);
      onPendientes(l.length);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las llamadas');
    }
  }, [onPendientes]);

  useEffect(() => { void cargar(); }, [cargar]);

  /* Tiempo real + un repaso cada 15 s por si el canal se cae: en una tablet con
     wifi de restaurante se cae, y un aviso que no llega es el módulo entero
     sin servir. */
  useEffect(() => {
    if (!tenantId) return;
    const canal = supabase
      .channel(`mesa_llamadas_${tenantId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'mesa_llamadas', filter: `tenant_id=eq.${tenantId}` },
        () => void cargar())
      .subscribe();
    const reloj = setInterval(() => void cargar(), 15_000);
    return () => {
      clearInterval(reloj);
      try { supabase.removeChannel(canal); } catch { /* ya cerrado */ }
    };
  }, [tenantId, cargar]);

  // Repite el aviso mientras haya mesas esperando y refresca el «hace X min».
  const pendientes = lista ?? [];
  const masVieja = pendientes[0]?.tipo;
  useEffect(() => {
    const t = setInterval(() => {
      refrescar(n => n + 1);
      if (masVieja && ajustes.current.repetir) sonar(masVieja, ajustes.current.volumen);
    }, REPETIR_CADA_MS);
    return () => clearInterval(t);
  }, [masVieja]);

  // El número en la pestaña del navegador: la tablet suele estar en otra app.
  useEffect(() => {
    const original = document.title;
    if (pendientes.length) document.title = `(${pendientes.length}) Mesas esperando`;
    return () => { document.title = original; };
  }, [pendientes.length]);

  const atender = async (id: string) => {
    setLista(l => l?.filter(r => r.id !== id) ?? null);
    conocidas.current?.delete(id);
    onPendientes(Math.max(0, pendientes.length - 1));
    try { await mesaAdmin.atender(id); } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar como atendida');
      void cargar();
    }
  };

  const cuantas = (t: TipoLlamada) => pendientes.filter(r => r.tipo === t).length;

  return (
    <div className="space-y-4">
      {!listo && (
        <button type="button"
          onClick={() => void desbloquear().then(ok => { setListo(ok); if (ok) sonar('ordenar', volumen); })}
          className="w-full bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl px-4 py-3 text-sm font-black">
          🔇 Tocá acá para activar el sonido de los avisos
        </button>
      )}

      <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm font-black text-gray-800">🔔 Sonido de los avisos</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setVolumen(volumen === 0 ? 0.7 : 0)}
              aria-label={volumen === 0 ? 'Activar sonido' : 'Silenciar'}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600">
              {volumen === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input type="range" min={0} max={100} step={5} value={Math.round(volumen * 100)}
              onChange={e => setVolumen(Number(e.target.value) / 100)}
              aria-label="Volumen" className="w-32 accent-teal-600" />
            <span className="text-xs font-bold text-gray-500 w-10">{Math.round(volumen * 100)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-bold">Probar:</span>
          {(['ordenar', 'mesero', 'cuenta'] as TipoLlamada[]).map(t => (
            <button key={t} type="button" onClick={() => sonar(t, volumen)}
              className="h-9 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
              {ETIQUETA[t].emoji} {ETIQUETA[t].texto}
            </button>
          ))}
          <label className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 ml-auto">
            <input type="checkbox" checked={repetir} onChange={e => setRepetir(e.target.checked)}
              className="w-4 h-4 accent-teal-600" />
            Repetir cada 20 s mientras haya mesas esperando
          </label>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador label="Mesas esperando" valor={pendientes.length} resalta={pendientes.length > 0} />
        <Indicador label="🙋 Listos para ordenar" valor={cuantas('ordenar')} />
        <Indicador label="🛎️ Llaman al mesero" valor={cuantas('mesero')} />
        <Indicador label="🧾 Piden la cuenta" valor={cuantas('cuenta')} />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}

      {!lista && !error && (
        <div className="flex justify-center py-12 text-gray-400"><Loader2 className="animate-spin" /></div>
      )}

      {lista && pendientes.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-4xl mb-2">👌</p>
          <p className="font-black text-gray-800">No hay mesas esperando.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cuando un cliente toque un botón en su mesa, aparece acá con sonido.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pendientes.map(r => (
          <article key={r.id} className={`rounded-2xl border-2 p-4 ${ETIQUETA[r.tipo].color}`}>
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>{ETIQUETA[r.tipo].emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-gray-900 leading-tight">Mesa {r.numero}</p>
                <p className="text-sm font-bold text-gray-700">{ETIQUETA[r.tipo].texto}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {haceCuanto(r.created_at)}
                  {r.personas ? ` · ${r.personas} ${r.personas === 1 ? 'persona' : 'personas'}` : ''}
                  {r.medio_pago ? ` · ${PAGO[r.medio_pago]}` : ''}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => void atender(r.id)}
              className="w-full mt-3 h-11 rounded-xl bg-gray-900 text-white text-sm font-black inline-flex items-center justify-center gap-1.5">
              <Check size={16} /> Atendida
            </button>
          </article>
        ))}
      </div>
    </div>
  );
};

const Indicador: React.FC<{ label: string; valor: number; resalta?: boolean }> = ({ label, valor, resalta }) => (
  <div className={`bg-white rounded-2xl border p-4 ${resalta ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-100'}`}>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{label}</p>
    <p className={`text-2xl font-black leading-tight ${resalta ? 'text-red-600' : 'text-gray-900'}`}>{valor}</p>
  </div>
);

/* ══════════════════════ MESAS Y QR ══════════════════════ */

const PanelMesas: React.FC = () => {
  const [mesas, setMesas] = useState<MesaQr[] | null>(null);
  const [cantidad, setCantidad] = useState(0);
  const [resumen, setResumen] = useState<ResumenMesas | null>(null);
  const [dias, setDias] = useState(7);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  /** Mesas a grabar en etiquetas NFC (vacío = ventana cerrada). */
  const [grabando, setGrabando] = useState<MesaQr[] | null>(null);
  const nfc = useMemo(soporteNfc, []);

  const cargar = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([mesaAdmin.mesas(), mesaAdmin.resumen(dias)]);
      setMesas(m); setCantidad(m.length); setResumen(r);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar las mesas'); }
  }, [dias]);
  useEffect(() => { void cargar(); }, [cargar]);

  const aplicarCantidad = async (confirmar = false) => {
    setGuardando(true); setError('');
    try {
      const m = await mesaAdmin.ponerCantidad(cantidad, confirmar);
      setMesas(m); setCantidad(m.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar';
      // El servidor avisa (409) antes de borrar códigos de mesas que ya tienen
      // QR impresos: acá se le pregunta al usuario y se reintenta confirmando.
      if (/borrar|dejar/i.test(msg) && !confirmar && window.confirm(`${msg}\n\n¿Seguir igual?`)) {
        setGuardando(false);
        return aplicarCantidad(true);
      }
      setError(msg);
    } finally { setGuardando(false); }
  };

  /**
   * TRAE LAS MESAS DEL MAPA DEL SALÓN.
   *
   * Son dos listas que tienen que calzar: el cliente avisa desde «la mesa 4» y
   * el mesero lo ve sobre la mesa del mapa que se llama «Mesa 4». Si en el mapa
   * hay ocho mesas y acá hay tres, los avisos de las otras cinco no se pintan
   * en ninguna parte; si los nombres no coinciden, el mesero no sabe cuál es.
   *
   * Llenarlo a mano es donde se equivoca cualquiera, así que se copia del mapa:
   * se crean tantas mesas como el número más alto que haya, y a cada una se le
   * pone el nombre que tiene en el salón.
   */
  const traerDelMapa = async () => {
    setGuardando(true); setError('');
    try {
      const { apiFetch } = await import('@/lib/api');
      const cfg = await apiFetch<{ items?: any[] }>('/settings/tables-map');
      const cobrables = (cfg?.items ?? []).filter(
        (i: any) => ['table', 'freeTable', 'seat'].includes(i?.kind) && String(i?.label ?? '').trim());

      const conNumero: Array<{ n: number; label: string }> = [];
      const sinNumero: string[] = [];
      for (const i of cobrables) {
        const m = String(i.label).match(/(\d+)/);
        if (m) conNumero.push({ n: Number(m[1]), label: String(i.label).trim() });
        else sinNumero.push(String(i.label).trim());
      }
      if (conNumero.length === 0) {
        setError('Ninguna mesa del mapa tiene un número en su nombre, así que no hay con qué enlazarlas. '
          + 'Poneles «Mesa 1», «Mesa 2»… en el Mapa de Mesas.');
        return;
      }

      const mayor = Math.max(...conNumero.map(x => x.n));
      const aviso = [
        `En el mapa del salón hay ${cobrables.length} sitio(s).`,
        `Se van a dejar ${mayor} mesa(s) con QR, numeradas del 1 al ${mayor},`,
        'y cada una tomará el nombre que tiene en el mapa.',
        sinNumero.length ? `\nQuedan afuera (no tienen número en el nombre): ${sinNumero.join(', ')}.` : '',
        '\n¿Seguir?',
      ].filter(Boolean).join(' ');
      if (!window.confirm(aviso)) return;

      const nuevas = await mesaAdmin.ponerCantidad(mayor, true);
      // Los nombres, uno por uno: son pocos y así se ve cuál falló.
      for (const { n, label } of conNumero) {
        if (n < 1 || n > mayor) continue;
        const actual = nuevas.find(x => x.numero === n);
        if (actual?.nombre === label) continue;
        try { await mesaAdmin.renombrar(n, label); } catch { /* el nombre es cosmético */ }
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el mapa del salón');
    } finally { setGuardando(false); }
  };

  const regenerar = async (numero?: number) => {
    const que = numero == null ? 'TODAS las mesas' : `la mesa ${numero}`;
    if (!window.confirm(`¿Cambiar el código de ${que}?\n\nLos QR impresos y las etiquetas NFC de ${numero == null ? 'todas las mesas' : 'esa mesa'} dejan de funcionar y hay que imprimirlos de nuevo.`)) return;
    try { setMesas(await mesaAdmin.regenerar(numero)); } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el código');
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">¿Cuántas mesas tiene el local?</label>
            <input type="number" min={0} max={500} value={cantidad}
              onChange={e => setCantidad(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
              className="w-28 h-10 px-3 border-2 border-gray-200 rounded-xl text-sm" />
          </div>
          <button type="button" onClick={() => void aplicarCantidad()} disabled={guardando}
            className="h-10 px-4 rounded-xl bg-teal-600 text-white text-sm font-black disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={() => void traerDelMapa()} disabled={guardando}
            title="Crea las mesas con los mismos números y nombres que el mapa del salón"
            className="h-10 px-4 rounded-xl border-2 border-teal-200 bg-teal-50 text-sm font-bold text-teal-700 inline-flex items-center gap-1.5 disabled:opacity-40">
            <LayoutGrid size={14} /> Traer del mapa del salón
          </button>
          <button type="button" onClick={() => void regenerar()}
            className="h-10 px-4 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 inline-flex items-center gap-1.5">
            <RefreshCw size={14} /> Cambiar todos los códigos
          </button>
          <button type="button" onClick={() => setGrabando(mesas ?? [])}
            disabled={!mesas?.length}
            title={nfc === 'si'
              ? 'Grabar las calcomanías NFC de todas las mesas, una tras otra'
              : 'Acá se ve el enlace de cada etiqueta para grabarla con una app'}
            className="h-10 px-4 rounded-xl border-2 border-sky-200 bg-sky-50 text-sm font-bold text-sky-700 inline-flex items-center gap-1.5 disabled:opacity-40">
            <Nfc size={14} /> Grabar etiquetas NFC
          </button>
          <button type="button" onClick={() => window.print()}
            className="h-10 px-4 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 inline-flex items-center gap-1.5 ml-auto">
            <Printer size={14} /> Imprimir los QR
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </section>

      {resumen && (
        <section className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-sm font-black text-gray-800">Uso de los QR</h2>
            <div className="flex gap-1">
              {[1, 7, 30].map(d => (
                <button key={d} type="button" onClick={() => setDias(d)}
                  className={`h-9 px-3 rounded-lg text-xs font-bold border ${
                    dias === d ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
                  {d === 1 ? 'Hoy' : `${d} días`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Indicador label="Mesas escaneadas" valor={resumen.visitas} />
            <Indicador label="Avisos recibidos" valor={resumen.llamadas} />
            <Indicador label="Sin atender" valor={resumen.pendientes} resalta={resumen.pendientes > 0} />
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">
                Tardan en atender
              </p>
              <p className="text-2xl font-black text-gray-900 leading-tight">
                {resumen.minutos_promedio != null ? `${resumen.minutos_promedio} min` : '—'}
              </p>
            </div>
          </div>
          {/* De dónde entraron: es lo que dice si vale la pena seguir pagando
              calcomanías NFC o si todo el mundo usa el QR. */}
          <div className="flex flex-wrap gap-2 mt-3">
            {([['qr', 'QR', QrCode], ['nfc', 'NFC', Nfc], ['enlace', 'Enlace', ExternalLink]] as const).map(([k, label, Icon]) => (
              <span key={k} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-gray-600">
                <Icon size={13} /> {label}: {resumen.por_origen?.[k] ?? 0}
              </span>
            ))}
          </div>
        </section>
      )}

      {grabando && (
        <GrabarNfcModal mesas={grabando} soporte={nfc} onClose={() => setGrabando(null)} />
      )}

      {!mesas && <div className="flex justify-center py-12 text-gray-400"><Loader2 className="animate-spin" /></div>}

      {mesas && mesas.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-4xl mb-2">🪑</p>
          <p className="font-black text-gray-800">Todavía no hay mesas.</p>
          <p className="text-xs text-gray-400 mt-1">Poné cuántas mesas tiene el local y se crean con su código.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(mesas ?? []).map(m => (
          <TarjetaMesa key={m.numero} mesa={m} usos={resumen?.por_mesa?.[String(m.numero)]}
            soporteNfc={nfc}
            onGrabarNfc={() => setGrabando([m])}
            onRenombrada={() => void cargar()}
            onRegenerar={() => void regenerar(m.numero)} />
        ))}
      </div>
    </div>
  );
};

/**
 * La tarjeta de una mesa con su QR.
 *
 * El QR se dibuja en el navegador (sin pedirle una imagen a nadie) para que se
 * pueda imprimir estando sin internet, que es cuando el dueño arma las mesas.
 */
const TarjetaMesa: React.FC<{
  mesa: MesaQr; usos?: { visitas: number; llamadas: number };
  soporteNfc: SoporteNfc;
  onGrabarNfc: () => void;
  onRenombrada: () => void;
  onRegenerar: () => void;
}> = ({ mesa, usos, soporteNfc: sop, onGrabarNfc, onRenombrada, onRegenerar }) => {
  const [img, setImg] = useState('');
  const [copiado, setCopiado] = useState<'' | 'qr' | 'nfc'>('');
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(mesa.nombre ?? '');
  const [guardando, setGuardando] = useState(false);
  const url = useMemo(() => enlaceMesa(mesa.token), [mesa.token]);
  /* El mismo destino, marcado como NFC: así el resumen puede decir cuánta
     gente entró por la calcomanía y cuánta por el QR. */
  const urlNfc = useMemo(() => enlaceMesa(mesa.token, 'nfc'), [mesa.token]);

  const copiar = (texto: string, cual: 'qr' | 'nfc') => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(cual); setTimeout(() => setCopiado(''), 1500);
    });
  };

  const renombrar = async () => {
    setGuardando(true);
    try { await mesaAdmin.renombrar(mesa.numero, nombre.trim()); setEditando(false); onRenombrada(); }
    catch { /* el nombre es cosmético: si falla, se queda como estaba */ }
    finally { setGuardando(false); }
  };

  useEffect(() => {
    let vivo = true;
    QRCode.toDataURL(url, { width: 420, margin: 1, errorCorrectionLevel: 'M' })
      .then(d => { if (vivo) setImg(d); })
      .catch(() => { if (vivo) setImg(''); });
    return () => { vivo = false; };
  }, [url]);

  return (
    <article className="bg-white rounded-2xl border border-gray-100 p-4 text-center break-inside-avoid">
      {/* El nombre se puede cambiar: «Terraza 2» o «Barra» dice más que
          «Mesa 7», y es el que tiene que coincidir con el mapa del salón. */}
      {editando ? (
        <div className="flex gap-1.5 no-print">
          <input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
            placeholder={`Mesa ${mesa.numero}`}
            onKeyDown={e => { if (e.key === 'Enter') void renombrar(); if (e.key === 'Escape') setEditando(false); }}
            className="flex-1 min-w-0 h-9 px-2 border-2 border-teal-300 rounded-lg text-sm font-bold" />
          <button type="button" onClick={() => void renombrar()} disabled={guardando}
            aria-label="Guardar el nombre"
            className="w-9 h-9 rounded-lg bg-teal-600 text-white inline-flex items-center justify-center disabled:opacity-50">
            <Check size={14} />
          </button>
          <button type="button" onClick={() => { setNombre(mesa.nombre ?? ''); setEditando(false); }}
            aria-label="Cancelar"
            className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 inline-flex items-center justify-center">
            <X size={14} />
          </button>
        </div>
      ) : (
        <p className="text-base font-black text-gray-900 inline-flex items-center justify-center gap-1.5">
          {mesa.nombre || `Mesa ${mesa.numero}`}
          <button type="button" onClick={() => setEditando(true)} aria-label="Cambiar el nombre"
            className="text-gray-300 hover:text-gray-600 no-print"><Pencil size={12} /></button>
        </p>
      )}
      {img
        ? <img src={img} alt={`QR de la mesa ${mesa.numero}`} className="w-40 h-40 mx-auto my-2" />
        : <div className="w-40 h-40 mx-auto my-2 bg-gray-50 rounded-xl animate-pulse" />}
      <p className="text-[10px] text-gray-400 break-all">{url}</p>
      {usos && (
        <p className="text-[11px] text-gray-500 mt-1">
          {usos.visitas} escaneo(s) · {usos.llamadas} aviso(s)
        </p>
      )}
      <div className="flex gap-2 mt-3 no-print">
        <a href={url} target="_blank" rel="noreferrer"
          className="flex-1 h-10 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 inline-flex items-center justify-center gap-1">
          <ExternalLink size={13} /> Probar
        </a>
        <button type="button" aria-label="Copiar el enlace"
          onClick={() => copiar(url, 'qr')}
          className="w-10 h-10 rounded-xl border border-gray-200 text-gray-500 inline-flex items-center justify-center">
          {copiado === 'qr' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </button>
        <button type="button" onClick={onRegenerar} aria-label="Cambiar el código"
          className="w-10 h-10 rounded-xl border border-gray-200 text-gray-500 inline-flex items-center justify-center">
          <RefreshCw size={14} />
        </button>
      </div>
      {/* NFC: grabar la calcomanía de ESTA mesa. Donde el navegador no puede
          escribir (iPhone, o el panel abierto en la computadora), queda el
          enlace para copiarlo y grabarlo con una app. */}
      <div className="flex gap-2 mt-2 no-print">
        <button type="button" onClick={sop === 'si' ? onGrabarNfc : () => copiar(urlNfc, 'nfc')}
          className="flex-1 h-10 rounded-xl border border-sky-200 bg-sky-50 text-xs font-bold text-sky-700 inline-flex items-center justify-center gap-1.5">
          <Nfc size={13} />
          {sop === 'si' ? 'Grabar etiqueta NFC' : copiado === 'nfc' ? '¡Enlace copiado!' : 'Copiar enlace NFC'}
        </button>
      </div>
    </article>
  );
};

/* ══════════════════════ GRABAR ETIQUETAS NFC ══════════════════════ */

type EstadoNfc = 'pendiente' | 'grabando' | 'lista' | 'error';

/**
 * Graba las calcomanías NFC, una tras otra, sin tocar la pantalla entre mesa y
 * mesa.
 *
 * Así es como se hace de verdad: el encargado agarra el rollo de calcomanías y
 * va pasando por las mesas con el teléfono. Pedirle que vuelva a la pantalla y
 * toque «siguiente» veinte veces es lo que hace que termine usando otra app.
 */
const GrabarNfcModal: React.FC<{ mesas: MesaQr[]; soporte: SoporteNfc; onClose: () => void }> = ({
  mesas, soporte, onClose,
}) => {
  const [estado, setEstado] = useState<Record<number, EstadoNfc>>({});
  const [msg, setMsg] = useState<Record<number, string>>({});
  const [bloquear, setBloquear] = useState(false);
  const [actual, setActual] = useState<number | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const abortar = useRef<AbortController | null>(null);

  useEffect(() => () => abortar.current?.abort(), []);

  const pendientes = mesas.filter(m => (estado[m.numero] ?? 'pendiente') !== 'lista');
  const listas = mesas.length - pendientes.length;

  const correr = async () => {
    setCorriendo(true);
    for (const m of mesas) {
      if ((estado[m.numero] ?? 'pendiente') === 'lista') continue;
      const ctrl = new AbortController();
      abortar.current = ctrl;
      setActual(m.numero);
      setEstado(e => ({ ...e, [m.numero]: 'grabando' }));
      try {
        await grabarEtiqueta(enlaceMesa(m.token, 'nfc'), { bloquear, signal: ctrl.signal });
        setEstado(e => ({ ...e, [m.numero]: 'lista' }));
        setMsg(x => ({ ...x, [m.numero]: bloquear ? 'Grabada y bloqueada' : 'Grabada' }));
      } catch (e) {
        const texto = e instanceof Error ? e.message : String(e);
        if (/abort/i.test(texto)) { setEstado(x => ({ ...x, [m.numero]: 'pendiente' })); break; }
        // Si se grabó pero no se pudo bloquear, la etiqueta YA sirve: no es un fallo.
        const soloBloqueo = texto.startsWith('GRABADA_SIN_BLOQUEAR');
        setEstado(x => ({ ...x, [m.numero]: soloBloqueo ? 'lista' : 'error' }));
        setMsg(x => ({ ...x, [m.numero]: soloBloqueo
          ? 'Grabada, pero no se pudo bloquear' : motivoNfc(e) }));
        if (!soloBloqueo) break;   // algo pasa: no seguir quemando etiquetas
      }
    }
    setActual(null); setCorriendo(false); abortar.current = null;
  };

  const detener = () => { abortar.current?.abort(); setCorriendo(false); setActual(null); };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => { if (!corriendo) onClose(); }}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2 shrink-0">
          <Nfc size={18} className="text-sky-600" />
          <h2 className="text-base font-black text-gray-900 flex-1">
            Grabar etiquetas NFC {mesas.length > 1 && <span className="text-gray-400 font-bold">· {listas}/{mesas.length}</span>}
          </h2>
          <button type="button" onClick={() => { detener(); onClose(); }}
            className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {soporte !== 'si' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
              <p className="font-black flex items-center gap-1.5">
                <AlertTriangle size={15} />
                {soporte === 'sin-https'
                  ? 'Hay que abrir el panel por https'
                  : 'Este aparato no puede grabar etiquetas'}
              </p>
              <p>
                {soporte === 'sin-https'
                  ? 'El navegador solo deja usar el NFC en páginas seguras. Abrí el panel con la dirección https del sistema.'
                  : 'Escribir NFC desde el navegador solo funciona en Chrome sobre Android. En iPhone se pueden LEER las etiquetas, pero para grabarlas hay que usar una app (por ejemplo NFC Tools).'}
              </p>
              <p className="text-[12px]">
                Mientras tanto: copiá el enlace de cada mesa con el botón «Copiar enlace NFC» y pegalo en la app.
              </p>
            </div>
          ) : (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-900">
              <p className="font-black flex items-center gap-1.5 mb-1"><Smartphone size={15} /> Cómo se hace</p>
              <p>Tocá «Empezar» y apoyá la calcomanía en la parte de atrás del teléfono, cerca de la cámara. Cuando diga «Grabada», pasá a la siguiente mesa: la ventana avanza sola.</p>
            </div>
          )}

          {mesas.map(m => {
            const e = estado[m.numero] ?? 'pendiente';
            return (
              <div key={m.numero}
                className={`rounded-xl border-2 px-3 py-2.5 flex items-center gap-3 ${
                  e === 'lista' ? 'border-emerald-200 bg-emerald-50'
                  : e === 'error' ? 'border-red-200 bg-red-50'
                  : actual === m.numero ? 'border-sky-400 bg-sky-50 animate-pulse'
                  : 'border-gray-100'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-gray-900">{m.nombre || `Mesa ${m.numero}`}</p>
                  <p className="text-[11px] text-gray-500 break-all">
                    {msg[m.numero] ?? (actual === m.numero ? 'Acercá la etiqueta al teléfono…' : enlaceMesa(m.token, 'nfc'))}
                  </p>
                </div>
                {e === 'lista' && <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />}
                {e === 'error' && <AlertTriangle size={18} className="text-red-600 shrink-0" />}
                {e === 'grabando' && <Loader2 size={18} className="text-sky-600 animate-spin shrink-0" />}
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-100 p-4 space-y-3 shrink-0">
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={bloquear} onChange={e => setBloquear(e.target.checked)}
              disabled={corriendo} className="w-4 h-4 mt-0.5 accent-sky-600" />
            <span>
              <b>Bloquear la etiqueta</b> para que nadie la pueda reescribir.
              <span className="block text-[11px] text-amber-700">
                No tiene vuelta atrás: esa calcomanía no se puede volver a grabar nunca.
                Si después cambiás el código de la mesa, hay que tirarla.
              </span>
            </span>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => { detener(); onClose(); }}
              className="flex-1 h-11 rounded-xl border-2 border-gray-200 font-bold text-sm text-gray-600">
              {listas > 0 ? 'Listo' : 'Cerrar'}
            </button>
            {soporte === 'si' && (corriendo ? (
              <button type="button" onClick={detener}
                className="flex-1 h-11 rounded-xl bg-gray-900 text-white font-black text-sm">
                Detener
              </button>
            ) : (
              <button type="button" onClick={() => void correr()} disabled={pendientes.length === 0}
                className="flex-1 h-11 rounded-xl bg-sky-600 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
                {listas > 0 ? `Seguir (${pendientes.length})` : 'Empezar'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════ SUGERENCIAS ══════════════════════ */

const PanelSugerencias: React.FC = () => {
  const [lista, setLista] = useState<Sugerencia[] | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try { setLista(await mesaAdmin.sugerencias()); } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las sugerencias');
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const promedio = useMemo(() => {
    const con = (lista ?? []).filter(s => s.estrellas != null);
    if (!con.length) return null;
    return Math.round((con.reduce((t, s) => t + (s.estrellas ?? 0), 0) / con.length) * 10) / 10;
  }, [lista]);

  const borrar = async (id: string) => {
    setLista(l => l?.filter(s => s.id !== id) ?? null);
    try { await mesaAdmin.borrarSugerencia(id); } catch { void cargar(); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Indicador label="Sugerencias" valor={lista?.length ?? 0} />
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Calificación</p>
          <p className="text-2xl font-black text-gray-900">{promedio != null ? `${promedio} ★` : '—'}</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!lista && <div className="flex justify-center py-12 text-gray-400"><Loader2 className="animate-spin" /></div>}
      {lista && lista.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-4xl mb-2">💡</p>
          <p className="font-black text-gray-800">Sin sugerencias todavía.</p>
        </div>
      )}

      <div className="space-y-2">
        {(lista ?? []).map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800">{s.mensaje}</p>
              <p className="text-[11px] text-gray-400 mt-1">
                {s.estrellas ? '★'.repeat(s.estrellas) + '☆'.repeat(5 - s.estrellas) + ' · ' : ''}
                {s.numero ? `Mesa ${s.numero} · ` : ''}
                {new Date(s.created_at).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <button type="button" onClick={() => void borrar(s.id)} aria-label="Borrar"
              className="shrink-0 w-10 h-10 rounded-xl border border-gray-200 text-gray-400 hover:text-red-600 inline-flex items-center justify-center">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════ AJUSTES ══════════════════════ */

const PanelAjustes: React.FC = () => {
  const [cfg, setCfg] = useState<MesaConfig | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mesaAdmin.config().then(setCfg).catch(e =>
      setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración'));
  }, []);

  const set = <K extends keyof MesaConfig>(k: K, v: MesaConfig[K]) =>
    setCfg(c => (c ? { ...c, [k]: v } : c));

  const guardar = async () => {
    if (!cfg) return;
    setGuardando(true); setError(''); setMsg('');
    try {
      await mesaAdmin.guardarConfig(cfg);
      setMsg('Guardado');
      setTimeout(() => setMsg(''), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  if (!cfg) {
    return <div className="flex justify-center py-12 text-gray-400"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={cfg.activo} onChange={e => set('activo', e.target.checked)}
            className="w-5 h-5 mt-0.5 accent-teal-600" />
          <span>
            <span className="block text-sm font-black text-gray-800">El servicio desde la mesa está activo</span>
            <span className="block text-xs text-gray-500">
              Apagado, los QR siguen abriendo la página pero avisa que no se está atendiendo.
              Sirve para el día que cierran y no quieren avisos.
            </span>
          </span>
        </label>
      </section>

      <Bloque titulo="Qué botones ve el cliente">
        {([
          ['ver_ordenar', 'Estoy listo para ordenar'],
          ['ver_mesero', 'Llamar al mesero'],
          ['ver_cuenta', 'Pedir la cuenta'],
          ['ver_juegos', 'Juegos mientras espera'],
          ['ver_sugerencias', 'Sugerencias'],
        ] as Array<[keyof MesaConfig, string]>).map(([k, label]) => (
          <label key={String(k)} className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <input type="checkbox" checked={Boolean(cfg[k])}
              onChange={e => set(k, e.target.checked as any)} className="w-4 h-4 accent-teal-600" />
            {label}
          </label>
        ))}
      </Bloque>

      <Bloque titulo="Wi-Fi para los clientes">
        <Campo label="Nombre de la red" valor={cfg.wifi_ssid} onChange={v => set('wifi_ssid', v)} />
        <Campo label="Contraseña" valor={cfg.wifi_password} onChange={v => set('wifi_password', v)} />
      </Bloque>

      <Bloque titulo="Pago y contacto">
        <Campo label="WhatsApp (con 506)" valor={cfg.whatsapp} onChange={v => set('whatsapp', v)} placeholder="50688887777" />
        <Campo label="SINPE Móvil" valor={cfg.sinpe_telefono} onChange={v => set('sinpe_telefono', v)} placeholder="88887777" />
        <Campo label="A nombre de" valor={cfg.sinpe_nombre} onChange={v => set('sinpe_nombre', v)} />
      </Bloque>

      <Bloque titulo="Redes y reseñas">
        <Campo label="Instagram (enlace)" valor={cfg.instagram} onChange={v => set('instagram', v)} />
        <Campo label="TikTok (enlace)" valor={cfg.tiktok} onChange={v => set('tiktok', v)} />
        <Campo label="Reseña en Google (enlace)" valor={cfg.google_review} onChange={v => set('google_review', v)} />
      </Bloque>

      <Bloque titulo="Dónde están y a qué hora">
        <Campo label="Dirección" valor={cfg.direccion} onChange={v => set('direccion', v)} />
        <Campo label="Enlace de Maps" valor={cfg.maps_url} onChange={v => set('maps_url', v)} />
        <Campo label="Horario" valor={cfg.horario} onChange={v => set('horario', v)} multilinea />
      </Bloque>

      <Bloque titulo="Mensaje en la pantalla de la mesa">
        <Campo label="Opcional" valor={cfg.mensaje} onChange={v => set('mensaje', v)} multilinea
          placeholder="Ej. Hoy tenemos casado de pollo a ₡3.500" />
      </Bloque>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void guardar()} disabled={guardando}
          className="h-11 px-5 rounded-xl bg-teal-600 text-white font-black text-sm disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar los ajustes'}
        </button>
        {msg && <span className="text-sm font-bold text-emerald-600">{msg}</span>}
        {error && <span className="text-sm font-bold text-red-600">{error}</span>}
      </div>
    </div>
  );
};

const Bloque: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
    <h2 className="text-sm font-black text-gray-800">{titulo}</h2>
    {children}
  </section>
);

const Campo: React.FC<{
  label: string; valor: string; onChange: (v: string) => void;
  placeholder?: string; multilinea?: boolean;
}> = ({ label, valor, onChange, placeholder, multilinea }) => (
  <div>
    <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
    {multilinea ? (
      <textarea value={valor ?? ''} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder}
        className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-teal-400" />
    ) : (
      <input value={valor ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-10 border-2 border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:border-teal-400" />
    )}
  </div>
);

export default MesaDigitalDashboard;
