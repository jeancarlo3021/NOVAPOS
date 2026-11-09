'use client';

import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, Truck, Bike, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { MANAGER_ROLES } from '@/types/Types_Users';

const PLATFORMS: { key: string; label: string; emoji: string }[] = [
  { key: 'uber_pct', label: 'Uber', emoji: '🟢' },
  { key: 'didi_pct', label: 'Didi', emoji: '🟠' },
  { key: 'pedidosya_pct', label: 'PedidosYa', emoji: '🔴' },
  { key: 'otro_pct', label: 'Otro', emoji: '📦' },
];

export const DeliverySettings: React.FC = () => {
  const { settings, updateSettings, loading } = useSettings('delivery');
  const { user } = useAuth();
  const isManager = MANAGER_ROLES.includes((user?.role ?? '') as any);
  const [form, setForm] = useState<Record<string, string>>({ uber_pct: '', didi_pct: '', pedidosya_pct: '', otro_pct: '' });
  const [success, setSuccess] = useState(false);

  /**
   * ── REPARTO PROPIO ──────────────────────────────────────────────────────
   *
   * Otra cosa que el delivery de plataformas: acá el muchacho sale en moto,
   * cobra el domicilio y vuelve con la plata. Entra a la caja como cualquier
   * venta, y lo que hace falta es poder separarlo del precio de la comida.
   *
   * El cobro se hace con un ARTÍCULO del catálogo («Entrega a domicilio»),
   * no con un campo suelto: así sale en el tiquete del cliente, funciona con
   * factura electrónica —lleva su CAByS— y el reporte se arma de las mismas
   * líneas que ve el cliente, sin un total paralelo que pueda contradecirlas.
   */
  const [productos, setProductos] = useState<Array<{ id: string; name: string; unit_price?: number }>>([]);
  const [productoId, setProductoId] = useState('');
  const [tarifas, setTarifas] = useState<Array<{ nombre: string; monto: number }>>([]);
  const [repartidores, setRepartidores] = useState<string[]>([]);
  const [nuevoRep, setNuevoRep] = useState('');

  useEffect(() => {
    /* Solo servicios y productos sin stock: el domicilio no es mercadería, y
       ofrecer el catálogo entero haría buscar entre miles. */
    apiFetch<any>('/products?limit=300&search=')
      .then(r => setProductos(((r?.products ?? r ?? []) as any[])
        .map(p => ({ id: p.id, name: p.name, unit_price: p.unit_price }))))
      .catch(() => setProductos([]));
  }, []);

  useEffect(() => {
    if (settings) {
      setForm({
        uber_pct: String((settings as any).uber_pct ?? ''),
        didi_pct: String((settings as any).didi_pct ?? ''),
        pedidosya_pct: String((settings as any).pedidosya_pct ?? ''),
        otro_pct: String((settings as any).otro_pct ?? ''),
      });
      setProductoId(String((settings as any).reparto_producto_id ?? ''));
      setTarifas(Array.isArray((settings as any).reparto_tarifas) ? (settings as any).reparto_tarifas : []);
      setRepartidores(Array.isArray((settings as any).reparto_repartidores) ? (settings as any).reparto_repartidores : []);
    }
  }, [settings]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      uber_pct: parseFloat(form.uber_pct) || 0,
      didi_pct: parseFloat(form.didi_pct) || 0,
      pedidosya_pct: parseFloat(form.pedidosya_pct) || 0,
      otro_pct: parseFloat(form.otro_pct) || 0,
      reparto_producto_id: productoId || null,
      reparto_tarifas: tarifas.filter(t => t.nombre.trim()).map(t => ({ nombre: t.nombre.trim(), monto: Number(t.monto) || 0 })),
      reparto_repartidores: repartidores.filter(Boolean),
    });
    setSuccess(true); setTimeout(() => setSuccess(false), 1500);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Truck size={24} className="text-orange-600" /> Delivery</h2>
        <p className="text-gray-500 text-sm">Comisión (%) que cada plataforma te descuenta. Se aplica automáticamente al cobrar una venta por delivery.</p>
      </div>

      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-2 text-sm">
          <CheckCircle size={16} /> Guardado
        </div>
      )}

      <form onSubmit={save} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {PLATFORMS.map(p => (
          <div key={p.key} className="flex items-center justify-between gap-4">
            <label className="font-bold text-gray-700 flex items-center gap-2">{p.emoji} {p.label}</label>
            <div className="relative w-32">
              <input type="number" min="0" max="100" step="0.5"
                value={form[p.key]} onChange={e => setForm(f => ({ ...f, [p.key]: e.target.value }))}
                disabled={!isManager || loading} placeholder="0"
                className="w-full text-right pr-7 pl-3 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400 disabled:bg-gray-100" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-gray-400">Al elegir la plataforma en el cobro, se resta este % del total y se muestra el neto. La venta no se suma al cierre de caja.</p>
      </form>

      {/* ── Reparto propio ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div>
          <h3 className="font-black text-gray-900 flex items-center gap-2"><Bike size={18} className="text-emerald-600" /> Reparto propio</h3>
          <p className="text-gray-500 text-sm">
            El domicilio que cobra tu repartidor. A diferencia de las plataformas, esta plata <b>sí entra a la caja</b> y
            se ve aparte en el cierre y en el reporte de reparto.
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Con qué artículo se cobra el domicilio</label>
          <select value={productoId} onChange={e => setProductoId(e.target.value)} disabled={!isManager}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-100">
            <option value="">— elegir un artículo del catálogo —</option>
            {productos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Creá en Inventario un servicio tipo «Entrega a domicilio» (sin control de existencias y con su CAByS) y
            elegilo acá. Va como una línea más en el tiquete: es lo que hace que funcione con factura electrónica y
            que el reporte y el cliente vean el mismo número.
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Tarifas por zona o distancia</label>
          <p className="text-xs text-gray-500 mb-2">
            El cobro cambia según lo lejos que sea. Se eligen al cobrar, en vez de teclear el monto de memoria —y el
            reporte después puede decir cuánto se movió hacia cada zona—. Igual se puede escribir otro monto.
          </p>
          <div className="space-y-2">
            {tarifas.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input value={t.nombre} disabled={!isManager}
                  onChange={e => setTarifas(ts => ts.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                  placeholder="Ej. Centro · Barrio X · Hasta 3 km"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                <input type="number" min="0" value={t.monto} disabled={!isManager}
                  onChange={e => setTarifas(ts => ts.map((x, j) => j === i ? { ...x, monto: Number(e.target.value) || 0 } : x))}
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm text-right font-black" />
                <button type="button" onClick={() => setTarifas(ts => ts.filter((_, j) => j !== i))}
                  disabled={!isManager} className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setTarifas(ts => [...ts, { nombre: '', monto: 0 }])}
              disabled={!isManager} className="text-xs font-black text-emerald-700 flex items-center gap-1">
              <Plus size={13} /> Agregar tarifa
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Repartidores</label>
          <p className="text-xs text-gray-500 mb-2">
            Para poder decir quién hizo cuántos viajes. Sin esto el reporte solo cuenta plata.
          </p>
          <div className="flex gap-2 flex-wrap mb-2">
            {repartidores.map(r => (
              <span key={r} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                {r}
                <button type="button" onClick={() => setRepartidores(rs => rs.filter(x => x !== r))}
                  disabled={!isManager} className="text-emerald-500 hover:text-red-600">×</button>
              </span>
            ))}
            {repartidores.length === 0 && <span className="text-xs text-gray-400">Todavía no hay.</span>}
          </div>
          <div className="flex gap-2">
            <input value={nuevoRep} onChange={e => setNuevoRep(e.target.value)} disabled={!isManager}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const n = nuevoRep.trim();
                if (n && !repartidores.includes(n)) setRepartidores(rs => [...rs, n]);
                setNuevoRep('');
              }}
              placeholder="Nombre del repartidor"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <button type="button" disabled={!isManager || !nuevoRep.trim()}
              onClick={() => {
                const n = nuevoRep.trim();
                if (n && !repartidores.includes(n)) setRepartidores(rs => [...rs, n]);
                setNuevoRep('');
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 disabled:bg-gray-200 text-white text-sm font-black">
              Agregar
            </button>
          </div>
        </div>

        <button type="button" onClick={e => save(e as any)} disabled={loading || !isManager}
          className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-2.5 px-6 rounded-lg flex items-center gap-2">
          <Save size={16} /> Guardar
        </button>
      </div>
    </div>
  );
};

export default DeliverySettings;
