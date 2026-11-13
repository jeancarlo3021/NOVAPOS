import { useState } from 'react';
import { Ban, X, AlertTriangle, Loader, CheckCircle2, Undo2 } from 'lucide-react';
import {
  inventoryPurchasesService, type AnulacionDeCompra,
} from '@/services/Inventory/inventoryPurchasesService';

/**
 * ANULAR UNA COMPRA.
 *
 * Una orden pendiente se cancela y listo: no movió nada. Una RECIBIDA sí movió
 * —subió el inventario, cambió el costo y pudo generar una cuenta por pagar— y
 * es justo la que se equivoca: se recibió dos veces, se cargó con la factura
 * de otro proveedor, o con las cantidades mal.
 *
 * La pantalla dice PRIMERO lo que va a deshacer, y después lo que de verdad
 * deshizo. Una anulación silenciosa deja a alguien revisando el inventario
 * producto por producto para entender qué cambió.
 */
interface Props {
  purchase: any;
  onClose: () => void;
  onDone: () => void;
  /**
   * ARREGLARLA: volver a cargar la compra corregida.
   *
   * Casi ninguna compra se anula porque no existió: se anula porque se cargó
   * mal —las cantidades, los precios, el proveedor equivocado—. Sin esto hay
   * que anular y teclear otra vez las quince líneas de la factura, y lo que se
   * vuelve a cargar casi nunca es idéntico a lo que se anuló.
   *
   * No se edita la anulada: queda anulada, con su número ligado a la factura
   * del proveedor y a los ajustes que revirtieron el inventario. Se abre una
   * orden NUEVA ya llena con sus líneas.
   */
  onRehacer?: (orden: any) => void;
}

const MOTIVOS = [
  'Se recibió dos veces',
  'Cantidades o precios mal puestos',
  'Era de otro proveedor',
  'La mercadería no llegó',
];

export function VoidPurchaseModal({ purchase, onClose, onDone, onRehacer }: Props) {
  const recibida = String(purchase?.status ?? '') === 'received';
  const [motivo, setMotivo] = useState('');
  /** Se cargó mal: después de anular, se abre corregida. */
  const [rehacer, setRehacer] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<AnulacionDeCompra | null>(null);

  const anular = async () => {
    setAplicando(true); setError('');
    try {
      const r = await inventoryPurchasesService.voidPurchase(purchase.id, motivo.trim());
      const resumen = (r as any)?.data ?? r;

      /* El detalle se pide DESPUÉS de anular —si la anulación falla no hay
         nada que rehacer— y si esto falla, la anulación ya quedó hecha: se
         muestra el resumen con el aviso en vez de deshacerla. */
      if (rehacer && onRehacer) {
        setTrayendo(true);
        try {
          const completa: any = await inventoryPurchasesService.getPurchaseById(purchase.id);
          const lineas = completa?.purchase_items ?? completa?.items ?? [];
          if (!lineas.length) throw new Error('la orden no trae líneas');
          onRehacer(completa);
          return;
        } catch (e) {
          setHecho({
            ...resumen,
            aviso_rehacer: `Se anuló, pero no se pudo traer el detalle para volver a cargarla `
              + `(${e instanceof Error ? e.message : 'error'}). Hay que armarla a mano.`,
          } as any);
          return;
        } finally { setTrayendo(false); }
      }

      setHecho(resumen);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular la compra');
    } finally { setAplicando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Ban size={20} className="text-red-500" />
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-gray-900">Anular la compra {purchase?.purchase_number ?? ''}</h2>
            <p className="text-xs text-gray-400">
              {recibida ? 'Esta orden ya se recibió: hay inventario que devolver' : 'Esta orden está pendiente: no movió inventario'}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        {/* ── Ya se hizo ── */}
        {hecho ? (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 font-black">
              <CheckCircle2 size={18} /> Compra {hecho.numero} anulada
            </div>

            <ul className="text-sm text-gray-700 space-y-1">
              {hecho.estado_anterior === 'received' ? (
                <>
                  <li>• Volvieron del inventario <b>{hecho.unidades}</b> unidad(es) en {hecho.stock_revertido} línea(s).</li>
                  {hecho.sin_stock > 0 && (
                    <li>• {hecho.sin_stock} línea(s) de productos sin control de existencias: no se tocaron.</li>
                  )}
                  {hecho.fallaron > 0 && (
                    <li className="text-amber-700">• {hecho.fallaron} línea(s) no se pudieron devolver (producto borrado).</li>
                  )}
                  <li>
                    • Cuenta por pagar:{' '}
                    {hecho.cuenta_por_pagar === 'cancelada' ? 'cancelada'
                      : hecho.cuenta_por_pagar === 'no_se_pudo' ? <b className="text-amber-700">no se pudo cancelar, revisala</b>
                      : 'no tenía'}
                  </li>
                </>
              ) : (
                <li>• La orden estaba pendiente: no había inventario ni deuda que deshacer.</li>
              )}
            </ul>

            {/* El inventario en negativo NO se esconde: dice que se vendió algo
                que no había, y es lo que hay que contar físicamente. */}
            {hecho.negativos.length > 0 && (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-black text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle size={15} /> Quedaron en negativo
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Esa mercadería ya se había vendido, así que al devolverla el inventario bajó de cero.
                  Hay que contarlos y ajustarlos:
                </p>
                <ul className="mt-1 text-xs font-bold text-amber-900">
                  {hecho.negativos.map((n, i) => (
                    <li key={i}>• {n.producto}: {n.stock}</li>
                  ))}
                </ul>
              </div>
            )}

            {hecho.costos_a_revisar.length > 0 && (
              <p className="text-xs text-gray-500">
                El <b>costo</b> de {hecho.costos_a_revisar.slice(0, 4).join(', ')}
                {hecho.costos_a_revisar.length > 4 ? ` y ${hecho.costos_a_revisar.length - 4} más` : ''} quedó
                con el precio de esta compra: el sistema no guarda el costo anterior, así que conviene revisarlo.
              </p>
            )}

            {(hecho as any).aviso_rehacer && (
              <p className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {(hecho as any).aviso_rehacer}
              </p>
            )}

            <button onClick={onDone}
              className="w-full h-11 rounded-xl bg-gray-900 text-white font-black text-sm">
              Listo
            </button>
          </div>
        ) : (
          /* ── Antes de hacerlo ── */
          <div className="p-5 space-y-4">
            <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <p className="font-black text-gray-900 mb-1 flex items-center gap-1.5">
                <Undo2 size={15} /> Qué va a pasar
              </p>
              {recibida ? (
                <ul className="space-y-0.5 text-xs">
                  <li>• Se <b>resta del inventario</b> lo que esta orden metió (lo recibido, no lo pedido), con su ajuste anotado.</li>
                  <li>• Se <b>cancela la cuenta por pagar</b> de esta orden, si tenía.</li>
                  <li>• La orden queda <b>anulada</b>, con quién la anuló y por qué.</li>
                  <li className="text-gray-500">• El costo de los productos NO vuelve al anterior: el sistema no lo guarda. Se te dice cuáles revisar.</li>
                  <li className="text-gray-500">• Si ya le abonaste al proveedor, la anulación se detiene: primero hay que revertir el abono.</li>
                </ul>
              ) : (
                <p className="text-xs">Solo se marca como anulada. Esta orden no movió inventario ni generó deuda.</p>
              )}
            </div>

            {/* SE CARGÓ MAL → volver a cargarla corregida. Es el caso
                normal: la compra existió, lo que estaba mal es cómo se
                digitó. */}
            {onRehacer && (
              <button type="button" onClick={() => setRehacer(v => !v)}
                className={`w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-xl border-2 transition ${
                  rehacer ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 text-xs ${
                  rehacer ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                  {rehacer ? '✓' : ''}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-gray-900">
                    Se cargó mal: volver a cargarla corregida
                  </span>
                  <span className="block text-xs text-gray-500">
                    Al anular se abre una orden nueva con el proveedor y las líneas de esta,
                    para corregir lo que estaba mal sin volver a teclear la factura.
                    La anulada queda anulada.
                  </span>
                </span>
              </button>
            )}

            <div>
              <label className="block text-xs font-black text-gray-600 mb-1.5">¿Por qué se anula?</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {MOTIVOS.map(m => (
                  <button key={m} type="button" onClick={() => setMotivo(m)}
                    className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold ${
                      motivo === m ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}>
                    {m}
                  </button>
                ))}
              </div>
              <input value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="O escribilo: «la factura era de la otra sucursal»"
                className="w-full h-10 border-2 border-gray-200 rounded-xl px-3 text-sm" />
              <p className="text-[11px] text-gray-400 mt-1">
                Queda guardado en la orden: sin el motivo, alguien la vuelve a cargar la semana siguiente.
              </p>
            </div>

            {error && (
              <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2">
              <button onClick={onClose} disabled={aplicando}
                className="px-4 h-11 rounded-xl border-2 border-gray-200 font-black text-sm text-gray-600">
                No anular
              </button>
              <button onClick={() => void anular()} disabled={aplicando || !motivo.trim()}
                className="flex-1 h-11 rounded-xl bg-red-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-sm flex items-center justify-center gap-2">
                {aplicando || trayendo
                  ? <><Loader size={15} className="animate-spin" /> {trayendo ? 'Abriendo la corregida…' : 'Anulando…'}</>
                  : <><Ban size={15} /> {rehacer ? 'Anular y volver a cargar' : 'Anular la compra'}</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoidPurchaseModal;
