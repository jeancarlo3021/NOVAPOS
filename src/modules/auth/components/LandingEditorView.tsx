'use client';

import React, { useEffect, useState } from 'react';
import {
  Globe, Save, Send, Plus, Trash2, Loader2, ExternalLink,
  Inbox, BarChart3, FileText, CheckCircle2, Star, ImagePlus, X, Sparkles,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * LA PÁGINA PÚBLICA, desde adentro.
 *
 * Tres cosas que son la misma conversación y por eso viven juntas:
 *   · Contenido   — qué dice la página (se edita y se publica aparte).
 *   · Interesados — quién escribió desde ahí.
 *   · Medición    — si la página sirve o no.
 *
 * Separar el BORRADOR de lo PUBLICADO no es un lujo: es una página que puede
 * estar leyendo un desconocido en este momento, y sin esa separación cada
 * letra a medio escribir —un precio a medio corregir— queda a la vista.
 */

type Pestana = 'contenido' | 'interesados' | 'medicion';

/**
 * UNA IMAGEN de la página: subirla, verla, quitarla.
 *
 * Se achica ANTES de subirla. Una foto de celular pesa entre tres y ocho
 * megas, y esa misma foto puesta en la página se la descarga cada visitante:
 * el ahorro no es de espacio en el servidor, es del tiempo de carga de la
 * persona que está decidiendo si te escribe. Se manda al servidor y no directo
 * al Storage por el mismo motivo que el logo del negocio: desde el navegador
 * depende de permisos del bucket, y cuando fallan el error no se entiende.
 */
const ImagenCampo: React.FC<{
  valor?: string; uso: string; etiqueta: string; onChange: (url: string) => void;
}> = ({ valor, uso, etiqueta, onChange }) => {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const achicar = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1400;
      const escala = Math.min(1, MAX / img.width);
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      const ctx = lienzo.getContext('2d');
      if (!ctx) return reject(new Error('No se pudo procesar la imagen'));
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      lienzo.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo convertir'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => reject(new Error('El archivo no parece una imagen'));
    img.src = URL.createObjectURL(file);
  });

  const elegir = async (file: File | undefined) => {
    if (!file) return;
    setSubiendo(true); setError('');
    try {
      const blob = await achicar(file);
      const b64: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
        fr.onerror = () => rej(new Error('No se pudo leer el archivo'));
        fr.readAsDataURL(blob);
      });
      const r = await apiFetch<any>('/admin/landing/imagen', {
        method: 'POST',
        body: JSON.stringify({ content_base64: b64, content_type: 'image/jpeg', uso }),
      }, 60000);
      onChange(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir');
    } finally { setSubiendo(false); }
  };

  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">{etiqueta}</label>
      {valor ? (
        <div className="relative inline-block">
          <img src={valor} alt="" className="h-28 w-44 object-cover rounded-xl border border-gray-200" />
          <button onClick={() => onChange('')} title="Quitar la imagen"
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-500 hover:text-red-600">
            <X size={13} />
          </button>
        </div>
      ) : (
        <label className="h-28 w-44 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-teal-400 text-gray-400">
          {subiendo ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          <span className="text-[11px] font-bold">{subiendo ? 'Subiendo…' : 'Agregar imagen'}</span>
          <input type="file" accept="image/*" className="hidden"
            onChange={e => void elegir(e.target.files?.[0])} />
        </label>
      )}
      {error && <p className="text-[11px] text-red-600 font-semibold mt-1">{error}</p>}
    </div>
  );
};

export const LandingEditorView: React.FC = () => {
  const [pestana, setPestana] = useState<Pestana>('contenido');
  const [b, setB] = useState<any>(null);
  const [sinPublicar, setSinPublicar] = useState(false);
  /** La migración 119 todavía no corrió: se avisa ANTES de que alguien escriba. */
  const [sinTabla, setSinTabla] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await apiFetch<any>('/admin/landing');
      setB(r.borrador); setSinPublicar(!!r.sin_publicar); setSinTabla(!!r.sin_tabla);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
    finally { setCargando(false); }
  };
  useEffect(() => { void cargar(); }, []);

  const set = (parche: any) => { setB((x: any) => ({ ...x, ...parche })); setSinPublicar(true); };

  const guardar = async () => {
    setGuardando(true); setError(''); setAviso('');
    try {
      await apiFetch('/admin/landing', { method: 'PUT', body: JSON.stringify(b) });
      setAviso('Borrador guardado. Todavía no se ve en la página.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const publicar = async () => {
    setGuardando(true); setError(''); setAviso('');
    try {
      await apiFetch('/admin/landing', { method: 'PUT', body: JSON.stringify(b) });
      await apiFetch('/admin/landing/publicar', { method: 'POST' });
      setSinPublicar(false);
      setAviso('Publicado. Ya está en colonclick.com.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo publicar'); }
    finally { setGuardando(false); }
  };

  if (cargando) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Cargando…</p>;
  if (!b) return <p className="text-sm text-red-600">{error || 'Sin datos'}</p>;

  const campo = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500';
  const etiqueta = 'block text-xs font-bold text-gray-600 mb-1';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Globe size={18} className="text-teal-600" /> Página pública
          </h2>
          <p className="text-sm text-gray-500">
            Lo que ve alguien que entra a colonclick.com sin tener cuenta.{' '}
            <a href="/?ver=1" target="_blank" rel="noreferrer"
              className="text-teal-700 font-bold inline-flex items-center gap-1">
              verla <ExternalLink size={11} />
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sinPublicar && (
            <span className="text-[11px] font-black uppercase bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
              cambios sin publicar
            </span>
          )}
          <button onClick={() => void guardar()} disabled={guardando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 disabled:opacity-50">
            <Save size={13} /> Guardar borrador
          </button>
          <button onClick={() => void publicar()} disabled={guardando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold disabled:bg-gray-300">
            {guardando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Publicar
          </button>
        </div>
      </div>

      {sinTabla && (
        <p className="text-sm font-bold text-amber-800 bg-amber-50 border-2 border-amber-300 rounded-xl px-3 py-2.5">
          Falta correr la migración <b>119_landing.sql</b>. Hasta entonces se puede escribir pero
          <b> no se va a poder guardar</b>, y la página pública muestra los textos de fábrica.
        </p>
      )}
      {aviso && <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{aviso}</p>}
      {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <div className="flex gap-1 border-b border-gray-200">
        {([['contenido', 'Contenido', FileText], ['interesados', 'Interesados', Inbox], ['medicion', 'Medición', BarChart3]] as const)
          .map(([id, texto, Icono]) => (
          <button key={id} onClick={() => setPestana(id as Pestana)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold border-b-2 -mb-px ${
              pestana === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icono size={14} /> {texto}
          </button>
        ))}
      </div>

      {pestana === 'contenido' && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-black text-gray-900">Lo primero que se lee</h3>
            <div><label className={etiqueta}>Título grande</label>
              <input className={campo} value={b.titulo ?? ''} onChange={e => set({ titulo: e.target.value })} /></div>
            <div><label className={etiqueta}>Texto debajo</label>
              <textarea className={campo} rows={2} value={b.bajada ?? ''} onChange={e => set({ bajada: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Texto del botón</label>
                <input className={campo} value={b.cta_texto ?? ''} onChange={e => set({ cta_texto: e.target.value })} /></div>
              <div><label className={etiqueta}>Marca</label>
                <input className={campo} value={b.marca ?? ''} onChange={e => set({ marca: e.target.value })} /></div>
            </div>
            <ImagenCampo etiqueta="Imagen de arriba (opcional)" uso="portada"
              valor={b.imagen} onChange={url => set({ imagen: url })} />
          </div>

          {/* Beneficios */}
          <Lista titulo="Por qué sirve" items={b.beneficios ?? []}
            onChange={(v) => set({ beneficios: v })}
            vacio={{ titulo: '', detalle: '' }}
            render={(it, cambiar) => (
              <>
                <input className={campo} placeholder="Título corto" value={it.titulo ?? ''}
                  onChange={e => cambiar({ ...it, titulo: e.target.value })} />
                <textarea className={campo} rows={2} placeholder="Una frase, concreta" value={it.detalle ?? ''}
                  onChange={e => cambiar({ ...it, detalle: e.target.value })} />
              </>
            )} />

          {/* LO QUE OFRECÉS — la parte editable de la fase 4. */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-black text-gray-900">Lo que ofrecés</h3>
            <p className="text-xs text-gray-500">
              Se escribe acá a mano, a propósito: los planes del sistema incluyen los
              «Demo · &lt;negocio&gt;» de cada cliente, y publicarlos tal cual mostraría los
              nombres de tus clientes en internet.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Título de la sección</label>
                <input className={campo} value={b.productos_titulo ?? ''} placeholder="Planes"
                  onChange={e => set({ productos_titulo: e.target.value })} /></div>
              <div><label className={etiqueta}>Texto debajo</label>
                <input className={campo} value={b.productos_bajada ?? ''} placeholder="Pagás por mes, sin contrato."
                  onChange={e => set({ productos_bajada: e.target.value })} /></div>
            </div>
          </div>

          <Lista titulo="Productos y planes" items={b.productos ?? []}
            onChange={(v) => set({ productos: v })}
            vacio={{ nombre: '', precio: '', precio_anual: '', ahorro: '', descripcion: '', incluye: [], destacado: false, imagen: '' }}
            render={(it, cambiar, indice) => (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input className={campo} placeholder="Nombre (Básico, Completo…)" value={it.nombre ?? ''}
                    onChange={e => cambiar({ ...it, nombre: e.target.value })} />
                  <input className={campo} placeholder="Precio mensual (₡15.000/mes)" value={it.precio ?? ''}
                    onChange={e => cambiar({ ...it, precio: e.target.value })} />
                </div>
                {/* El anual es OPCIONAL. Un plan sin él no aparece cuando el
                    visitante mira la vista anual; se le dice «solo por mes»
                    en vez de repetirle el precio mensual con otra etiqueta. */}
                <div className="grid grid-cols-2 gap-2">
                  <input className={campo} placeholder="Precio anual (₡150.000/año) — opcional"
                    value={it.precio_anual ?? ''}
                    onChange={e => cambiar({ ...it, precio_anual: e.target.value })} />
                  <input className={campo} placeholder="Ahorro (Ahorrás ₡30.000)"
                    value={it.ahorro ?? ''}
                    onChange={e => cambiar({ ...it, ahorro: e.target.value })} />
                </div>
                <RellenarConIA it={it} cambiar={cambiar} />
                <input className={campo} placeholder="Para quién es, en una línea" value={it.descripcion ?? ''}
                  onChange={e => cambiar({ ...it, descripcion: e.target.value })} />
                <textarea className={campo} rows={3} placeholder={'Qué incluye, uno por renglón'}
                  value={(it.incluye ?? []).join('\n')}
                  onChange={e => cambiar({ ...it, incluye: e.target.value.split('\n').filter(x => x.trim()) })} />
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <ImagenCampo etiqueta="Imagen (opcional)" uso={`producto-${indice}`}
                    valor={it.imagen} onChange={url => cambiar({ ...it, imagen: url })} />
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-600 pb-2">
                    <input type="checkbox" checked={!!it.destacado}
                      onChange={e => cambiar({ ...it, destacado: e.target.checked })} />
                    <Star size={12} className="text-amber-500" /> Marcarlo como «más pedido»
                  </label>
                </div>
              </>
            )} />

          {/* EL CATÁLOGO: lo que se compra una vez. */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-black text-gray-900">Catálogo (pago único)</h3>
            <p className="text-xs text-gray-500">
              Equipo, accesorios y servicios que se compran una vez: una impresora, una gaveta,
              la puesta en marcha. Van en su propia sección para no competir con la decisión
              de elegir plan.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={etiqueta}>Título</label>
                <input className={campo} value={b.catalogo_titulo ?? ''} placeholder="Catálogo"
                  onChange={e => set({ catalogo_titulo: e.target.value })} /></div>
              <div><label className={etiqueta}>Texto debajo</label>
                <input className={campo} value={b.catalogo_bajada ?? ''}
                  placeholder="Equipo y servicios que se compran una vez."
                  onChange={e => set({ catalogo_bajada: e.target.value })} /></div>
            </div>
          </div>

          <Lista titulo="Artículos del catálogo" items={b.catalogo ?? []}
            onChange={(v) => set({ catalogo: v })}
            vacio={{ nombre: '', precio: '', descripcion: '', imagen: '' }}
            render={(it, cambiar, indice) => (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input className={campo} placeholder="Nombre (Impresora térmica 80mm)"
                    value={it.nombre ?? ''}
                    onChange={e => cambiar({ ...it, nombre: e.target.value })} />
                  <input className={campo} placeholder="Precio (₡85.000)" value={it.precio ?? ''}
                    onChange={e => cambiar({ ...it, precio: e.target.value })} />
                </div>
                <input className={campo} placeholder="Para qué sirve, en una línea"
                  value={it.descripcion ?? ''}
                  onChange={e => cambiar({ ...it, descripcion: e.target.value })} />
                <ImagenCampo etiqueta="Foto (opcional)" uso={`catalogo-${indice}`}
                  valor={it.imagen} onChange={url => cambiar({ ...it, imagen: url })} />
              </>
            )} />

          {/* LOGOS DE CLIENTES.
              Opt-in y nunca automático: publicar la marca de un negocio en
              internet es decisión de ese negocio, no nuestra. Acá se listan
              los que existen y se marca cuáles salen. */}
          <LogosClientes
            elegidos={b.clientes ?? []}
            titulo={b.clientes_titulo ?? ''}
            onTitulo={(v) => set({ clientes_titulo: v })}
            onChange={(v) => set({ clientes: v })} />

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-black text-gray-900">Contacto y pie</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={etiqueta}>Teléfono</label>
                <input className={campo} value={b.contacto?.telefono ?? ''}
                  onChange={e => set({ contacto: { ...(b.contacto ?? {}), telefono: e.target.value } })} /></div>
              <div><label className={etiqueta}>Correo</label>
                <input className={campo} value={b.contacto?.correo ?? ''}
                  onChange={e => set({ contacto: { ...(b.contacto ?? {}), correo: e.target.value } })} /></div>
              <div><label className={etiqueta}>WhatsApp (con 506)</label>
                <input className={campo} value={b.contacto?.whatsapp ?? ''} placeholder="50688888888"
                  onChange={e => set({ contacto: { ...(b.contacto ?? {}), whatsapp: e.target.value } })} /></div>
            </div>
            <div><label className={etiqueta}>Pie de página</label>
              <input className={campo} value={b.pie ?? ''} onChange={e => set({ pie: e.target.value })} /></div>
          </div>
        </div>
      )}

      {pestana === 'interesados' && <Interesados />}
      {pestana === 'medicion' && <Medicion />}
    </div>
  );
};

/**
 * RELLENAR LA FICHA DESDE EL PLAN REAL.
 *
 * Escribir a mano qué incluye cada plan es lo que hace que la página quede a
 * medio llenar y, peor, desactualizada: lo que incluye un plan cambia cada vez
 * que se toca en Planes, y la página se queda con lo de antes.
 *
 * Los puntos NO los escribe un modelo: salen de los módulos que el plan tiene
 * activos hoy. En una página de precios eso no es un detalle — un modelo
 * escribiendo libremente agrega una función que no existe y el negocio termina
 * prometiendo algo que no entrega.
 *
 * No pisa nada sin avisar: muestra lo que encontró y se aplica si se acepta.
 */
const RellenarConIA: React.FC<{ it: any; cambiar: (n: any) => void }> = ({ it, cambiar }) => {
  const [cargando, setCargando] = useState(false);
  const [prop, setProp] = useState<any>(null);
  const [error, setError] = useState('');

  const pedir = async () => {
    if (!String(it.nombre ?? '').trim()) { setError('Escribí primero el nombre del plan.'); return; }
    setCargando(true); setError(''); setProp(null);
    try {
      const r = await apiFetch<any>('/ia/landing-articulo', {
        method: 'POST', body: JSON.stringify({ nombre: it.nombre }),
      }, 30000);
      const d = r?.datos ?? r;
      if (!d?.encontrado) { setError(d?.aviso_vacio ?? 'No encontré ese plan.'); return; }
      setProp(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar');
    } finally { setCargando(false); }
  };

  const aplicar = () => {
    cambiar({
      ...it,
      descripcion: prop.descripcion || it.descripcion,
      incluye: prop.incluye?.length ? prop.incluye : it.incluye,
      precio: it.precio || prop.precio_sugerido || '',
    });
    setProp(null);
  };

  return (
    <div>
      <button onClick={() => void pedir()} disabled={cargando}
        className="flex items-center gap-1.5 text-xs font-bold text-violet-700 hover:text-violet-900 disabled:text-gray-400">
        {cargando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        Rellenar desde el plan real
      </button>
      {error && <p className="text-[11px] text-amber-700 font-semibold mt-1">{error}</p>}
      {prop && (
        <div className="mt-2 bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs space-y-2">
          <p className="font-bold text-violet-900">Plan «{prop.plan}»</p>
          <p className="text-violet-800">{prop.descripcion}</p>
          <p className="text-violet-700">
            <b>{prop.incluye.length} módulos:</b> {prop.incluye.slice(0, 6).join(' · ')}
            {prop.incluye.length > 6 ? ` y ${prop.incluye.length - 6} más` : ''}
          </p>
          {prop.precio_sugerido && <p className="text-violet-700">Precio configurado: <b>{prop.precio_sugerido}</b></p>}
          <p className="text-[10px] text-violet-500">{prop.fuente}</p>
          <div className="flex gap-2 pt-1">
            <button onClick={aplicar}
              className="px-2.5 py-1 rounded-lg bg-violet-600 text-white font-bold">Usar esto</button>
            <button onClick={() => setProp(null)}
              className="px-2.5 py-1 rounded-lg border border-violet-200 text-violet-700 font-bold">Dejarlo como está</button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * ELEGIR QUÉ LOGOS DE CLIENTES SE PUBLICAN.
 *
 * El sistema tiene el logo de cada negocio porque lo usa en sus tiquetes y
 * facturas. Eso NO es permiso para ponerlo en nuestra página de ventas: una
 * cosa es que su logo salga en su propia factura y otra que lo usemos para
 * vender. Por eso ninguno está marcado por omisión y el aviso lo dice.
 */
const LogosClientes: React.FC<{
  elegidos: Array<{ nombre: string; logo: string }>;
  titulo: string;
  onTitulo: (v: string) => void;
  onChange: (v: Array<{ nombre: string; logo: string }>) => void;
}> = ({ elegidos, titulo, onTitulo, onChange }) => {
  const [disponibles, setDisponibles] = useState<any[] | null>(null);
  useEffect(() => {
    void (async () => {
      try { setDisponibles((await apiFetch<any>('/admin/landing/logos')).logos ?? []); }
      catch { setDisponibles([]); }
    })();
  }, []);

  const esta = (logo: string) => elegidos.some(x => x.logo === logo);
  const alternar = (l: any) => onChange(esta(l.logo)
    ? elegidos.filter(x => x.logo !== l.logo)
    : [...elegidos, { nombre: l.nombre, logo: l.logo }]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-black text-gray-900">Logos de clientes</h3>
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <b>Preguntales antes.</b> Tenemos su logo porque lo usan en sus propias facturas; eso no
        es lo mismo que autorizarnos a usarlo para vender. Ninguno sale publicado hasta que lo
        marques acá.
      </p>
      <div>
        <label className="block text-xs font-bold text-gray-600 mb-1">Título de la franja</label>
        <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
          value={titulo} placeholder="Negocios que ya facturan con ColónClick"
          onChange={e => onTitulo(e.target.value)} />
      </div>
      {disponibles === null ? (
        <p className="text-xs text-gray-400 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Buscando logos…
        </p>
      ) : disponibles.length === 0 ? (
        <p className="text-xs text-gray-500">Ningún negocio tiene logo cargado todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {disponibles.map(l => {
            const on = esta(l.logo);
            return (
              <button key={l.logo} onClick={() => alternar(l)} title={l.nombre}
                className={`border-2 rounded-xl p-2 flex flex-col items-center gap-1 ${
                  on ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <img src={l.logo} alt="" className="h-9 w-full object-contain"
                  style={{ filter: on ? 'none' : 'grayscale(1)', opacity: on ? 1 : .5 }} />
                <span className={`text-[10px] font-bold truncate w-full ${on ? 'text-teal-800' : 'text-gray-500'}`}>
                  {l.nombre}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        {elegidos.length === 0
          ? 'Sin ninguno marcado, la franja no aparece en la página.'
          : `${elegidos.length} se van a mostrar, en escala de grises y a color al pasar el mouse.`}
      </p>
    </div>
  );
};

/** Una lista editable de cosas: agregar, quitar, reordenar por orden de carga. */
function Lista<T>({ titulo, items, onChange, vacio, render }: {
  titulo: string; items: T[]; onChange: (v: T[]) => void; vacio: T;
  render: (it: any, cambiar: (nuevo: T) => void, indice: number) => React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-900">{titulo}</h3>
        <button onClick={() => onChange([...items, { ...vacio }])}
          className="flex items-center gap-1 text-xs font-bold text-teal-700">
          <Plus size={13} /> Agregar
        </button>
      </div>
      {items.length === 0 && <p className="text-xs text-gray-400">Nada todavía. Esta sección no aparece en la página si queda vacía.</p>}
      {items.map((it, i) => (
        <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 relative bg-gray-50/50">
          <button onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="absolute top-2 right-2 text-gray-300 hover:text-red-500" title="Quitar">
            <Trash2 size={14} />
          </button>
          {render(it, (nuevo) => onChange(items.map((x, j) => (j === i ? nuevo : x))), i)}
        </div>
      ))}
    </div>
  );
}

/** La bandeja: quién escribió desde la página. */
const Interesados: React.FC = () => {
  const [filas, setFilas] = useState<any[] | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch<any>('/admin/landing/interesados');
        setSinTabla(!!r.sin_tabla); setFilas(r.interesados ?? []);
      } catch { setFilas([]); }
    })();
  }, []);
  const mover = async (id: string, status: string) => {
    setFilas(f => (f ?? []).map(x => (x.id === id ? { ...x, status } : x)));
    try { await apiFetch(`/admin/landing/interesados/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }); } catch { /* vuelve al recargar */ }
  };
  if (filas === null) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>;
  if (sinTabla) return <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Falta correr la migración 119.</p>;
  if (filas.length === 0) return <p className="text-sm text-gray-500">Todavía no escribió nadie desde la página.</p>;

  const COLOR: Record<string, string> = {
    nuevo: 'bg-blue-100 text-blue-700', contactado: 'bg-amber-100 text-amber-700',
    convertido: 'bg-emerald-100 text-emerald-700', descartado: 'bg-gray-200 text-gray-500',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
          <tr>
            <th className="text-left px-4 py-2 font-bold">Quién</th>
            <th className="text-left px-4 py-2 font-bold">Contacto</th>
            <th className="text-left px-4 py-2 font-bold">Qué vende</th>
            <th className="text-left px-4 py-2 font-bold">Cuándo</th>
            <th className="text-left px-4 py-2 font-bold">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filas.map(f => (
            <tr key={f.id}>
              <td className="px-4 py-2">
                <span className="font-bold text-gray-800">{f.contact_name}</span>
                {f.business_name && <span className="block text-xs text-gray-500">{f.business_name}</span>}
                {f.notes && <span className="block text-[11px] text-gray-400 max-w-xs truncate" title={f.notes}>{f.notes}</span>}
              </td>
              <td className="px-4 py-2 text-xs text-gray-600">
                {f.phone && <a href={`https://wa.me/${String(f.phone).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="block text-teal-700 font-bold">{f.phone}</a>}
                {f.email && <span className="block">{f.email}</span>}
              </td>
              <td className="px-4 py-2 text-xs text-gray-600">{f.business_type ?? '—'}</td>
              <td className="px-4 py-2 text-xs text-gray-500">{new Date(f.created_at).toLocaleDateString('es-CR')}</td>
              <td className="px-4 py-2">
                <select value={f.status} onChange={e => void mover(f.id, e.target.value)}
                  className={`text-[11px] font-black uppercase px-2 py-1 rounded-full border-0 ${COLOR[f.status] ?? ''}`}>
                  {['nuevo', 'contactado', 'convertido', 'descartado'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** La fase 5: si la página sirve o no. */
const Medicion: React.FC = () => {
  const [d, setD] = useState<any>(null);
  const [dias, setDias] = useState(30);
  useEffect(() => {
    void (async () => {
      try { setD(await apiFetch<any>(`/admin/landing/estadisticas?dias=${dias}`)); } catch { setD({ totales: {} }); }
    })();
  }, [dias]);
  if (!d) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando…</p>;
  if (d.sin_tabla) return <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Falta correr la migración 119.</p>;

  const visitas = d.totales?.visita ?? 0;
  const formularios = d.totales?.formulario ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {[7, 30, 90].map(n => (
          <button key={n} onClick={() => setDias(n)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${dias === n ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {n} días
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ['Visitas', visitas, 'Cuánta gente abrió la página.'],
          ['Escribieron', formularios, 'Cuántos dejaron sus datos.'],
          ['De cada 100', d.conversion != null ? `${d.conversion}%` : '—', 'Es el número que dice si la página convence.'],
        ].map(([t, v, nota]) => (
          <div key={String(t)} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500">{t}</p>
            <p className="text-2xl font-black text-gray-900 tabular-nums">{v}</p>
            <p className="text-[11px] text-gray-400 mt-1 leading-snug">{nota}</p>
          </div>
        ))}
      </div>
      {visitas > 0 && formularios === 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Entró gente y nadie escribió. Eso no se arregla con más visitas: es la página la que no
          está convenciendo, o el formulario está muy abajo.
        </p>
      )}
      {(d.origenes ?? []).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-black text-gray-900 mb-2">De dónde llegan</h3>
          {d.origenes.map((o: any) => (
            <div key={o.origen} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
              <span className="text-gray-700">{o.origen}</span>
              <span className="font-bold tabular-nums text-gray-900">{o.visitas}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
        <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
        Se cuenta por día, sin guardar IP, sesión ni recorrido de nadie: para decidir alcanza
        con el total, y juntar datos de visitantes es juntar algo que después hay que cuidar.
      </p>
    </div>
  );
};

export default LandingEditorView;
