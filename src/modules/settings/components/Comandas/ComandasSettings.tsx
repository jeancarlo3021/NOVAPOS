'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ChefHat, Printer, Plus, Trash2, Save, CheckCircle2, AlertCircle, Loader2, Layers, Star,
  Network, Bluetooth, Wand2, Smartphone, Play,
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useTenantId } from '@/hooks/useTenant';
import { posPrinterService, webBluetoothAvailable } from '@/services/pos/posPrinterService';
import { qzIsAvailable, qzIsConnected, type PrinterEntry } from '@/services/pos/qzTrayService';
import { isNativeApp, hasNativeBluetooth } from '@/services/pos/nativePlatform';

interface Grupo { id: string; name: string; categories: string[] }
interface Categoria { id: string; name: string }

type Pestana = 'grupos' | 'impresoras';
type Transporte = 'auto' | 'qztray' | 'bluetooth';

const nuevoId = () => `g${Date.now()}${Math.floor(Math.random() * 1000)}`;

/**
 * COMANDAS: qué se imprime en cada estación de cocina.
 *
 * Antes esto se configuraba marcando categoría por categoría dentro de cada
 * impresora, enterrado en la pestaña de Factura. Un restaurante con cuarenta
 * categorías y tres estaciones tenía que repetir el mismo trabajo tres veces, y
 * al crear una categoría nueva había que acordarse de ir a marcarla en la
 * impresora que le toca: si no, ese plato no se imprimía en NINGUNA parte y la
 * cocina nunca se enteraba del pedido.
 *
 * Acá se arma una vez el grupo («Cocina caliente» = Platos fuertes + Sopas) y se
 * le asigna a la impresora. Y se elige a cuál caja sale el tiquete de la venta,
 * que con dos cajas configuradas salía por duplicado.
 */
export const ComandasSettings: React.FC = () => {
  const { settings, updateSettings, loading } = useSettings('receipt');
  const { tenantId } = useTenantId();
  const [tab, setTab] = useState<Pestana>('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [printers, setPrinters] = useState<PrinterEntry[]>([]);
  const [caja, setCaja] = useState('');
  const [via, setVia] = useState<Transporte>('auto');
  /** QZ Tray: ¿está instalado y corriendo en ESTA computadora? */
  const [qz, setQz] = useState<'buscando' | 'si' | 'no'>('buscando');
  const [probando, setProbando] = useState(false);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [sucio, setSucio] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const c: any = settings;
    setGrupos(Array.isArray(c.comandaGroups) ? c.comandaGroups : []);
    setPrinters(Array.isArray(c.printers) ? c.printers : []);
    setCaja(String(c.defaultReceiptPrinterId ?? ''));
    setVia((c.comandaTransport ?? 'auto') as Transporte);
    setSucio(false);
  }, [settings]);

  useEffect(() => {
    if (!tenantId) return;
    void import('@/services/Inventory/categoriesService').then(({ categoriesService }) =>
      categoriesService.getAllCategories(tenantId)
        .then((cs: any[]) => setCats((cs ?? []).map(c => ({ id: String(c.id), name: String(c.name) }))))
        .catch(() => {}));
  }, [tenantId]);

  // ¿Hay QZ Tray en esta máquina? Es la diferencia entre ofrecer el camino de
  // red y mandar al usuario a configurar algo que no va a funcionar.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const hay = qzIsConnected() || await qzIsAvailable();
        if (vivo) setQz(hay ? 'si' : 'no');
      } catch { if (vivo) setQz('no'); }
    })();
    return () => { vivo = false; };
  }, []);

  const comandas = useMemo(() => printers.filter(p => p.type === 'comanda'), [printers]);
  const cajas = useMemo(() => printers.filter(p => p.type === 'receipt'), [printers]);
  const nombreCat = (id: string) => cats.find(c => c.id === id)?.name ?? id;

  /** Categorías que ya están en OTRO grupo: se avisa para que no se dupliquen. */
  const enOtroGrupo = (gid: string) => {
    const otras = new Set<string>();
    for (const g of grupos) if (g.id !== gid) for (const c of g.categories) otras.add(c);
    return otras;
  };

  const marcarSucio = () => { setSucio(true); setMsg(null); };
  const setGruposT = (v: Grupo[]) => { setGrupos(v); marcarSucio(); };
  const setPrintersT = (v: PrinterEntry[]) => { setPrinters(v); marcarSucio(); };
  const setCajaT = (v: string) => { setCaja(v); marcarSucio(); };
  const setViaT = (v: Transporte) => { setVia(v); marcarSucio(); };

  /** Guarda sin tocar los mensajes en pantalla (lo usa la prueba). */
  const guardarSilencioso = async () => {
    const limpios = grupos
      .map(g => ({ ...g, name: g.name.trim() }))
      .filter(g => g.name || g.categories.length > 0);
    await updateSettings({
      ...(settings ?? {}),
      comandaGroups: limpios,
      printers,
      defaultReceiptPrinterId: caja || undefined,
      comandaTransport: via,
    });
    posPrinterService.clearConfigCache();
    setGrupos(limpios);
    setSucio(false);
  };

  const guardar = async () => {
    setGuardando(true); setMsg(null);
    try {
      // Se guarda SOBRE la configuración de factura, sin tocar lo demás: acá solo
      // se administran los grupos, las asignaciones y la caja por defecto.
      const limpios = grupos
        .map(g => ({ ...g, name: g.name.trim() }))
        .filter(g => g.name || g.categories.length > 0);
      await updateSettings({
        ...(settings ?? {}),
        comandaGroups: limpios,
        printers,
        defaultReceiptPrinterId: caja || undefined,
        comandaTransport: via,
      });
      posPrinterService.clearConfigCache();
      setGrupos(limpios);
      setSucio(false);
      setMsg({ ok: true, text: 'Guardado. Las próximas comandas salen con esta asignación.' });
      setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally { setGuardando(false); }
  };

  /**
   * Prueba de verdad: manda una comanda de ejemplo a cocina.
   *
   * Es la única forma de saber si el camino elegido funciona. Antes se descubría
   * en el primer pedido real, con el cliente esperando.
   */
  const probar = async () => {
    if (!tenantId) return;
    setProbando(true); setMsg(null);
    try {
      if (sucio) await guardarSilencioso();
      posPrinterService.clearConfigCache();
      await posPrinterService.printComandas(
        'PRUEBA',
        comandas.length > 0 && (comandas[0].categories ?? []).length === 0 && (comandas[0].groups ?? []).length === 0
          ? [{ name: 'Plato de prueba', quantity: 1 }]
          // Con grupos asignados hay que mandar algo que alguno reclame, si no
          // la prueba «no imprime nada» y parece que el camino está roto.
          : [{ name: 'Plato de prueba', quantity: 1, category_id: primeraCategoriaAsignada() }],
        tenantId,
        'Prueba de comandas',
      );
      setMsg({ ok: true, text: 'Comanda de prueba enviada. Revisá el papel en la cocina.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo mandar la comanda de prueba' });
    } finally { setProbando(false); }
  };

  /** Una categoría que alguna impresora reclame, para que la prueba salga. */
  const primeraCategoriaAsignada = (): string | undefined => {
    for (const p of comandas) {
      const propias = p.categories ?? [];
      if (propias.length > 0) return String(propias[0]);
      for (const gid of (p.groups ?? [])) {
        const g = grupos.find(x => x.id === gid);
        if (g?.categories.length) return String(g.categories[0]);
      }
    }
    return undefined;
  };

  const agregarGrupo = () =>
    setGruposT([...grupos, { id: nuevoId(), name: '', categories: [] }]);

  const patchGrupo = (id: string, patch: Partial<Grupo>) =>
    setGruposT(grupos.map(g => g.id === id ? { ...g, ...patch } : g));

  const borrarGrupo = (id: string) => {
    if (!confirm('¿Borrar este grupo? Las impresoras que lo tengan asignado quedan sin esas categorías.')) return;
    setGrupos(grupos.filter(g => g.id !== id));
    // Y se desasigna de las impresoras: dejar el id colgando haría que la
    // impresora pareciera tener categorías que ya no existen.
    setPrinters(printers.map(p => (p.groups ?? []).includes(id)
      ? { ...p, groups: (p.groups ?? []).filter(g => g !== id) } : p));
    marcarSucio();
  };

  const toggleCatEnGrupo = (gid: string, catId: string) => {
    const g = grupos.find(x => x.id === gid);
    if (!g) return;
    const tiene = g.categories.includes(catId);
    patchGrupo(gid, {
      categories: tiene ? g.categories.filter(c => c !== catId) : [...g.categories, catId],
    });
  };

  const toggleGrupoEnImpresora = (pid: string, gid: string) =>
    setPrintersT(printers.map(p => {
      if (p.id !== pid) return p;
      const actuales = p.groups ?? [];
      return { ...p, groups: actuales.includes(gid) ? actuales.filter(g => g !== gid) : [...actuales, gid] };
    }));

  if (loading && !settings) {
    return <p className="py-10 text-gray-400 text-sm flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Cargando…</p>;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <ChefHat size={24} className="text-orange-600" /> Comandas
        </h2>
        <p className="text-gray-500 text-sm">
          Qué se imprime en cada estación de cocina, y a cuál caja sale el tiquete de la venta.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
          msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.ok ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Dos pestañas: primero se arman los grupos, después se reparten. */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
        {([['grupos', 'Grupos de categorías', Layers], ['impresoras', 'Grupos por impresora', Printer]] as const)
          .map(([id, label, Icono]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold ${
                tab === id ? 'bg-orange-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <Icono size={15} /> {label}
            </button>
          ))}
      </div>

      {tab === 'grupos' ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Un grupo junta las categorías que salen del <b>mismo lugar</b>. Ej.: «Cocina caliente» =
            Platos fuertes + Sopas; «Barra» = Bebidas + Cócteles.
          </p>

          {cats.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-semibold text-amber-800">
              Este negocio todavía no tiene categorías de productos. Creá las categorías primero:
              un grupo sin categorías no imprime nada.
            </div>
          )}

          {grupos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center">
              <p className="text-sm font-bold text-gray-500">Todavía no hay grupos.</p>
              <p className="text-xs text-gray-400 mb-3">
                Sin grupos, cada impresora imprime lo que tenga marcado una por una (o todo, si no tiene nada).
              </p>
              <button onClick={agregarGrupo}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white font-bold text-sm inline-flex items-center gap-1.5">
                <Plus size={14} /> Crear el primer grupo
              </button>
            </div>
          ) : (
            grupos.map(g => {
              const ocupadas = enOtroGrupo(g.id);
              return (
                <div key={g.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input value={g.name} onChange={e => patchGrupo(g.id, { name: e.target.value.slice(0, 40) })}
                      placeholder="Nombre del grupo (ej. Cocina caliente)"
                      className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-bold focus:outline-none focus:border-orange-400" />
                    <button onClick={() => borrarGrupo(g.id)} title="Borrar grupo"
                      className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {cats.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {cats.map(c => {
                        const marcada = g.categories.includes(c.id);
                        const enOtra = !marcada && ocupadas.has(c.id);
                        return (
                          <button key={c.id} onClick={() => toggleCatEnGrupo(g.id, c.id)}
                            title={enOtra ? 'Ya está en otro grupo: si la agregás acá, se imprime en los dos' : undefined}
                            className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition ${
                              marcada ? 'bg-orange-100 border-orange-300 text-orange-800'
                                : enOtra ? 'bg-white border-amber-200 text-amber-600'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                            {c.name}{enOtra && ' •'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400">
                    {g.categories.length === 0
                      ? 'Sin categorías: este grupo no manda nada a imprimir.'
                      : `${g.categories.length} categoría(s): ${g.categories.map(nombreCat).join(', ')}`}
                  </p>
                </div>
              );
            })
          )}

          {grupos.length > 0 && (
            <button onClick={agregarGrupo}
              className="px-4 py-2 rounded-xl border-2 border-gray-200 text-gray-700 font-bold text-sm inline-flex items-center gap-1.5 hover:bg-gray-50">
              <Plus size={14} /> Agregar otro grupo
            </button>
          )}
          <p className="text-[11px] text-gray-400">
            El punto (•) marca una categoría que ya está en otro grupo. Se puede repetir —a veces el
            mismo plato se anuncia en dos estaciones— pero si no era a propósito, se imprime doble.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Comandas ── */}
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              A cada impresora de cocina se le asignan los grupos que le toca imprimir. Las
              impresoras se crean en <b>Configuración → Factura</b>.
            </p>
            {comandas.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-semibold text-amber-800">
                No hay impresoras de comanda configuradas. Agregalas en Configuración → Factura y
                volvé acá para repartirles los grupos.
              </div>
            ) : comandas.map(p => {
              const asignados = p.groups ?? [];
              const sueltas = (p.categories ?? []).length;
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ChefHat size={15} className="text-orange-500" />
                    <p className="font-black text-gray-900">{p.label || 'Impresora sin nombre'}</p>
                    {!p.is_active && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">INACTIVA</span>
                    )}
                    <span className="text-[11px] text-gray-400">{p.connection}</span>
                  </div>
                  {grupos.length === 0 ? (
                    <p className="text-xs text-gray-400">Creá primero los grupos en la otra pestaña.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {grupos.map(g => (
                        <button key={g.id} onClick={() => toggleGrupoEnImpresora(p.id, g.id)}
                          className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition ${
                            asignados.includes(g.id)
                              ? 'bg-orange-100 border-orange-300 text-orange-800'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                          {g.name || 'grupo sin nombre'}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400">
                    {asignados.length === 0 && sueltas === 0
                      ? 'Sin nada asignado: recibe todo lo que ninguna otra impresora reclame.'
                      : [
                        asignados.length > 0 && `${asignados.length} grupo(s)`,
                        sueltas > 0 && `${sueltas} categoría(s) marcadas aparte (en Factura)`,
                      ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              );
            })}
          </div>

          {/* ── Cómo se mandan ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <div>
              <p className="font-black text-gray-900 flex items-center gap-2">
                <Network size={15} className="text-indigo-500" /> Cómo se mandan las comandas
              </p>
              <p className="text-xs text-gray-500">
                Es aparte del tiquete de la caja: la caja puede imprimir por el navegador y la
                cocina tener su impresora en la red.
              </p>
            </div>

            <div className="space-y-2">
              {([
                {
                  id: 'auto' as Transporte, icono: Wand2, titulo: 'Automático',
                  que: 'Usa lo que haya: Bluetooth si la caja está en Bluetooth, si no QZ Tray.',
                  estado: null as null | { ok: boolean; texto: string },
                },
                {
                  id: 'qztray' as Transporte, icono: Network, titulo: 'QZ Tray (red o USB)',
                  que: 'Un programa gratis que corre en una computadora del local y le manda a cada '
                    + 'impresora, por cable USB o por su dirección IP (puerto 9100). Es el ÚNICO '
                    + 'camino para una impresora de cocina por RED: el navegador no puede abrir una '
                    + 'conexión así por su cuenta.',
                  estado: qz === 'buscando' ? { ok: true, texto: 'Revisando…' }
                    : qz === 'si' ? { ok: true, texto: 'Corriendo en esta computadora' }
                    : { ok: false, texto: 'No está corriendo acá. Hay que instalarlo y dejarlo abierto.' },
                },
                {
                  id: 'bluetooth' as Transporte, icono: Bluetooth, titulo: 'Bluetooth (directo)',
                  que: 'Del equipo de la caja a cada impresora emparejada, sin red ni computadora '
                    + 'extra. Una impresora por estación y hay que estar cerca.',
                  estado: isNativeApp()
                    ? (hasNativeBluetooth()
                      ? { ok: true, texto: 'Disponible en la app de Android' }
                      : { ok: false, texto: 'Esta versión de la app no trae el módulo de Bluetooth.' })
                    : (webBluetoothAvailable()
                      ? { ok: true, texto: 'Disponible en este navegador' }
                      : { ok: false, texto: 'Este navegador no soporta Bluetooth (usá Chrome o Edge).' }),
                },
              ]).map(op => {
                const Icono = op.icono;
                const elegido = via === op.id;
                return (
                  <button key={op.id} type="button" onClick={() => setViaT(op.id)}
                    className={`w-full text-left rounded-xl border-2 px-3 py-2.5 transition ${
                      elegido ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2">
                      <Icono size={15} className={elegido ? 'text-orange-600' : 'text-gray-400'} />
                      <span className="font-black text-sm text-gray-900">{op.titulo}</span>
                      {op.estado && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                          op.estado.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                          {op.estado.texto}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{op.que}</p>
                  </button>
                );
              })}

              {/* Opción que todavía NO existe. Se muestra apagada a propósito: es
                  la que todo el mundo pregunta primero, y es mejor decir que no
                  está que dejar que alguien la configure y no imprima nada. */}
              <div className="w-full rounded-xl border-2 border-dashed border-gray-200 px-3 py-2.5 opacity-70">
                <div className="flex items-center gap-2">
                  <Smartphone size={15} className="text-gray-400" />
                  <span className="font-black text-sm text-gray-500">Desde la app, directo a la IP</span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                    NO DISPONIBLE
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  La app de Android todavía no puede abrir una conexión directa a la impresora de
                  red; hoy solo imprime por Bluetooth. Para cocina por red hace falta QZ Tray en
                  una computadora del local. Si lo necesitás en la app, se puede agregar.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button type="button" onClick={() => void probar()} disabled={probando || comandas.length === 0}
                className="px-4 py-2 rounded-xl border-2 border-orange-200 text-orange-700 font-bold text-sm hover:bg-orange-50 disabled:opacity-40 flex items-center gap-2">
                {probando ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Mandar una comanda de prueba
              </button>
              {comandas.length === 0 && (
                <span className="text-[11px] text-gray-400">
                  Primero hay que tener una impresora de comanda en Configuración → Factura.
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              Si el envío falla, el punto de venta ahora lo <b>dice</b>: antes mostraba «Pedido
              enviado a cocina» igual y el pedido se perdía sin que nadie supiera por qué.
            </p>
          </div>

          {/* ── Caja por defecto ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
            <p className="font-black text-gray-900 flex items-center gap-2">
              <Star size={15} className="text-amber-500" /> Caja por defecto
            </p>
            <p className="text-xs text-gray-500">
              A cuál impresora sale el <b>tiquete de la venta</b>. Con dos cajas activas y sin elegir
              una, cada venta se imprime en las dos.
            </p>
            {cajas.length === 0 ? (
              <p className="text-xs text-gray-400">No hay impresoras de recibo configuradas.</p>
            ) : (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                  <input type="radio" name="caja" checked={!caja} onChange={() => setCajaT('')}
                    className="w-4 h-4 accent-orange-600" />
                  Todas las activas <span className="text-xs text-gray-400">(como antes)</span>
                </label>
                {cajas.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                    <input type="radio" name="caja" checked={caja === p.id} onChange={() => setCajaT(p.id)}
                      className="w-4 h-4 accent-orange-600" />
                    {p.label || 'Impresora sin nombre'}
                    {!p.is_active && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">INACTIVA</span>}
                  </label>
                ))}
              </div>
            )}
            {caja && !cajas.some(p => p.id === caja && p.is_active) && (
              <p className="text-[11px] font-bold text-amber-700">
                La caja elegida está inactiva o ya no existe: mientras siga así, el tiquete sale por
                todas las activas para que no se quede sin imprimir.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => void guardar()} disabled={guardando || !sucio}
          className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm flex items-center gap-2">
          {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
        </button>
        {sucio && <p className="text-xs font-bold text-amber-600">Hay cambios sin guardar</p>}
      </div>
    </div>
  );
};

export default ComandasSettings;
