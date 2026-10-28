'use client';

import React, { useEffect, useState } from 'react';
import { X, Package, Search, RefreshCw, Download } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ProdRow {
  id: string; name: string; sku?: string; sku2?: string | null;
  unit_price?: number; cost_price?: number; stock_quantity?: number; tracks_stock?: boolean;
  cabys_code?: string | null; iva_rate?: number | null;
  category?: string | null; unit_type?: string | null; supplier?: string | null;
  created_at?: string;
}

/* Miles con PUNTO: `toLocaleString('es-CR')` mete un espacio fino —«2 400»—
   que no es como se escribe un número acá, y en el CSV ni se ve. */
const miles = (n?: number) =>
  Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fmt = (n?: number) => `₡${miles(n)}`;

export const TenantProductsModal: React.FC<{ owner: any; onClose: () => void }> = ({ owner, onClose }) => {
  const [rows, setRows] = useState<ProdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  /**
   * Paginación DEL SERVIDOR, no de la pantalla.
   *
   * La base devuelve 1000 filas como máximo por respuesta: un catálogo de 5.000
   * productos se veía como «1000 producto(s)» y parecía que la importación había
   * fallado. Ahora se pide una página a la vez y el servidor dice cuántos hay en
   * total, así el número que se muestra es el de verdad.
   */
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  /** Búsqueda aplicada (con retardo): buscar en el servidor en cada tecla sería una consulta por letra. */
  const [busqueda, setBusqueda] = useState('');
  /** Avance de la exportación completa: `null` cuando no se está bajando nada. */
  const [bajando, setBajando] = useState<{ hechos: number; total: number } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setBusqueda(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (busqueda) qs.set('search', busqueda);
      const r = await apiFetch<{ products: ProdRow[]; total?: number }>(
        `/admin/tenants/${owner.id}/products?${qs.toString()}`);
      setRows(r?.products ?? []);
      setTotal(Number(r?.total ?? r?.products?.length ?? 0));
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar productos'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [owner.id, page, busqueda]);

  // El filtrado ya lo hizo el servidor: la página que llegó es la que se muestra.
  const filtered = rows;
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);

  /**
   * LAS COLUMNAS SON LAS MISMAS QUE LEE LA CARGA MASIVA.
   *
   * Así el archivo que sale de acá se puede volver a cargar —en este negocio o
   * en otro— sin tocarle los encabezados: exportar es también la forma de
   * mover un catálogo, o de corregirlo en Excel y subirlo de nuevo.
   */
  const CABECERA = ['Nombre', 'SKU', 'SKU2', 'Precio', 'Costo', 'Stock', 'Categoria', 'Unidad', 'Proveedor', 'CABYS', 'IVA'];

  const aFila = (p: ProdRow) => [
    (p.name ?? '').replace(/;/g, ','), p.sku ?? '', p.sku2 ?? '',
    String(p.unit_price ?? 0), String(p.cost_price ?? 0),
    p.tracks_stock === false ? '∞' : String(p.stock_quantity ?? 0),
    (p.category ?? '').replace(/;/g, ','), (p.unit_type ?? '').replace(/;/g, ','), (p.supplier ?? '').replace(/;/g, ','),
    p.cabys_code ?? '', String(p.iva_rate ?? ''),
  ].join(';');

  const bajarCsv = (productos: ProdRow[], sufijo = '') => {
    const csv = '﻿' + [CABECERA.join(';'), ...productos.map(aFila)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `productos-${owner.name ?? owner.id}${sufijo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Solo lo que está en pantalla. Queda para cuando se revisa una página. */
  const exportCSV = () => bajarCsv(filtered, ` (pagina ${page})`);

  /**
   * EL CATÁLOGO COMPLETO.
   *
   * Antes solo se podía bajar la página que se veía: cien productos de cinco
   * mil, y sin aviso de que el resto no estaba en el archivo. Quien quería
   * revisar una carga en Excel, o pasar el catálogo a otro negocio, tenía que
   * bajar cincuenta archivos y pegarlos.
   *
   * Va por páginas de 1.000 —el tope que la base devuelve por respuesta— y
   * muestra el avance, porque con cinco mil productos son varios segundos y un
   * botón que no responde parece roto. Si hay una búsqueda puesta, exporta lo
   * que la búsqueda encuentra: es lo que la pantalla está mostrando.
   */
  const exportarTodo = async () => {
    const TAMANO = 1000;
    const TOPE_PAGINAS = 100;   // 100.000 productos: cualquier cosa más es un error
    setBajando({ hechos: 0, total });
    setError('');
    const todos: ProdRow[] = [];
    const vistos = new Set<string>();
    try {
      for (let pag = 1; pag <= TOPE_PAGINAS; pag++) {
        const qs = new URLSearchParams({ page: String(pag), page_size: String(TAMANO) });
        if (busqueda) qs.set('search', busqueda);
        const r = await apiFetch<{ products: ProdRow[]; total?: number }>(
          `/admin/tenants/${owner.id}/products?${qs.toString()}`);
        const lote = r?.products ?? [];
        if (lote.length === 0) break;
        /* Sin el `id` repetido: si alguien crea un producto mientras se baja,
           las páginas se corren y una fila podría venir dos veces. */
        for (const p of lote) {
          if (p.id && vistos.has(p.id)) continue;
          if (p.id) vistos.add(p.id);
          todos.push(p);
        }
        setBajando({ hechos: todos.length, total: Number(r?.total ?? total) });
        if (lote.length < TAMANO) break;
      }
      if (todos.length === 0) { setError('No se pudo bajar ningún producto.'); return; }
      bajarCsv(todos, busqueda ? ` (${busqueda})` : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al exportar el catálogo');
    } finally {
      setBajando(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-emerald-600" />
            <div>
              <h2 className="font-black text-gray-900">Productos cargados</h2>
              <p className="text-xs text-gray-400">
                {owner.name} · {miles(total)} producto(s)
                {busqueda && ' encontrados'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* La fila se parte en teléfono: con tres controles y el buscador no
            caben en 390px, y el último botón quedaba fuera de la pantalla. */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU…"
              className="w-full pl-9 pr-3 h-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          {/* EXPORTAR TODO es el botón principal: casi nunca se quiere la
              página suelta, y antes era lo único que había. El de la página
              queda al lado, chiquito, para cuando se está revisando una. */}
          <button onClick={() => void exportarTodo()} disabled={total === 0 || !!bajando}
            className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 shrink-0">
            <Download size={14} />
            {bajando
              ? `Bajando ${miles(bajando.hechos)} de ${miles(bajando.total)}…`
              : <>CSV de {miles(total)}{busqueda ? ' encontrados' : ' productos'}</>}
          </button>
          <button onClick={exportCSV} disabled={filtered.length === 0 || !!bajando}
            title={`Solo los ${filtered.length} de esta página`}
            className="flex items-center gap-1.5 px-2.5 h-10 rounded-xl border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 disabled:opacity-50 shrink-0">
            esta página
          </button>
          <button onClick={load} aria-label="Volver a cargar" className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><RefreshCw size={18} className="animate-spin" /> Cargando…</div>
          ) : error ? (
            <div className="m-5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">Sin productos.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-[11px] font-bold text-gray-500 uppercase border-b border-gray-100">
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-4 py-2">SKU / SKU2</th>
                  <th className="px-4 py-2 text-right">Precio</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                  <th className="px-4 py-2">Categoría</th>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2">CABYS · IVA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 font-semibold text-gray-800">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-gray-500 text-xs">{p.sku || '—'}{p.sku2 ? ` / ${p.sku2}` : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(p.unit_price)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.tracks_stock === false ? '∞' : (p.stock_quantity ?? 0)}</td>
                    <td className="px-4 py-2 text-gray-600">{p.category ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{p.supplier ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.cabys_code || '—'} · {p.iva_rate ?? 13}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 shrink-0 flex-wrap">
          <span className="text-xs font-bold text-gray-500">
            {total > 0 ? `${miles(desde)}–${miles(hasta)} de ${miles(total)}` : 'Sin productos'}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 disabled:opacity-40">
              Anterior
            </button>
            <span className="text-xs font-black text-gray-600 tabular-nums px-1">
              {page} / {paginas}
            </span>
            <button onClick={() => setPage(p => Math.min(paginas, p + 1))} disabled={page >= paginas || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 disabled:opacity-40">
              Siguiente
            </button>
            <button onClick={onClose} className="px-4 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantProductsModal;
