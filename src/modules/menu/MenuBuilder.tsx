'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  QrCode, Save, Eye, EyeOff, Plus, Trash2, Search, Loader2, Palette,
  Download, ExternalLink, GripVertical, Check, Link2, ChevronUp, ChevronDown,
  Upload, Image as ImageIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenant';
import { fuzzyMatch } from '@/utils/fuzzySearch';
import { storageService } from '@/services/storage/storageService';
import { MenuRender } from './MenuRender';
import {
  THEMES_BY_GROUP, themeOf, money,
  type MenuHeader, type MenuConfig, type MenuItem,
} from './menuThemes';

/**
 * Armador del menú digital.
 *
 * Dos columnas: los controles a la izquierda y el teléfono a la derecha, con lo
 * que el cliente va a ver ACTUALIZÁNDOSE mientras se edita. Sin esa vista, armar
 * una carta es adivinar: el negocio guardaría, escanearía y volvería a corregir,
 * cinco veces.
 */

interface Section { id: string; title: string; note?: string | null; product_ids: string[] }
interface Menu {
  slug: string; published: boolean; theme: string;
  header: MenuHeader; config: MenuConfig; sections: Section[];
  views?: number;
}
interface Prod { id: string; name: string; sku?: string | null; unit_price: number; description?: string | null; image_url?: string | null }

const uid = () => `s${Math.random().toString(36).slice(2, 9)}`;

export const MenuBuilder: React.FC = () => {
  const { tenantId } = useTenantId();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [products, setProducts] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [qr, setQr] = useState<string>('');

  const publicUrl = menu ? `${window.location.origin}/m/${menu.slug}` : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([
        apiFetch<Menu>('/digital-menu'),
        // El MENÚ del restaurante si existe; si no, el catálogo. Un negocio con
        // recetas no debería tener que buscar sus platos entre los insumos.
        apiFetch<Prod[]>('/recipes/menu')
          .then(r => (r?.length ? r : apiFetch<Prod[]>('/products')))
          .catch(() => apiFetch<Prod[]>('/products')),
      ]);
      setMenu(m);
      setProducts(p ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo cargar el menú');
    } finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  // El QR se dibuja del enlace real. Se regenera al cambiar el slug para que
  // nunca quede un código apuntando a una dirección vieja.
  useEffect(() => {
    if (!publicUrl) return;
    let alive = true;
    import('qrcode')
      .then(q => q.toDataURL(publicUrl, { width: 640, margin: 1, errorCorrectionLevel: 'M' }))
      .then(url => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [publicUrl]);

  const patch = (p: Partial<Menu>) => setMenu(m => (m ? { ...m, ...p } : m));
  const patchHeader = (p: Partial<MenuHeader>) =>
    setMenu(m => (m ? { ...m, header: { ...m.header, ...p } } : m));
  const patchConfig = (p: Partial<MenuConfig>) =>
    setMenu(m => (m ? { ...m, config: { ...m.config, ...p } } : m));
  const setSections = (fn: (s: Section[]) => Section[]) =>
    setMenu(m => (m ? { ...m, sections: fn(m.sections) } : m));

  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  /** Lo que ve la vista previa: las mismas secciones, ya resueltas a platos. */
  const previewSections = useMemo(() => {
    if (!menu) return [];
    return menu.sections.map(s => ({
      id: s.id, title: s.title, note: s.note,
      items: s.product_ids.map(id => {
        const p = byId.get(id);
        if (!p) return null;
        return {
          id: p.id, name: p.name, description: p.description ?? null,
          price: Number(p.unit_price) || 0, image_url: p.image_url ?? null,
          allergens: (p as any).allergens ?? null, diet_tags: (p as any).diet_tags ?? null,
        } as MenuItem;
      }).filter(Boolean) as MenuItem[],
    })).filter(s => s.items.length > 0);
  }, [menu, byId]);

  const save = async () => {
    if (!menu) return;
    setSaving(true); setErr(''); setMsg('');
    try {
      const saved = await apiFetch<Menu>('/digital-menu', {
        method: 'PUT', body: JSON.stringify(menu),
      });
      setMenu(saved);
      setMsg('Menú guardado');
      setTimeout(() => setMsg(''), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const downloadQr = () => {
    if (!qr || !menu) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `qr-menu-${menu.slug}.png`;
    a.click();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
      <Loader2 size={20} className="animate-spin" /> Cargando…
    </div>;
  }
  if (!menu) {
    return <div className="p-6"><div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{err || 'No se pudo cargar'}</div></div>;
  }

  const t = themeOf(menu.theme);
  const inSomeSection = new Set(menu.sections.flatMap(s => s.product_ids));

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">

      {/* Encabezado */}
      <div className="bg-linear-to-r from-teal-600 to-emerald-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><QrCode size={22} /></div>
            <div>
              <h1 className="text-xl font-black">Menú digital</h1>
              <p className="text-white/80 text-sm">
                La carta que el cliente abre escaneando el código de la mesa
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => patch({ published: !menu.published })}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-black transition ${
                menu.published ? 'bg-white text-emerald-700' : 'bg-white/15 text-white hover:bg-white/25'
              }`}>
              {menu.published ? <><Eye size={15} /> Publicado</> : <><EyeOff size={15} /> Sin publicar</>}
            </button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-black disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
            </button>
          </div>
        </div>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm font-bold">{msg}</div>}
      {!menu.published && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
          Sin publicar, el enlace responde «no encontrado». Es a propósito: se puede armar la carta
          con calma sin que un QR ya pegado en las mesas muestre algo a medio hacer.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">

        {/* ── Controles ──────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Diseño */}
          <section className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-black text-gray-800 flex items-center gap-2 mb-3">
              <Palette size={15} className="text-teal-600" /> Diseño
            </h2>
            {/* Agrupados por tipo de local, no por color: así es como se elige.
                Con 28 temas, ordenarlos por tono dejaría al dueño de la
                marisquería revisando paletas de cafetería. */}
            <div className="space-y-3">
              {THEMES_BY_GROUP.map(({ group, label, themes }) => (
                <div key={group}>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                    {themes.map(th => (
                      <button key={th.id} onClick={() => patch({ theme: th.id })}
                        className={`text-left rounded-xl border-2 overflow-hidden transition ${
                          menu.theme === th.id ? 'border-teal-500 ring-2 ring-teal-100' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        {/* Muestra real del tema, no un cuadrito de color: lo que
                            distingue un diseño de otro es la tipografía y el aire. */}
                        <div style={{ background: th.page, padding: 10 }}>
                          <p style={{
                            fontFamily: th.titleFont, color: menu.config.accent || '#0F766E',
                            fontSize: 8, fontWeight: 700, margin: '0 0 4px',
                            textTransform: th.titleTransform ?? 'none',
                            letterSpacing: th.titleSpacing ?? '.02em',
                            borderBottom: th.sectionRule ? `1px solid ${th.rule}` : 'none',
                            paddingBottom: th.sectionRule ? 3 : 0,
                          }}>
                            FONDOS
                          </p>
                          <p style={{ fontFamily: th.titleFont, color: th.ink, fontSize: 11, fontWeight: 600, margin: 0 }}>
                            Casado
                          </p>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 3 }}>
                            <span style={{ flex: 1, borderBottom: th.priceStyle === 'leader' ? `1px dotted ${th.rule}` : 'none' }} />
                            <span style={{ color: menu.config.accent || '#0F766E', fontSize: 10, fontWeight: 700 }}>₡3 500</span>
                          </div>
                        </div>
                        <div className="px-2 py-1.5 bg-white">
                          <p className="text-[11px] font-black text-gray-800 flex items-center gap-1">
                            {th.label} {menu.theme === th.id && <Check size={11} className="text-teal-600" />}
                          </p>
                          <p className="text-[9px] text-gray-400 leading-tight">{th.hint}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
                Color de marca
                <input type="color" value={menu.config.accent || '#0F766E'}
                  onChange={e => patchConfig({ accent: e.target.value })}
                  className="w-9 h-8 rounded border border-gray-200 cursor-pointer" />
              </label>
              {([
                ['show_photos', 'Fotos'],
                ['show_prices', 'Precios'],
                ['show_allergens', 'Alérgenos y dietas'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={(menu.config as any)[k] !== false}
                    onChange={e => patchConfig({ [k]: e.target.checked } as any)}
                    className="w-4 h-4 accent-teal-600" />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* Identidad */}
          <section className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-black text-gray-800 mb-3">Encabezado</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nombre" value={menu.header.name ?? ''} onChange={v => patchHeader({ name: v })} />
              <Field label="Lema" value={menu.header.tagline ?? ''} onChange={v => patchHeader({ tagline: v })}
                placeholder="Cocina casera desde 1998" />
              <ImageField label="Logo" value={menu.header.logo_url ?? ''}
                onChange={v => patchHeader({ logo_url: v })} tenantId={tenantId ?? ''} round />
              <ImageField label="Foto de portada" value={menu.header.cover_url ?? ''}
                onChange={v => patchHeader({ cover_url: v })} tenantId={tenantId ?? ''} />
              <Field label="Horario" value={menu.header.hours ?? ''} onChange={v => patchHeader({ hours: v })}
                placeholder="Lunes a sábado · 11 a. m. – 9 p. m." />
              <Field label="Teléfono" value={menu.header.phone ?? ''} onChange={v => patchHeader({ phone: v })} />
              <Field label="Dirección" value={menu.header.address ?? ''} onChange={v => patchHeader({ address: v })} />
              <Field label="Nota al pie" value={menu.config.note ?? ''} onChange={v => patchConfig({ note: v })}
                placeholder="Precios en colones, IVA incluido" />
            </div>
          </section>

          {/* Secciones y platos */}
          <section className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-gray-800">Secciones y platos</h2>
              <button onClick={() => setSections(s => [...s, { id: uid(), title: 'Nueva sección', note: '', product_ids: [] }])}
                className="inline-flex items-center gap-1 text-xs font-black text-teal-700 hover:text-teal-900">
                <Plus size={13} /> Sección
              </button>
            </div>

            {menu.sections.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-8">
                Agregá una sección (Entradas, Fondos, Bebidas) y metele los platos.
              </p>
            ) : (
              <div className="space-y-3">
                {menu.sections.map((sec, si) => (
                  <div key={sec.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <GripVertical size={14} className="text-gray-300 shrink-0" />
                      <input value={sec.title}
                        onChange={e => setSections(s => s.map((x, i) => i === si ? { ...x, title: e.target.value } : x))}
                        className="flex-1 min-w-0 bg-transparent font-black text-sm text-gray-800 outline-none" />
                      <span className="text-[10px] text-gray-400 shrink-0">{sec.product_ids.length}</span>
                      {/* Reordenar con flechas y no arrastrando: en una tablet de
                          salón, arrastrar entre secciones largas falla más de lo
                          que ayuda. */}
                      <button onClick={() => setSections(s => si > 0 ? swap(s, si, si - 1) : s)}
                        disabled={si === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-20"><ChevronUp size={14} /></button>
                      <button onClick={() => setSections(s => si < s.length - 1 ? swap(s, si, si + 1) : s)}
                        disabled={si === menu.sections.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-20"><ChevronDown size={14} /></button>
                      <button onClick={() => setSections(s => s.filter((_, i) => i !== si))}
                        className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>

                    <div className="p-2.5 space-y-1.5">
                      <input value={sec.note ?? ''}
                        onChange={e => setSections(s => s.map((x, i) => i === si ? { ...x, note: e.target.value } : x))}
                        placeholder="Nota de la sección (opcional)"
                        className="w-full text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 outline-none" />

                      {sec.product_ids.map((pid, pi) => {
                        const p = byId.get(pid);
                        return (
                          <div key={pid} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-100">
                            <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                              {p?.name ?? <span className="text-red-500 italic">Plato eliminado</span>}
                            </span>
                            {p && <span className="text-xs text-gray-400 tabular-nums shrink-0">{money(p.unit_price)}</span>}
                            <button onClick={() => setSections(s => s.map((x, i) => i === si
                              ? { ...x, product_ids: pi > 0 ? swap(x.product_ids, pi, pi - 1) : x.product_ids } : x))}
                              disabled={pi === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={12} /></button>
                            <button onClick={() => setSections(s => s.map((x, i) => i === si
                              ? { ...x, product_ids: x.product_ids.filter(y => y !== pid) } : x))}
                              className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                          </div>
                        );
                      })}

                      <button onClick={() => { setPickFor(pickFor === sec.id ? null : sec.id); setSearch(''); }}
                        className="w-full text-xs font-bold text-teal-700 border border-dashed border-teal-300 rounded-lg py-1.5 hover:bg-teal-50">
                        <Plus size={12} className="inline" /> Agregar platos
                      </button>

                      {pickFor === sec.id && (
                        <div className="border border-teal-200 bg-teal-50/40 rounded-lg p-2">
                          <div className="relative mb-1.5">
                            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                              placeholder="Buscar plato…"
                              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md" />
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {products
                              .filter(p => !sec.product_ids.includes(p.id))
                              .filter(p => !search.trim() || fuzzyMatch(search, p.name, p.sku ?? ''))
                              .slice(0, 40)
                              .map(p => (
                                <button key={p.id}
                                  onClick={() => setSections(s => s.map((x, i) => i === si
                                    ? { ...x, product_ids: [...x.product_ids, p.id] } : x))}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white text-left">
                                  <Plus size={11} className="text-teal-600 shrink-0" />
                                  <span className="flex-1 min-w-0 text-xs text-gray-800 truncate">{p.name}</span>
                                  {/* Ya usado en otra sección: se puede repetir,
                                      pero conviene saberlo antes de hacerlo. */}
                                  {inSomeSection.has(p.id) && (
                                    <span className="text-[9px] text-amber-600 font-bold shrink-0">ya está</span>
                                  )}
                                  <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{money(p.unit_price)}</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Enlace y QR */}
          <section className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-black text-gray-800 flex items-center gap-2 mb-3">
              <Link2 size={15} className="text-teal-600" /> Enlace y código QR
            </h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <label className="block text-xs font-bold text-gray-600">Dirección del menú</label>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-gray-400 shrink-0">/m/</span>
                  <input value={menu.slug}
                    onChange={e => patch({ slug: e.target.value })}
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-sm" />
                </div>
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  Si cambiás esto, <b>los QR ya impresos dejan de servir</b>. El código de abajo se
                  regenera, pero hay que volver a imprimirlo.
                </p>
                <div className="flex gap-2">
                  <a href={publicUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50">
                    <ExternalLink size={13} /> Abrir
                  </a>
                  <button onClick={() => { void navigator.clipboard?.writeText(publicUrl); setMsg('Enlace copiado'); setTimeout(() => setMsg(''), 2000); }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                    Copiar enlace
                  </button>
                </div>
                {menu.views ? (
                  <p className="text-[11px] text-gray-400">{menu.views} apertura(s) del menú</p>
                ) : null}
              </div>

              <div className="text-center shrink-0">
                {qr ? (
                  <>
                    <img src={qr} alt="Código QR del menú" className="w-36 h-36 mx-auto border border-gray-200 rounded-xl" />
                    <button onClick={downloadQr}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-white bg-gray-900 hover:bg-black rounded-lg px-3 py-1.5">
                      <Download size={13} /> Descargar PNG
                    </button>
                  </>
                ) : (
                  <div className="w-36 h-36 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300">
                    <QrCode size={32} />
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── Vista previa ───────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4">
          <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2 text-center">
            Así lo ve el cliente
          </p>
          {/* Marco de teléfono: el menú se lee en la mano, y a ancho completo
              de escritorio se ve bien algo que en el teléfono no cabe. */}
          <div className="mx-auto w-[330px] rounded-[2rem] border-8 border-gray-900 bg-gray-900 shadow-2xl overflow-hidden">
            <div className="h-5 bg-gray-900 flex items-center justify-center">
              <div className="w-16 h-1.5 rounded-full bg-gray-700" />
            </div>
            <div className="h-[560px] overflow-y-auto" style={{ background: t.page }}>
              <MenuRender
                theme={menu.theme}
                header={menu.header}
                config={menu.config}
                sections={previewSections}
                compact
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Intercambia dos posiciones sin mutar el arreglo original. */
function swap<T>(arr: T[], a: number, b: number): T[] {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/**
 * Campo de imagen: subir un archivo o pegar un enlace.
 *
 * Pedirle una URL a alguien que acaba de sacarle una foto al local con el
 * teléfono no tiene sentido — tendría que subirla a otro lado primero. El campo
 * de enlace se queda para quien ya tiene la imagen publicada.
 */
function ImageField({ label, value, onChange, tenantId, round = false }: {
  label: string; value: string; onChange: (v: string) => void;
  tenantId: string; round?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const upload = async (file?: File | null) => {
    if (!file) return;
    // 5 MB: una foto de teléfono moderno pesa más, y subirla entera hace que la
    // carta cargue lentísimo en el celular del cliente, que es donde importa.
    if (file.size > 5 * 1024 * 1024) {
      setErr('La imagen pesa más de 5 MB. Reducila antes de subirla.');
      return;
    }
    setBusy(true); setErr('');
    try {
      const url = await storageService.uploadImage('logos', tenantId, file, `menu_${Date.now()}`);
      onChange(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo subir');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        {value ? (
          <img src={value} alt=""
            className={`w-11 h-11 object-cover border border-gray-200 shrink-0 ${round ? 'rounded-full' : 'rounded-lg'}`} />
        ) : (
          <div className={`w-11 h-11 bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-gray-300 shrink-0 ${round ? 'rounded-full' : 'rounded-lg'}`}>
            <ImageIcon size={16} />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex gap-1.5">
            <label className={`inline-flex items-center gap-1 text-xs font-bold rounded-lg px-2.5 py-1.5 cursor-pointer ${
              busy ? 'bg-gray-100 text-gray-400' : 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100'
            }`}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {busy ? 'Subiendo…' : 'Subir'}
              <input type="file" accept="image/*" className="hidden" disabled={busy}
                onChange={e => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
            </label>
            {value && (
              <button onClick={() => onChange('')}
                className="text-xs font-bold text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
                Quitar
              </button>
            )}
          </div>
          <input value={value} onChange={e => onChange(e.target.value)}
            placeholder="…o pegá un enlace"
            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-[11px]" />
        </div>
      </div>
      {err && <p className="text-[11px] text-red-600 mt-1">{err}</p>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
    </div>
  );
}

export default MenuBuilder;
