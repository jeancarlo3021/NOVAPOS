import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Boxes, Plus, Loader2, Trash2, Search, X, Save, AlertCircle, CheckCircle2,
  PackageSearch, Layers, TrendingUp, Minus,
} from 'lucide-react';
import { productKitsService, type ProductKit, type KitItem } from '@/services/Inventory/productKitsService';
import { inventoryProductsService } from '@/services/Inventory/InventoryProductsService';
import { useTenantId } from '@/hooks/useTenant';

/* Miles con punto: `toLocaleString('es-CR')` devuelve un espacio fino según el
   navegador —«₡2 600»— y no es como se escribe un precio acá ni como lo
   escriben las demás pantallas. */
const money = (n: number) =>
  `₡${Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
/** Precio de venta de un producto del catálogo (la columna es `unit_price`). */
const priceOf = (p: any) => Number(p?.unit_price ?? p?.price ?? 0);

/**
 * Kits de productos (combos / paquetes).
 *
 * Un kit se vende como un producto más, pero por dentro lleva otros productos:
 * al venderlo baja el stock de sus COMPONENTES. Sirve para "combo 6 cervezas",
 * "canasta navideña" o "kit de frenos", donde el paquete no es una existencia
 * aparte sino una forma de vender lo que ya está en bodega.
 */
export const KitsManagement: React.FC = () => {
  const [kits, setKits] = useState<ProductKit[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductKit | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [q, setQ] = useState('');
  const { tenantId } = useTenantId();

  // Kits y productos se cargan por separado A PROPÓSITO: si la lista de kits
  // falla (backend sin desplegar, migración 93 sin correr), el catálogo tiene
  // que aparecer igual — si no, la pantalla queda sin nada que elegir y sin
  // decir por qué.
  const load = useCallback(async () => {
    setLoading(true);
    const [ks, ps] = await Promise.allSettled([
      productKitsService.list(),
      inventoryProductsService.getAllProducts(tenantId),
    ]);
    if (ks.status === 'fulfilled') setKits(ks.value);
    if (ps.status === 'fulfilled') setProducts(ps.value as any[]);

    const problems: string[] = [];
    if (ks.status === 'rejected') {
      problems.push(`No se pudieron cargar los kits: ${ks.reason?.message ?? ks.reason}`);
    }
    if (ps.status === 'rejected') {
      problems.push(`No se pudo cargar el catálogo de productos: ${ps.reason?.message ?? ps.reason}`);
    } else if ((ps.value as any[]).length === 0) {
      problems.push('El catálogo de productos vino vacío: creá productos antes de armar un kit.');
    }
    setMsg(problems.length ? { kind: 'err', text: problems.join(' · ') } : null);
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (msg?.kind !== 'ok') return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return kits;
    return kits.filter(k =>
      k.name.toLowerCase().includes(term) || (k.sku ?? '').toLowerCase().includes(term));
  }, [kits, q]);

  const unmakeKit = async (k: ProductKit) => {
    if (!confirm(`"${k.name}" vuelve a ser un producto normal y se borra su composición. El producto NO se elimina. ¿Seguir?`)) return;
    try {
      await productKitsService.convert(k.id, false);
      setMsg({ kind: 'ok', text: `${k.name} volvió a ser un producto normal` });
      void load();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudo deshacer' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-2 text-lg font-black text-gray-900">
          <Boxes size={22} className="text-teal-600" /> Kits de productos
        </span>
        <div className="flex-1" />
        <div className="relative flex-1 sm:flex-none sm:w-64 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar kit…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" />
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm">
          <Plus size={16} /> Nuevo kit
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
          msg.kind === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-bold text-gray-400">
          <Loader2 size={18} className="animate-spin" /> Cargando kits…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-16">
          <Layers size={44} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">
            {kits.length === 0 ? 'Todavía no hay kits.' : 'Ningún kit coincide con la búsqueda.'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Un kit se vende como un producto y descuenta el stock de lo que lleva dentro.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(k => {
            const margin = k.price > 0 && k.components_cost != null
              ? round2(((k.price - k.components_cost) / k.price) * 100) : null;
            const saving = (k.loose_price ?? 0) - k.price;
            return (
              <div key={k.id} className="bg-white border-2 border-gray-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 truncate">{k.name}</p>
                    <p className="text-xs font-bold text-gray-400">
                      {k.sku ?? 'Sin código'} · {k.items.length} producto(s)
                      {(k.depth ?? 1) > 1 && ` · ${k.depth} niveles`}
                    </p>
                  </div>
                  <span className="text-xl font-black tabular-nums shrink-0">{money(k.price)}</span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[11px] font-black px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    Costo {money(k.components_cost ?? 0)}
                  </span>
                  {margin != null && (
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded ${
                      margin < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      Margen {margin}%
                    </span>
                  )}
                  {saving > 0 && (
                    <span className="text-[11px] font-black px-2 py-0.5 rounded bg-sky-100 text-sky-700">
                      Ahorro {money(saving)} vs. suelto
                    </span>
                  )}
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded ${
                    k.buildable == null ? 'bg-gray-100 text-gray-500'
                      : k.buildable <= 0 ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-800'}`}>
                    {k.buildable == null ? 'Sin límite de stock' : `Se pueden armar ${k.buildable}`}
                  </span>
                </div>

                <ul className="mt-3 text-xs text-gray-600 space-y-0.5 max-h-32 overflow-y-auto no-scrollbar">
                  {k.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">
                        {it.quantity} × {it.name}
                        {it.is_kit && (
                          <span className="ml-1 px-1 py-0.5 rounded bg-violet-100 text-violet-700 text-[9px] font-black uppercase">
                            sub-kit
                          </span>
                        )}
                      </span>
                      {/* Un sub-kit no tiene stock propio: lo que importa es lo
                          que hay al final de su cadena, y eso ya está contado
                          en «Se pueden armar». */}
                      <span className={`tabular-nums shrink-0 ${
                        !it.is_kit && it.tracks_stock && (it.stock_quantity ?? 0) < it.quantity
                          ? 'text-red-600 font-black' : 'text-gray-400'}`}>
                        {it.is_kit ? '→' : it.tracks_stock ? `stock ${it.stock_quantity}` : '∞'}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => setEditing(k)}
                    className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm">
                    Editar composición
                  </button>
                  <button onClick={() => void unmakeKit(k)} title="Volver a producto normal"
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(editing || creating) && (
        <KitEditor
          kit={editing}
          products={products}
          kits={kits}
          existingKitIds={kits.map(k => k.id)}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={text => {
            setEditing(null); setCreating(false);
            setMsg({ kind: 'ok', text });
            void load();
          }}
        />
      )}
    </div>
  );
};

/** Alta y edición de la composición del kit. */
const KitEditor: React.FC<{
  kit: ProductKit | null;
  products: any[];
  /** Los demás kits: hacen falta para los SUB-KITS —cuánto cuesta uno por
   *  dentro y qué productos reales arrastra— antes de guardar. */
  kits: ProductKit[];
  existingKitIds: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}> = ({ kit, products, kits, existingKitIds, onClose, onSaved }) => {
  // Al crear hay que elegir primero QUÉ producto es el kit: el kit se vende con
  // su propio precio y CABYS, así que tiene que existir como producto.
  const [target, setTarget] = useState<string>(kit?.id ?? '');
  const [items, setItems] = useState<KitItem[]>(kit?.items?.map(i => ({ ...i })) ?? []);
  const [q, setQ] = useState('');
  const [targetQ, setTargetQ] = useState('');
  const [targetOpen, setTargetOpen] = useState(false);
  /** Cuál sugerencia está resaltada (flechas del teclado). */
  const [targetIdx, setTargetIdx] = useState(0);
  const campoTarget = useRef<HTMLDivElement | null>(null);
  /**
   * DÓNDE se dibuja la lista de sugerencias.
   *
   * Iba dentro del modal, en un contenedor con `overflow-y-auto`, y ahí la
   * lista quedaba RECORTADA: de cincuenta coincidencias se veían tres y media,
   * la última cortada por la mitad. Parecía un campo de texto roto, no un
   * buscador. Ahora se dibuja pegada al `body` —fuera de cualquier contenedor
   * que la pueda cortar— en la posición del campo, y se da vuelta hacia arriba
   * cuando abajo no cabe.
   */
  const [anclaTarget, setAnclaTarget] = useState<
    { left: number; top: number; width: number; arriba: boolean; alto: number } | null>(null);

  const ubicarLista = useCallback(() => {
    const el = campoTarget.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom - 12;
    const arriba = r.top - 12;
    const haciaArriba = abajo < 180 && arriba > abajo;
    setAnclaTarget({
      left: r.left, width: r.width, arriba: haciaArriba,
      top: haciaArriba ? r.top - 6 : r.bottom + 6,
      alto: Math.max(140, Math.min(300, haciaArriba ? arriba : abajo)),
    });
  }, []);

  /** La lista sigue al campo si la pantalla se mueve mientras está abierta. */
  useEffect(() => {
    if (!targetOpen) return;
    ubicarLista();
    const seguir = () => ubicarLista();
    window.addEventListener('resize', seguir);
    window.addEventListener('scroll', seguir, true);
    return () => {
      window.removeEventListener('resize', seguir);
      window.removeEventListener('scroll', seguir, true);
    };
  }, [targetOpen, targetQ, ubicarLista]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetProduct = products.find(p => String(p.id) === String(target));
  const price = targetProduct ? priceOf(targetProduct) : Number(kit?.price ?? 0);

  const candidates = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      /*
       * Los otros KITS también se ofrecen: un kit puede llevar sub-kits.
       *
       * El único que se saca de la lista es el kit que se está armando —un kit
       * no puede contenerse a sí mismo—. Los círculos más largos (A lleva B y B
       * lleva A) los detecta el servidor, que es el que ve la cadena completa,
       * y responde diciendo por dónde da la vuelta.
       */
      .filter(p => String(p.id) !== String(target))
      .filter(p => !items.some(i => String(i.component_id) === String(p.id)))
      .filter(p => !term
        || String(p.name ?? '').toLowerCase().includes(term)
        || String(p.sku ?? '').toLowerCase().includes(term))
      .slice(0, 40);
  }, [products, q, items, target, existingKitIds]);

  const add = (p: any) => setItems(prev => [...prev, {
    component_id: String(p.id), quantity: 1, name: p.name, sku: p.sku,
    price: priceOf(p), cost_price: Number(p.cost_price ?? 0),
    stock_quantity: Number(p.stock_quantity ?? 0), tracks_stock: p.tracks_stock !== false,
  }]);
  const setQty = (i: number, qty: number) =>
    setItems(prev => prev.map((x, j) => j === i ? { ...x, quantity: Math.max(0, round2(qty)) } : x));

  const esKit = (p: any) => existingKitIds.includes(String(p?.id ?? p?.component_id));

  /**
   * EL COSTO DE UN SUB-KIT ES EL DE LO QUE LLEVA ADENTRO.
   *
   * Un kit casi nunca tiene `cost_price`: no se compra, se arma. Sumando el
   * costo directo, un kit hecho de kits costaba ₡0 y el margen daba 100% —un
   * número alegre y falso con el que alguien podría fijar un precio—.
   */
  const costoDe = (componentId: string, visto = new Set<string>()): number => {
    const id = String(componentId);
    const subKit = kits.find(k => String(k.id) === id);
    if (subKit && !visto.has(id)) {
      const marcado = new Set(visto).add(id);
      return (subKit.items ?? []).reduce(
        (s, i) => s + costoDe(i.component_id, marcado) * Number(i.quantity || 0), 0);
    }
    const prod = products.find(p => String(p.id) === id);
    return Number(prod?.cost_price ?? 0);
  };

  /**
   * Qué productos REALES se descuentan al vender uno, bajando por la cadena.
   *
   * Es lo que hace entendible un kit de kits: en la lista de arriba se ven tres
   * «Combo chico», pero del inventario salen doce refrescos, y ese es el número
   * que decide si el combo se puede armar.
   */
  const explosion = (() => {
    const hojas = new Map<string, { nombre: string; cantidad: number; stock: number; rastrea: boolean }>();
    const bajar = (componentId: string, cantidad: number, visto: Set<string>) => {
      const id = String(componentId);
      const subKit = kits.find(k => String(k.id) === id);
      if (subKit && !visto.has(id)) {
        const marcado = new Set(visto).add(id);
        for (const i of subKit.items ?? []) bajar(i.component_id, cantidad * Number(i.quantity || 0), marcado);
        return;
      }
      const prod = products.find(p => String(p.id) === id);
      const previo = hojas.get(id);
      hojas.set(id, {
        nombre: prod?.name ?? 'Producto',
        cantidad: round2((previo?.cantidad ?? 0) + cantidad),
        stock: Number(prod?.stock_quantity ?? 0),
        rastrea: prod?.tracks_stock !== false,
      });
    };
    for (const it of items) bajar(it.component_id, it.quantity, new Set([String(target)]));
    return [...hojas.values()];
  })();

  const haySubKits = items.some(i => esKit({ id: i.component_id }));

  const cost = items.reduce((s, i) => s + costoDe(i.component_id) * i.quantity, 0);
  const loose = items.reduce((s, i) => s + Number(i.price ?? 0) * i.quantity, 0);
  const margin = price > 0 ? round2(((price - cost) / price) * 100) : null;

  const save = async () => {
    if (!target) { setError('Elegí el producto que se va a vender como kit.'); return; }
    const kept = items.filter(i => i.quantity > 0);
    if (!kept.length) { setError('El kit necesita al menos un producto adentro.'); return; }
    setSaving(true); setError(null);
    try {
      // Marcarlo como kit primero: así queda con stock infinito (lo que se
      // controla es el stock de los componentes) antes de guardar la receta.
      await productKitsService.convert(target, true);
      await productKitsService.setItems(target,
        kept.map(i => ({ component_id: i.component_id, quantity: i.quantity })));
      onSaved(`Kit "${targetProduct?.name ?? kit?.name ?? ''}" guardado`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800 flex items-center gap-2">
            <Boxes size={16} className="text-teal-600" />
            {kit ? `Editar ${kit.name}` : 'Nuevo kit'}
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
          {/* Producto que se vende */}
          {!kit && (() => {
            const selected = products.find(p => String(p.id) === String(target));
            const term = targetQ.trim().toLowerCase();
            const coincidencias = products
              .filter(p => !existingKitIds.includes(String(p.id)))
              .filter(p => !term
                || String(p.name ?? '').toLowerCase().includes(term)
                || String(p.sku ?? '').toLowerCase().includes(term));
            const total = coincidencias.length;
            const matches = coincidencias.slice(0, 50);
            const elegir = (p: any) => {
              setTarget(String(p.id)); setTargetQ(''); setTargetOpen(false); setTargetIdx(0);
            };
            /** Teclado: el buscador se maneja sin soltar las manos. */
            const teclas = (e: React.KeyboardEvent) => {
              // Escape cierra SIEMPRE, también cuando la búsqueda no encontró
              // nada: si no, el aviso de «sin resultados» se quedaba pegado.
              if (e.key === 'Escape') { setTargetOpen(false); return; }
              if (!targetOpen || matches.length === 0) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setTargetIdx(i => Math.min(matches.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setTargetIdx(i => Math.max(0, i - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); elegir(matches[Math.min(targetIdx, matches.length - 1)]); }
            };
            return (
              <div className="relative">
                <p className="text-xs font-black text-gray-500 uppercase mb-1">Producto que se vende como kit</p>
                <div className="relative" ref={campoTarget}>
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={targetOpen ? targetQ : (selected ? `${selected.name}${selected.sku ? ` · ${selected.sku}` : ''}` : targetQ)}
                    onChange={e => { setTargetQ(e.target.value); setTargetOpen(true); setTargetIdx(0); if (target) setTarget(''); }}
                    onFocus={() => { setTargetOpen(true); setTargetQ(''); setTargetIdx(0); }}
                    onKeyDown={teclas}
                    onBlur={() => setTimeout(() => setTargetOpen(false), 150)}
                    placeholder={products.length === 0 ? 'No hay productos cargados' : 'Buscá por nombre o SKU…'}
                    className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:border-teal-500" />
                  {target && !targetOpen && (
                    <button type="button" onClick={() => { setTarget(''); setTargetQ(''); setTargetOpen(true); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100">
                      <X size={14} className="text-gray-400" />
                    </button>
                  )}
                </div>
                {/* La lista va al `body`: adentro del modal la recortaba el
                    contenedor con scroll y se veían tres resultados de
                    cincuenta, el último partido al medio. */}
                {targetOpen && anclaTarget && createPortal(
                  <div
                    style={{
                      position: 'fixed', left: anclaTarget.left, width: anclaTarget.width,
                      ...(anclaTarget.arriba
                        ? { bottom: window.innerHeight - anclaTarget.top }
                        : { top: anclaTarget.top }),
                      maxHeight: anclaTarget.alto, zIndex: 60,
                    }}
                    className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-y-auto">
                    {matches.length === 0 ? (
                      <p className="px-3 py-2.5 text-xs font-bold text-gray-400">
                        {term ? `Sin resultados para “${targetQ}”.` : 'No hay productos para elegir.'}
                      </p>
                    ) : (
                      <>
                        {/* Cuántos hay, para que se entienda que la lista está
                            recortada a propósito y hay que escribir más. */}
                        <p className="px-3 pt-2 pb-1 text-[10px] font-black text-gray-400 uppercase tracking-wide">
                          {total > matches.length
                            ? `${matches.length} de ${total} · escribí para afinar`
                            : `${matches.length} producto(s)`}
                        </p>
                        <ul>
                          {matches.map((p, i) => (
                            <li key={p.id}>
                              <button type="button"
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={() => setTargetIdx(i)}
                                onClick={() => elegir(p)}
                                className={`w-full text-left px-3 py-2 text-sm ${
                                  i === targetIdx ? 'bg-teal-50' : 'hover:bg-teal-50'}`}>
                                <span className="block font-black text-gray-800 truncate">
                                  {p.name}{p.sku ? ` · ${p.sku}` : ''}
                                </span>
                                <span className="block text-[11px] font-bold text-gray-400">{money(priceOf(p))}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>,
                  document.body,
                )}
                <p className="text-[11px] font-semibold text-gray-400 mt-1">
                  El kit se vende con el precio y el CABYS de ese producto. Su stock deja de
                  controlarse: lo que manda es el stock de los componentes.
                </p>
              </div>
            );
          })()}

          {/* Composición */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1">Lleva adentro</p>
            {items.length === 0 ? (
              <p className="text-xs font-bold text-gray-400 py-3">Todavía no hay productos en el kit.</p>
            ) : (
              <div className="space-y-1.5">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 border border-gray-200 rounded-xl px-2.5 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-black text-gray-800 truncate">
                        {it.name}
                        {it.is_kit && (
                          <span className="ml-1.5 align-middle px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-black uppercase tracking-wide">
                            Sub-kit
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] font-bold text-gray-400">
                        {/* De un sub-kit no se dice «stock»: no tiene. Lo que
                            baja al vender es lo que él lleva adentro, y eso se
                            ve completo en «Al vender uno se descuenta». */}
                        {it.is_kit
                          ? 'lleva sus propios productos adentro'
                          : `${it.tracks_stock ? `stock ${it.stock_quantity}` : 'stock infinito'} · costo ${money(Number(it.cost_price ?? 0))}`}
                      </span>
                    </span>
                    <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden shrink-0">
                      <button onClick={() => setQty(i, it.quantity - 1)} className="px-2.5 py-2 hover:bg-gray-50">
                        <Minus size={13} className="text-gray-500" />
                      </button>
                      <input type="number" min={0} step="any" value={it.quantity}
                        onChange={e => setQty(i, Number(e.target.value))}
                        className="w-14 text-center text-sm font-black text-gray-800 outline-none" />
                      <button onClick={() => setQty(i, it.quantity + 1)} className="px-2.5 py-2 hover:bg-gray-50">
                        <Plus size={13} className="text-gray-500" />
                      </button>
                    </div>
                    <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buscador de productos para agregar */}
          <div>
            <div className="relative">
              <PackageSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar producto para agregar…"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" />
            </div>
            {q.trim() && (
              <div className="mt-1.5 border border-gray-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto no-scrollbar">
                {candidates.length === 0 ? (
                  <p className="text-xs font-bold text-gray-400 px-3 py-3">
                    {products.length === 0
                      ? 'El catálogo de productos no se pudo cargar.'
                      : 'Sin resultados.'}
                  </p>
                ) : candidates.map(p => (
                  <button key={p.id} onClick={() => { add(p); setQ(''); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-teal-50 border-b border-gray-50">
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-gray-800 truncate">
                        {p.name}
                        {esKit(p) && (
                          <span className="ml-1.5 align-middle px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-black uppercase tracking-wide">
                            Sub-kit
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] font-bold text-gray-400">
                        {p.sku ?? 'Sin código'} · {money(priceOf(p))}
                      </span>
                    </span>
                    <Plus size={15} className="text-teal-600 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lo que de verdad mueve el inventario. Solo tiene sentido mostrarlo
              cuando hay sub-kits: sin ellos sería repetir la lista de arriba. */}
          {haySubKits && explosion.length > 0 && (
            <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
              <p className="text-[11px] font-black text-violet-700 uppercase mb-1.5">
                Al vender uno se descuenta
              </p>
              <ul className="space-y-0.5">
                {explosion.map((h, i) => (
                  <li key={i} className="flex justify-between gap-2 text-xs font-bold text-violet-900">
                    <span className="truncate">{h.cantidad} × {h.nombre}</span>
                    <span className={`tabular-nums shrink-0 ${
                      h.rastrea && h.stock < h.cantidad ? 'text-red-600' : 'text-violet-400'}`}>
                      {h.rastrea ? `stock ${h.stock}` : '∞'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>Costo del kit</span><span className="tabular-nums">{money(cost)}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>Suelto valdría</span><span className="tabular-nums">{money(loose)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-black text-gray-800">
            <span>Precio de venta</span>
            <span className="tabular-nums">
              {money(price)}
              {margin != null && (
                <span className={`ml-2 text-xs ${margin < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  <TrendingUp size={11} className="inline" /> {margin}%
                </span>
              )}
            </span>
          </div>
          {margin != null && margin < 0 && (
            <p className="text-[11px] font-bold text-red-600">
              El kit se vende por debajo de lo que cuesta armarlo.
            </p>
          )}
          <button onClick={() => void save()} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar kit
          </button>
        </div>
      </div>
    </div>
  );
};

export default KitsManagement;
