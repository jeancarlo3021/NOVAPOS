import { useState } from 'react';
import { fmtCRTime } from '@/utils/crDate';
import {
  Receipt, User, Plus, Trash2, X, CreditCard, MapPin,
  Minus, AlertCircle, UtensilsCrossed, SplitSquareHorizontal, ChefHat,
  Check, Clock, Loader2, Save, UserCog, ArrowLeftRight,
} from 'lucide-react';
import type { Bill } from './types';
import { billSubtotal, billItemTotal, billService, SERVICE_RATE } from './types';
import { estimarPromosDeCuenta, type Promotion } from '@/services/promotions/promotionsService';
import type { MapItem } from '@/modules/tables/types';

const fmt = (n: number) =>
  `₡${Math.round(n).toLocaleString('es-CR')}`;

interface Props {
  bill: Bill | null;
  spotsById: Map<string, MapItem>;
  /** Activa modo "selecciona otro spot para unir a esta cuenta" */
  addingSpot: boolean;
  /**
   * Las promociones vigentes, para poder DECIR en la mesa lo que se va a
   * descontar. El descuento se aplica al facturar, no acá.
   */
  promociones?: Promotion[];
  taxEnabled?: boolean;
  taxRate?: number;          // ej. 0.13
  onStartBill?: () => void;             // crear cuenta para el spot seleccionado
  onUpdate: (patch: Partial<Bill>) => void;
  onAddItem: (name: string, price: number) => void;
  onOpenCatalog?: () => void;
  onSplit?: () => void;
  onSendKitchen?: () => void;
  onUpdateItemQty: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveSpot: (spotId: string) => void;
  onStartAddSpot: () => void;
  onCancelAddSpot: () => void;
  onCharge: () => void;
  onCancelBill: () => void;
  emptyMessage?: string;
  /** Qué se está haciendo contra el servidor (bloquea el doble toque). */
  guardando?: null | 'mandando' | 'cobrando' | 'dividiendo';
  /** Cuántas líneas faltan por mandar a cocina. */
  pendientes?: number;
  /** Mensaje corto de confirmación ("Ronda 2 mandada a cocina"). */
  aviso?: string;
  /** Cuentas abiertas, para listarlas cuando no hay ninguna seleccionada. */
  abiertas?: Bill[];
  /** Abrir una cuenta de esa lista. */
  onPickBill?: (b: Bill) => void;
  /** Eligiendo a qué mesa se pasa la cuenta. */
  mudando?: boolean;
  /** Mesas libres a las que se puede pasar. */
  destinos?: Array<{ id: string; label: string }>;
  onMudar?: () => void;
  onMudarA?: (spotId: string) => void;
  onCancelarMudanza?: () => void;
  /** Pasar la cuenta a otro mesero (pide su PIN). */
  onCambiarMesero?: () => void;
  /**
   * Cómo se acomoda en pantalla chica.
   *
   * `true` (el mapa): debajo del plano, a lo ancho. En una tablet en vertical
   * el panel al costado se comía la mitad del ancho para decir «tocá una
   * mesa», y al mapa le quedaba menos espacio que al cartel.
   *
   * `false` (la pantalla de la cuenta): SIEMPRE al costado, aunque sea
   * angosto. Ahí se está tomando el pedido y hay que ver el menú y la cuenta a
   * la vez; apilarlos obliga a subir y bajar por cada plato.
   */
  apilado?: boolean;
}

function spotLabel(item: MapItem | undefined): string {
  if (!item) return '?';
  if (item.kind === 'table' || item.kind === 'freeTable') return item.label;
  if (item.kind === 'seat') return 'Silla';
  return item.kind;
}

export function BillPanel({
  bill, spotsById, addingSpot, taxEnabled = false, taxRate = 0, promociones = [],
  onStartBill, onUpdate, onAddItem, onOpenCatalog, onSplit, onSendKitchen, onUpdateItemQty, onRemoveItem,
  onRemoveSpot, onStartAddSpot, onCancelAddSpot, onCharge, onCancelBill,
  emptyMessage = 'Selecciona una mesa o silla en el mapa',
  guardando = null, pendientes = 0, aviso = '',
  abiertas = [], onPickBill,
  mudando = false, destinos = [], onMudar, onMudarA, onCancelarMudanza, onCambiarMesero,
  apilado = false,
}: Props) {
  /**
   * El panel RUEDA y el pie queda PEGADO ABAJO.
   *
   * Sumando encabezado, cliente, sitios, mesero, líneas y totales, el panel
   * mide más de 770 px. En una tablet acostada hay 664: el botón de cobrar
   * quedaba bajo el borde y no había forma de llegar a él. Con el panel
   * desplazable y el pie fijo, el total y los tres botones están siempre a la
   * vista, se pida lo que se pida.
   */
  const caja = apilado
    ? 'w-full lg:w-96 border-t lg:border-t-0 lg:border-l max-h-[55vh] lg:max-h-none lg:shrink-0'
    : 'w-80 xl:w-96 border-l shrink-0';
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState<string>('');

  if (!bill) {
    return (
      <aside className={`${caja} bg-white border-gray-200 flex flex-col overflow-y-auto`}>
        <div className="p-6 flex flex-col items-center text-center border-b border-gray-100">
          <Receipt size={28} className="text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-gray-600">{emptyMessage}</p>
          {onStartBill && (
            <button onClick={onStartBill}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition">
              <Plus size={14} /> Abrir cuenta aquí
            </button>
          )}
        </div>
        {/* Las cuentas abiertas, acá. Este panel estaba en blanco y la pregunta
            que se hace el encargado —qué mesa lleva más rato, quién la atiende,
            cuál falta mandar a cocina— obligaba a ir tocando mesa por mesa. */}
        {abiertas.length > 0 && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">
              Cuentas abiertas ({abiertas.length})
            </p>
            {abiertas.map(b => {
              const sub = billSubtotal(b);
              const faltan = b.items.filter(it => !Number(it.ronda)).length;
              return (
                <button key={b.id} onClick={() => onPickBill?.(b)}
                  className="w-full text-left rounded-xl border border-gray-100 hover:border-gray-300 bg-white px-3 py-2 transition"
                  style={{ borderLeft: `4px solid ${b.color}` }}>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-sm font-black text-gray-900 truncate">
                      {b.spots.map(sp => spotLabel(spotsById.get(sp.id))).join(' + ')}
                    </p>
                    <span className="text-sm font-black text-gray-900 tabular-nums">
                      {fmt(sub + billService(sub, b.is_delivery))}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                    <span>{fmtCRTime(b.opened_at)}</span>
                    {b.responsible_name && <span>· {b.responsible_name}</span>}
                    <span>· {b.items.length} línea(s)</span>
                    {faltan > 0 && (
                      <span className="font-bold text-orange-600">· {faltan} sin mandar</span>
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    );
  }

  const ocupado = guardando !== null;
  const subtotal = billSubtotal(bill);
  /**
   * LAS PROMOCIONES, en la mesa.
   *
   * Se calculan con el mismo motor del punto de venta y se MUESTRAN; el
   * descuento se aplica una sola vez, al facturar. Antes la precuenta cantaba
   * el precio de lista y la factura cobraba menos: el mesero tenía que
   * explicar la diferencia en la mesa.
   *
   * El 10 % de servicio se calcula sobre lo que de verdad se consume —ya
   * descontado—: cobrarlo sobre el precio de lista sería cobrar servicio por
   * plata que el cliente no paga.
   */
  const promos = estimarPromosDeCuenta(
    bill.items.map(it => ({
      product_id: it.product_id ?? '',
      category_id: it.category_id ?? null,
      /* El precio que entra lleva los adicionales adentro, igual que el que
         viaja al POS: si no, un «extra queso» quedaría sin su descuento. */
      unit_price: it.quantity ? billItemTotal(it) / it.quantity : 0,
      quantity: it.quantity,
      iva_pct: taxEnabled ? Math.round(taxRate * 100) : 0,
      suelta: !it.product_id,
    })),
    promociones,
  );
  const neto = Math.max(0, subtotal - promos.descuento);
  const service = billService(neto, bill.is_delivery);   // 10% en mesa, 0 en delivery
  const tax = taxEnabled ? Math.round(neto * taxRate) : 0;
  const total = neto + service + tax;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const name = itemName.trim();
    const price = parseFloat(itemPrice);
    if (!name || !price || price <= 0) return;
    onAddItem(name, price);
    setItemName('');
    setItemPrice('');
  };

  return (
    <aside className={`${caja} bg-white border-gray-200 flex flex-col overflow-y-auto`}>

      {/* Header del bill */}
      {/* El encabezado, en una línea: el título, la hora y el identificador
          gastaban 73 px de alto en una columna. Es información de referencia,
          no de trabajo. */}
      <div className="px-5 py-2 border-b border-gray-100 shrink-0 flex items-center gap-2"
        style={{ borderTop: `4px solid ${bill.color}` }}>
        <p className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: bill.color }}>
          Cuenta abierta
        </p>
        <p className="flex-1 min-w-0 text-[11px] text-gray-400 font-mono truncate">
          {fmtCRTime(bill.opened_at)} · {bill.id.slice(-6)}
        </p>
        <button onClick={onCancelBill} title="Cancelar cuenta"
          className="text-gray-400 hover:text-red-500 transition shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Cliente, en una sola línea.
          El rótulo arriba y el campo abajo gastaban 80 px de alto para un
          dato OPCIONAL. En una tablet acostada esos 80 px salían del pedido,
          que es lo único que el mesero de verdad necesita ver. */}
      <div className="px-5 py-2 border-b border-gray-100 shrink-0 flex items-center gap-2">
        <User size={13} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={bill.customer_name ?? ''}
          onChange={e => onUpdate({ customer_name: e.target.value })}
          placeholder="Cliente (opcional)"
          className="flex-1 min-w-0 px-2 h-8 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
        />
      </div>

      {/* Spots */}
      <div className="px-5 py-2 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <MapPin size={11} /> Sitios ({bill.spots.length})
          </p>
          {addingSpot ? (
            <button onClick={onCancelAddSpot}
              className="text-[10px] font-bold text-amber-600 hover:text-amber-700">
              Cancelar
            </button>
          ) : (
            <button onClick={onStartAddSpot}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
              <Plus size={10} /> Unir otro
            </button>
          )}
        </div>
        {addingSpot && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-amber-800 mb-2 flex items-start gap-1.5">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>Click sobre otra mesa o silla en el mapa para unirla.</span>
          </div>
        )}
        {/* A qué mesa se pasa. Solo las LIBRES: ofrecer una ocupada es
            ofrecer un error, y el que muda tiene una bandeja en la mano. */}
        {mudando && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-2 mb-2">
            <p className="text-[11px] font-black text-blue-900 px-1 mb-1.5">
              ¿A qué mesa se pasa? Se lleva el consumo, las rondas y el mesero.
            </p>
            {destinos.length === 0 ? (
              <p className="text-[11px] text-blue-800 px-1 pb-1">
                No hay ninguna mesa libre en este momento.
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1.5">
                {destinos.map(d => (
                  <button key={d.id} onClick={() => onMudarA?.(d.id)}
                    className="h-9 px-2 rounded-lg bg-white border border-blue-200 text-xs font-black text-blue-800 hover:bg-blue-100 truncate">
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {bill.spots.map(s => {
            const it = spotsById.get(s.id);
            return (
              <span key={s.id}
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md"
                style={{ backgroundColor: `${bill.color}22`, color: bill.color }}>
                {spotLabel(it)}
                {bill.spots.length > 1 && (
                  <button onClick={() => onRemoveSpot(s.id)} className="hover:opacity-70" title="Quitar de la cuenta">
                    <X size={10} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Quién la atiende y a qué mesa pertenece: las dos cosas cambian a
          mitad del servicio —el turno y la mesa— y antes había que ir a la
          otra pantalla a resolverlo. */}
      <div className="px-5 py-1.5 border-b border-gray-100 shrink-0 flex items-center gap-2">
        <span className="flex-1 min-w-0 text-[11px] text-gray-500 truncate">
          <User size={11} className="inline mb-0.5" />{' '}
          {bill.waiter_name || bill.responsible_name
            ? <b className="text-gray-700">{bill.waiter_name || bill.responsible_name}</b>
            : <span className="text-gray-400">sin mesero</span>}
          {bill.responsible_name && bill.waiter_name && bill.waiter_name !== bill.responsible_name && (
            <span className="text-gray-400"> · abrió {bill.responsible_name}</span>
          )}
        </span>
        {onCambiarMesero && (
          <button onClick={onCambiarMesero}
            title="Pasar la cuenta a otro mesero (pide su PIN)"
            className="h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] font-bold text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1">
            <UserCog size={12} /> Cambiar
          </button>
        )}
        {onMudar && (
          mudando ? (
            <button onClick={onCancelarMudanza}
              className="h-8 px-2.5 rounded-lg border-2 border-blue-300 bg-blue-50 text-[11px] font-black text-blue-700">
              Cancelar
            </button>
          ) : (
            <button onClick={onMudar}
              title="Pasar esta cuenta a otra mesa"
              className="h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] font-bold text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1">
              <ArrowLeftRight size={12} /> Mover
            </button>
          )
        )}
      </div>

      {/* Items.
          Altura natural, no `flex-1`: el que rueda es el panel entero. Con
          `flex-1` en una pantalla baja este bloque se achicaba a casi nada y
          el pedido —que es lo único que el mesero necesita ver— desaparecía
          entre el encabezado y los totales. */}
      <div className="px-5 py-3 grow">
        {bill.items.length === 0 ? (
          <div className="text-center py-8">
            <Receipt size={26} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Sin productos aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bill.items.map(it => (
              <div key={it.id} className="bg-gray-50 rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    {/* El nombre va completo en dos renglones: «Lomito en salsa
                        de …» no le dice nada a nadie cuando hay tres lomitos. */}
                    <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{it.name}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{fmt(it.unit_price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onUpdateItemQty(it.id, Math.max(0, it.quantity - 1))}
                      className="w-6 h-6 rounded bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600">
                      <Minus size={11} />
                    </button>
                    <span className="text-xs font-bold w-6 text-center">{it.quantity}</span>
                    <button onClick={() => onUpdateItemQty(it.id, it.quantity + 1)}
                      className="w-6 h-6 rounded bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600">
                      <Plus size={11} />
                    </button>
                  </div>
                  <span className="text-xs font-black text-gray-900 w-16 text-right">{fmt(billItemTotal(it))}</span>
                  <button onClick={() => onRemoveItem(it.id)} className="text-gray-300 hover:text-red-500 transition">
                    <Trash2 size={12} />
                  </button>
                </div>
                {/* Adicionales + nota */}
                {(it.modifiers && it.modifiers.length > 0) && (
                  <div className="mt-1 ml-1 flex flex-wrap gap-1">
                    {it.modifiers.map((m, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {m.name}{m.price_delta ? ` +${fmt(m.price_delta)}` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {it.notes && (
                  <p className="mt-1 ml-1 text-[10px] text-amber-700 italic">📝 {it.notes}</p>
                )}
                {/* Si cocina ya lo tiene o todavía no: es la pregunta que el
                    mesero se hace a cada rato frente a la mesa. */}
                {Number(it.ronda) > 0 ? (
                  <p className="mt-1 ml-1 text-[10px] font-bold text-gray-400 flex items-center gap-1">
                    <Check size={10} /> En cocina · ronda {it.ronda}
                  </p>
                ) : (
                  <p className="mt-1 ml-1 text-[10px] font-bold text-orange-600 flex items-center gap-1">
                    <Clock size={10} /> Sin mandar
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agregar productos */}
      <div className="px-5 py-3 border-t border-gray-100 shrink-0 space-y-2 bg-gray-50">
        {onOpenCatalog && (
          <button onClick={onOpenCatalog}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black transition">
            <UtensilsCrossed size={15} /> Agregar del menú
          </button>
        )}
        {/* Quick add manual (fallback) */}
        <details className="group">
          <summary className="text-[10px] font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600">
            + Item manual rápido
          </summary>
          <form onSubmit={handleAddItem} className="mt-2 grid grid-cols-3 gap-2">
            <input type="text" value={itemName} onChange={e => setItemName(e.target.value)}
              placeholder="Nombre"
              className="col-span-2 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 bg-white" />
            <input type="number" min="0" step="0.01" value={itemPrice}
              onChange={e => setItemPrice(e.target.value)}
              placeholder="Precio"
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-400 bg-white" />
            <button type="submit"
              disabled={!itemName.trim() || !itemPrice || parseFloat(itemPrice) <= 0}
              className="col-span-3 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold transition">
              <Plus size={11} /> Añadir
            </button>
          </form>
        </details>
      </div>

      {/* Total + Cobrar — pegado al fondo del panel. */}
      <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100 shrink-0 space-y-2 shadow-[0_-6px_12px_-8px_rgba(0,0,0,0.15)]">
        {/* Delivery / Mesa: en delivery NO se cobra el 10% de servicio */}
        {/* En una sola línea: a 320 px de ancho el texto largo se partía en
            dos y el interruptor ocupaba el doble. */}
        <button onClick={() => onUpdate({ is_delivery: !bill.is_delivery })}
          title={bill.is_delivery ? 'Tocá para volver a cobrar el 10%' : 'Tocá si es para llevar: se quita el 10%'}
          className={`w-full flex items-center justify-between gap-2 px-3 h-9 rounded-xl text-sm font-bold border transition ${
            bill.is_delivery ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
          <span className="truncate">{bill.is_delivery ? '🛵 Para llevar' : '🍽️ Mesa · servicio 10%'}</span>
          <span className="text-[10px] font-black uppercase shrink-0">{bill.is_delivery ? 'sin 10%' : 'cambiar'}</span>
        </button>
        {(taxEnabled && tax > 0) || service > 0 || promos.descuento > 0 ? (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span className="font-mono">{fmt(subtotal)}</span>
          </div>
        ) : null}
        {/* Las promociones, una por una: «−₡2.000» sin decir por qué obliga a
            discutirlo con el cliente sin tener el dato a mano. */}
        {promos.detalle.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm text-violet-600">
            <span className="truncate pr-2">{d.label}</span>
            <span className="font-mono shrink-0">−{fmt(d.monto)}</span>
          </div>
        ))}
        {promos.faltanRegalos.length > 0 && (
          <p className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1.5">
            🎁 Falta agregar el regalo: {promos.faltanRegalos.join(' · ')}
          </p>
        )}
        {service > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Servicio ({Math.round(SERVICE_RATE * 100)}%)</span>
            <span className="font-mono">{fmt(service)}</span>
          </div>
        )}
        {taxEnabled && tax > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>IVA ({Math.round(taxRate * 100)}%)</span>
            <span className="font-mono">{fmt(tax)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total</span>
          <span className="text-2xl font-black text-gray-900 font-mono">{fmt(total)}</span>
        </div>
        {/* GUARDAR (y mandar lo nuevo a cocina).
            Guardar y mandar son un solo gesto: el mesero termina la ronda y la
            suelta. Separados, se mandaba a cocina algo todavía no guardado —que
            se perdía si la tablet moría— o se guardaba sin que cocina supiera. */}
        {onSendKitchen && (
          <button onClick={onSendKitchen}
            disabled={bill.items.length === 0 || ocupado}
            title={pendientes > 0
              ? `Guarda la cuenta y manda a cocina las ${pendientes} línea(s) nuevas`
              : 'Guarda la cuenta (no hay nada nuevo que mandar a cocina)'}
            className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-white text-sm font-black transition disabled:bg-gray-200 disabled:text-gray-400 ${
              pendientes > 0 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-600 hover:bg-slate-700'
            }`}>
            {guardando === 'mandando'
              ? <><Loader2 size={16} className="animate-spin" /> Guardando…</>
              : pendientes > 0
                ? <><ChefHat size={16} /> Guardar y mandar a cocina · {pendientes}</>
                : <><Save size={16} /> Guardar</>}
          </button>
        )}
        {/* El botón ya trae el número: este renglón solo agrega contexto, y en
            una pantalla baja ese contexto vale menos que el espacio. */}
        {pendientes > 0 && (
          <p className="hidden [@media(min-height:820px)]:block text-[11px] text-center font-bold text-orange-600 -mt-1">
            {pendientes} línea(s) que cocina todavía no tiene
          </p>
        )}
        {aviso && (
          <p className="text-[11px] text-center font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5">
            {aviso}
          </p>
        )}
        {/* Dividir */}
        {onSplit && (
          <button onClick={onSplit}
            disabled={bill.items.length === 0 || ocupado}
            className="w-full flex items-center justify-center gap-1.5 px-2 h-9 rounded-xl border-2 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40 text-xs font-black transition">
            {guardando === 'dividiendo'
              ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
              : <><SplitSquareHorizontal size={14} /> Dividir cuenta</>}
          </button>
        )}
        {/* Cobrar grande */}
        <button onClick={onCharge}
          disabled={bill.items.length === 0 || ocupado}
          title="Guarda la cuenta y la pasa al POS para facturarla"
          className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-base font-black transition">
          {guardando === 'cobrando'
            ? <><Loader2 size={16} className="animate-spin" /> Guardando…</>
            : <><CreditCard size={16} /> Cobrar {fmt(total)}</>}
        </button>
        <p className="hidden [@media(min-height:900px)]:block text-[10px] text-center text-gray-400 leading-tight">
          «Cobrar» pasa la cuenta al punto de venta, donde se elige el medio de pago
          y sale la factura.
        </p>
      </div>
    </aside>
  );
}

export default BillPanel;
