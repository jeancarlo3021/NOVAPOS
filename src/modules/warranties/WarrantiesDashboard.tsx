import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Home, Plus, Search, Loader2, RefreshCw, X, Save, AlertCircle,
  CheckCircle2, Camera, Truck, Clock, Phone, Trash2, History, PackageSearch,
} from 'lucide-react';
import { useTenantId } from '@/hooks/useTenant';
import { storageService } from '@/services/storage/storageService';
import {
  warrantiesService, type Warranty, type WarrantyStatus, type WarrantyLookupItem,
} from '@/services/warranties/warrantiesService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const crToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const day = (d?: string | null) => (d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CR') : '—');

const STATUS: Record<WarrantyStatus, { label: string; cls: string }> = {
  open:          { label: 'Recibido',        cls: 'bg-amber-100 text-amber-800' },
  with_supplier: { label: 'Donde proveedor', cls: 'bg-sky-100 text-sky-800' },
  approved:      { label: 'Aprobada',        cls: 'bg-emerald-100 text-emerald-800' },
  rejected:      { label: 'Rechazada',       cls: 'bg-red-100 text-red-700' },
  resolved:      { label: 'Entregado',       cls: 'bg-gray-200 text-gray-700' },
};

const RESOLUTION: Record<string, string> = {
  repair: 'Reparado', replace: 'Cambiado', refund: 'Devolución de dinero',
  credit: 'Nota de crédito', none: 'Sin resolución',
};

/**
 * Garantías.
 *
 * El caso arranca cuando el cliente trae el producto y se sigue hasta que se le
 * entrega la solución. Cada movimiento queda registrado: qué se recibió, cuándo
 * salió donde el proveedor, qué contestó y cómo terminó.
 */
export const WarrantiesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Warranty[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Warranty | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await warrantiesService.list(status, q.trim() || undefined));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'No se pudieron cargar las garantías' });
    } finally { setLoading(false); }
  }, [status, q]);
  useEffect(() => { void load(); }, [status]);   // la búsqueda se dispara con Enter

  useEffect(() => {
    if (msg?.kind !== 'ok') return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const vencida = (w: Warranty) =>
    !!w.warranty_until && w.warranty_until < crToday();

  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-6 space-y-3 sm:space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => navigate('/')} title="Volver al menú"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 shrink-0">
          <Home size={18} className="text-gray-500" />
        </button>
        <span className="flex items-center gap-2 text-base sm:text-lg font-black text-gray-900">
          <ShieldCheck size={20} className="text-cyan-600" /> Garantías
        </span>
        <div className="hidden sm:block flex-1" />
        <form onSubmit={e => { e.preventDefault(); void load(); }}
          className="relative flex-1 sm:flex-none sm:w-64 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Caso, producto, cliente, serie o factura…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" />
        </form>
        <button onClick={() => void load()} title="Actualizar"
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm">
          <Plus size={16} /> Recibir garantía
        </button>
      </div>

      {/* Filtros por estado */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {([
          { id: 'pending', label: 'Abiertos' },
          { id: 'open', label: 'Recibidos' },
          { id: 'with_supplier', label: 'Donde proveedor' },
          { id: 'approved', label: 'Aprobadas' },
          { id: 'rejected', label: 'Rechazadas' },
          { id: 'resolved', label: 'Entregados' },
          { id: 'all', label: 'Todos' },
        ]).map(f => (
          <button key={f.id} onClick={() => setStatus(f.id)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border ${
              status === f.id ? 'bg-cyan-600 border-cyan-600 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
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
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl text-center py-16">
          <ShieldCheck size={44} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm font-bold text-gray-400">No hay casos de garantía.</p>
          <p className="text-xs text-gray-400 mt-1">
            Se abren con "Recibir garantía" cuando el cliente trae el producto.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map(w => (
            <button key={w.id} onClick={() => setDetail(w)}
              className="bg-white border-2 border-gray-200 rounded-2xl p-4 text-left hover:border-cyan-300 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-gray-900 truncate flex items-center gap-1.5">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${STATUS[w.status].cls}`}>
                      {STATUS[w.status].label}
                    </span>
                    {w.number}
                  </p>
                  <p className="text-sm font-bold text-gray-700 truncate">{w.product_name}</p>
                  <p className="text-xs font-bold text-gray-400 truncate">
                    {w.customer_name ?? 'Sin cliente'}
                    {w.invoice_number ? ` · Factura ${w.invoice_number}` : ''}
                    {w.serial ? ` · Serie ${w.serial}` : ''}
                  </p>
                  <p className="text-[11px] font-semibold text-gray-500 truncate mt-0.5">↳ {w.issue}</p>
                </div>
                {w.photos?.length > 0 && (
                  <img src={w.photos[0]} alt=""
                    className="w-14 h-14 rounded-xl object-cover border border-gray-200 shrink-0"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                  w.out_of_warranty || vencida(w) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {w.out_of_warranty ? 'FUERA DE GARANTÍA'
                    : w.warranty_until ? `Vence ${day(w.warranty_until)}` : 'Sin vigencia registrada'}
                </span>
                {w.sent_at && !w.returned_at && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                    {Math.floor((Date.now() - new Date(w.sent_at).getTime()) / 86400000)} día(s) donde el proveedor
                  </span>
                )}
                {w.resolution && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {RESOLUTION[w.resolution] ?? w.resolution}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <WarrantyIntake
          onClose={() => setCreating(false)}
          onSaved={w => {
            setCreating(false);
            setMsg({ kind: 'ok', text: `Caso ${w.number} abierto` });
            void load();
          }}
        />
      )}

      {detail && (
        <WarrantyDetail
          warranty={detail}
          onClose={() => setDetail(null)}
          onChanged={w => { setDetail(w); void load(); }}
          onDeleted={() => { setDetail(null); void load(); }}
        />
      )}
    </div>
  );
};

/** Recepción del producto: busca la venta y arma el caso. */
const WarrantyIntake: React.FC<{
  onClose: () => void;
  onSaved: (w: Warranty) => void;
}> = ({ onClose, onSaved }) => {
  const { tenantId } = useTenantId();
  const [invNum, setInvNum] = useState('');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<{ invoice: any; items: WarrantyLookupItem[] } | null>(null);
  const [picked, setPicked] = useState<WarrantyLookupItem | null>(null);

  const [productName, setProductName] = useState('');
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [issue, setIssue] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lookup = async () => {
    if (!invNum.trim()) return;
    setLooking(true); setError(null);
    try {
      const r = await warrantiesService.lookup(invNum.trim());
      setFound(r);
      setCustomerName(r.invoice?.customer_name ?? '');
      setCustomerPhone(r.invoice?.customer_phone ?? '');
    } catch (e) {
      setFound(null);
      setError(e instanceof Error ? e.message : 'No se encontró la factura');
    } finally { setLooking(false); }
  };

  const pick = (it: WarrantyLookupItem) => {
    setPicked(it);
    setProductName(it.product_name);
    setQuantity(1);
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || !tenantId) return;
    setUploading(true); setError(null);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const path = `${tenantId}/garantias/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`;
        urls.push(await storageService.upload('products', path, f));
      }
      setPhotos(prev => [...prev, ...urls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron subir las fotos');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!productName.trim()) { setError('Poné qué producto se está recibiendo.'); return; }
    if (!issue.trim()) { setError('Describí la falla: es lo que se le reclama al proveedor.'); return; }
    setSaving(true); setError(null);
    try {
      const vence = picked?.warranty_until ?? null;
      const saved = await warrantiesService.create({
        invoice_id: found?.invoice?.id ?? null,
        invoice_number: found?.invoice?.invoice_number ?? (invNum.trim() || null),
        sold_at: found?.invoice?.created_at ? String(found.invoice.created_at).slice(0, 10) : null,
        customer_id: found?.invoice?.customer_id ?? null,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        product_id: picked?.product_id ?? null,
        product_name: productName.trim(),
        serial: serial.trim() || null,
        quantity,
        warranty_until: vence,
        // Se recibe igual aunque esté vencida: quedar constancia de que entró
        // fuera de plazo es justo lo que evita el reclamo después.
        out_of_warranty: !!vence && vence < crToday(),
        issue: issue.trim(),
        photos,
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el caso');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">Recibir garantía</span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
          {/* Buscar la venta */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1">Factura de la compra</p>
            <div className="flex items-center gap-1.5">
              <span className="relative flex-1 min-w-0">
                <PackageSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={invNum} onChange={e => setInvNum(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void lookup(); } }}
                  placeholder="Número de factura (ej. 000096)"
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
              </span>
              <button onClick={() => void lookup()} disabled={looking}
                className="px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-xs font-black disabled:opacity-40">
                {looking ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
              </button>
            </div>
            <p className="text-[11px] font-semibold text-gray-400 mt-1">
              Opcional: sin factura también se puede recibir, pero no se calcula la vigencia.
            </p>
          </div>

          {found && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <p className="px-3 py-2 bg-gray-50 text-[11px] font-black text-gray-500">
                {found.invoice?.customer_name ?? 'Cliente de contado'} · {day(found.invoice?.created_at)}
              </p>
              {found.items.map((it, i) => (
                <button key={i} onClick={() => pick(it)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-t border-gray-50 ${
                    picked?.product_name === it.product_name ? 'bg-cyan-50' : 'hover:bg-gray-50'}`}>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-gray-800 truncate">{it.product_name}</span>
                    <span className="block text-[11px] font-bold text-gray-400">
                      {it.quantity} × {money(it.unit_price)}
                      {it.warranty_months > 0
                        ? ` · garantía ${it.warranty_months} mes(es), vence ${day(it.warranty_until)}`
                        : ' · sin garantía configurada'}
                    </span>
                  </span>
                  {it.warranty_until && it.warranty_until < crToday() && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">
                      VENCIDA
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Datos del caso */}
          <input value={productName} onChange={e => setProductName(e.target.value)}
            placeholder="Producto que se recibe"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-800" />

          <div className="flex items-center gap-1.5">
            <input value={serial} onChange={e => setSerial(e.target.value)}
              placeholder="Serie / IMEI (si tiene)"
              className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            <input type="number" min={1} step="any" value={quantity}
              onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
              className="w-20 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-black text-gray-800 text-center" />
          </div>

          <textarea value={issue} onChange={e => setIssue(e.target.value)} rows={2}
            placeholder="¿Qué falla tiene? Ej. no enciende, hace ruido en frío…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800" />

          <div className="flex items-center gap-1.5">
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Cliente"
              className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Teléfono" inputMode="tel"
              className="w-32 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
          </div>

          {/* Fotos del estado en que entró */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1 flex items-center gap-1.5">
              <Camera size={13} /> Fotos del producto
            </p>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/50 text-white">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
              onChange={e => void addPhotos(e.target.files)} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {uploading ? 'Subiendo…' : 'Tomar o subir foto'}
            </button>
            <p className="text-[11px] font-semibold text-gray-400 mt-1">
              El estado en que entró: evita el reclamo de "así no lo entregué".
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <button onClick={() => void save()} disabled={saving || uploading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Abrir caso
          </button>
        </div>
      </div>
    </div>
  );
};

/** Seguimiento del caso: mover de estado, cerrar y ver la bitácora. */
const WarrantyDetail: React.FC<{
  warranty: Warranty;
  onClose: () => void;
  onChanged: (w: Warranty) => void;
  onDeleted: () => void;
}> = ({ warranty: w, onClose, onChanged, onDeleted }) => {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState(w.resolution ?? 'repair');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const move = async (status: WarrantyStatus) => {
    setBusy(true); setError(null);
    try {
      const upd = await warrantiesService.setStatus(w.id, status, {
        note: note.trim() || undefined,
        ...(status === 'resolved' ? { resolution: resolution as any } : {}),
      });
      setNote('');
      onChanged(upd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`¿Borrar el caso ${w.number}? No se puede deshacer.`)) return;
    try { await warrantiesService.remove(w.id); onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar'); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">
            {w.number}
            <span className={`ml-2 text-[10px] font-black px-1.5 py-0.5 rounded ${STATUS[w.status].cls}`}>
              {STATUS[w.status].label}
            </span>
            <span className="block text-xs font-bold text-gray-400">{w.product_name}</span>
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
          <div className="text-xs font-bold text-gray-600 space-y-1">
            <p>Cliente: {w.customer_name ?? '—'}
              {w.customer_phone && (
                <a href={`tel:${w.customer_phone}`} className="ml-2 inline-flex items-center gap-1 text-sky-700">
                  <Phone size={11} /> {w.customer_phone}
                </a>
              )}
            </p>
            <p>Factura: {w.invoice_number ?? '—'} · Vendido: {day(w.sold_at)}</p>
            <p>
              Vigencia: {w.warranty_until ? day(w.warranty_until) : 'sin registrar'}
              {w.out_of_warranty && <span className="text-red-600 font-black"> · recibido fuera de garantía</span>}
            </p>
            {w.serial && <p>Serie: {w.serial}</p>}
            <p className="text-gray-800">Falla: {w.issue}</p>
          </div>

          {w.photos?.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {w.photos.map((url, i) => (
                <button key={i} onClick={() => setZoom(url)}
                  className="aspect-square rounded-xl overflow-hidden border border-gray-200">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Movimientos */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Nota del movimiento (opcional)"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800" />
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => void move('with_supplier')} disabled={busy}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black disabled:opacity-40">
                <Truck size={14} /> Enviar al proveedor
              </button>
              <button onClick={() => void move('approved')} disabled={busy}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-40">
                <CheckCircle2 size={14} /> Aprobada
              </button>
              <button onClick={() => void move('rejected')} disabled={busy}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black disabled:opacity-40">
                <X size={14} /> Rechazada
              </button>
              <button onClick={() => void move('open')} disabled={busy}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-black hover:bg-gray-50 disabled:opacity-40">
                <Clock size={14} /> Volver a recibido
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <select value={resolution} onChange={e => setResolution(e.target.value as any)}
                className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800">
                {Object.entries(RESOLUTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button onClick={() => void move('resolved')} disabled={busy}
                className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-xs font-black disabled:opacity-40">
                Entregar y cerrar
              </button>
            </div>
          </div>

          {/* Bitácora */}
          {!!w.events?.length && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-black text-gray-500 uppercase mb-1 flex items-center gap-1.5">
                <History size={13} /> Movimientos
              </p>
              <ul className="space-y-1.5">
                {[...w.events].reverse().map((ev, i) => (
                  <li key={i} className="text-[11px] font-bold text-gray-600">
                    {STATUS[(ev.to ?? 'open') as WarrantyStatus]?.label ?? ev.to}
                    <span className="block text-[10px] font-semibold text-gray-400">
                      {new Date(ev.at).toLocaleString('es-CR')}{ev.note ? ` · ${ev.note}` : ''}
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
          <button onClick={() => void remove()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-red-600 font-black text-sm hover:bg-red-50">
            <Trash2 size={15} /> Borrar caso
          </button>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  );
};

export default WarrantiesDashboard;
