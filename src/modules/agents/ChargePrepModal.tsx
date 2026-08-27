import React, { useEffect, useState } from 'react';
import {
  Receipt, User, Loader2, X, AlertCircle, ArrowRight, Percent, IdCard, Mail, Phone,
  MapPin, Briefcase,
} from 'lucide-react';
import { customersService } from '@/services/customers/customersService';
import { CRLocationFields } from '@/components/CRLocationFields';
import type { AgentOrder } from '@/services/agents/salesAgentsService';

const money = (n: number) => `₡${Math.round(Number(n || 0)).toLocaleString('es-CR')}`;
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;
/** Redondeo de caja a múltiplos de ₡10, igual que el POS: ya no circulan ₡5. */
const round10 = (n: number) => Math.round(Number(n || 0) / 10) * 10;

type DocType = 'ticket' | 'tiquete_electronico' | 'factura_electronica';

/**
 * Paso previo al cobro de un pedido de agente.
 *
 * El agente cotiza sin impuesto y muchas veces sin la cédula del cliente. Si el
 * cliente termina pidiendo comprobante electrónico, el cajero necesita dos cosas
 * antes de facturar: sumarle el IVA al precio acordado y completar los datos del
 * receptor. Hacerlo acá evita tener que anular la venta y rehacerla.
 */
export const ChargePrepModal: React.FC<{
  order: AgentOrder;
  taxRate: number;
  taxEnabled: boolean;
  onCancel: () => void;
  onReady: (prepared: AgentOrder) => void;
}> = ({ order, taxRate, taxEnabled, onCancel, onReady }) => {
  const [docType, setDocType] = useState<DocType>((order.document_type as DocType) ?? 'ticket');
  const electronic = docType !== 'ticket';
  // Por defecto se agrega el IVA cuando el comprobante es electrónico: es el caso
  // en que el precio de la calle deja de alcanzar porque el impuesto se declara.
  const [addIva, setAddIva] = useState(electronic && taxEnabled);
  useEffect(() => { setAddIva(docType !== 'ticket' && taxEnabled); }, [docType, taxEnabled]);

  const [name, setName] = useState(order.customer_name ?? '');
  const [identification, setIdentification] = useState('');
  const [idType, setIdType] = useState('01');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(order.customer_phone ?? '');
  // Hacienda exige ubicación y actividad económica del receptor en la factura
  // electrónica: sin esto el documento se rechaza.
  const [province, setProvince] = useState('');
  const [canton, setCanton] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState(order.delivery_place ?? '');
  const [activity, setActivity] = useState('');
  const [loadingCust, setLoadingCust] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el pedido ya trae cliente, se precargan sus datos para completarlos.
  useEffect(() => {
    if (!order.customer_id) return;
    setLoadingCust(true);
    customersService.get(order.customer_id)
      .then(c => {
        setName(c.name ?? '');
        setIdentification(c.identification ?? '');
        setIdType(c.identification_type ?? '01');
        setEmail(c.email ?? '');
        setPhone(c.phone ?? order.customer_phone ?? '');
        setProvince(c.province_code ?? '');
        setCanton(c.canton_code ?? '');
        setDistrict(c.district_code ?? '');
        setAddress(c.address ?? order.delivery_place ?? '');
        setActivity(c.economic_activity_code ?? '');
      })
      .catch(() => {})
      .finally(() => setLoadingCust(false));
  }, [order.customer_id, order.customer_phone, order.delivery_place]);

  const base = round2(order.total);
  const factor = addIva ? 1 + taxRate : 1;
  // Lo que se cobra va redondeado a ₡10: sumar el IVA deja céntimos que nadie
  // puede pagar ni dar de vuelto.
  const exactTotal = round2(base * factor);
  const finalTotal = round10(exactTotal);
  const roundDiff = round2(finalTotal - exactTotal);

  const confirm = async () => {
    setError(null);

    if (docType === 'factura_electronica') {
      // Todo esto lo valida Hacienda: es mejor frenarlo acá que emitir y que el
      // documento vuelva rechazado con el cliente ya ido.
      const faltan: string[] = [];
      if (!name.trim()) faltan.push('nombre');
      if (!identification.trim()) faltan.push('cédula');
      if (!activity.trim()) faltan.push('actividad económica');
      if (!province) faltan.push('provincia');
      if (!canton) faltan.push('cantón');
      if (!district) faltan.push('distrito');
      if (address.trim().length < 5) faltan.push('otras señas (mín. 5 caracteres)');
      if (faltan.length) {
        setError(`Para la factura electrónica falta: ${faltan.join(', ')}.`);
        return;
      }
    }

    setSaving(true);
    try {
      let customerId = order.customer_id ?? null;
      const payload = {
        name: name.trim() || 'Cliente',
        identification: identification.trim() || null,
        identification_type: identification.trim() ? idType : null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        province_code: province || null,
        canton_code: canton || null,
        district_code: district || null,
        address: address.trim() || null,
        economic_activity_code: activity.trim() || null,
      };

      // Los datos se guardan en la ficha: si no, la próxima venta vuelve a pedir
      // lo mismo y el cliente lo dicta otra vez.
      if (customerId) {
        await customersService.update(customerId, payload as any).catch(() => {});
      } else if (identification.trim()) {
        const created = await customersService.create(payload as any).catch(() => null);
        customerId = created?.id ?? null;
      }

      // El pedido preparado: precios ya con IVA si se agregó, y datos del cliente
      // que va a llevar la factura.
      onReady({
        ...order,
        document_type: docType,
        customer_id: customerId,
        customer_name: payload.name,
        customer_phone: payload.phone,
        // Viaja hasta la caja: es lo que permite ofrecer «mandar la factura por
        // correo» apenas se cobra, sin volver a pedirle el dato al cliente.
        customer_email: payload.email,
        total: finalTotal,
        items: order.items.map(it => ({
          ...it,
          unit_price: round2(it.unit_price * factor),
          subtotal: round2(it.subtotal * factor),
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo preparar el cobro');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancel}>
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-sm font-black text-gray-800">
            Cobrar {order.number ?? 'pedido'}
            <span className="block text-xs font-bold text-gray-400">
              {order.agent_name ? `Agente: ${order.agent_name}` : 'Pedido de agente'}
            </span>
          </span>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3">
          {/* Comprobante */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1 flex items-center gap-1.5">
              <Receipt size={13} /> Comprobante
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'ticket', label: 'Tiquete corriente' },
                { id: 'tiquete_electronico', label: 'Tiquete electrónico' },
                { id: 'factura_electronica', label: 'Factura electrónica' },
              ] as Array<{ id: DocType; label: string }>).map(d => (
                <button key={d.id} onClick={() => setDocType(d.id)}
                  className={`px-2 py-2.5 rounded-xl border-2 text-xs font-black transition ${
                    docType === d.id ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* IVA */}
          <div className={`rounded-xl border-2 p-3 ${
            addIva ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-gray-900 flex items-center gap-1.5">
                  <Percent size={15} className="text-emerald-600" />
                  Agregar IVA {Math.round(taxRate * 100)}%
                </p>
                <p className="text-xs font-semibold text-gray-500">
                  El agente cotiza sin impuesto. Con comprobante electrónico el IVA se
                  declara, así que se suma sobre el precio acordado.
                </p>
              </div>
              <button onClick={() => setAddIva(v => !v)} disabled={!taxEnabled}
                className={`px-3 py-2 rounded-lg font-black text-xs shrink-0 ${
                  addIva ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} disabled:opacity-40`}>
                {addIva ? 'Sí' : 'No'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-emerald-100 text-sm font-black text-gray-800">
              <span>Total a cobrar</span>
              <span className="tabular-nums">
                {money(finalTotal)}
                {addIva && (
                  <span className="ml-2 text-xs font-bold text-gray-400 line-through">{money(base)}</span>
                )}
              </span>
            </div>
            {roundDiff !== 0 && (
              <p className="text-[11px] font-bold text-gray-400 mt-1">
                Redondeo de caja a ₡10: {roundDiff > 0 ? '+' : ''}{money(roundDiff)}
                {' '}(exacto {money(exactTotal)})
              </p>
            )}
          </div>

          {/* Datos del cliente */}
          <div>
            <p className="text-xs font-black text-gray-500 uppercase mb-1 flex items-center gap-1.5">
              <User size={13} /> Datos del cliente
              {loadingCust && <Loader2 size={12} className="animate-spin text-gray-400" />}
            </p>
            <div className="space-y-1.5">
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Nombre o razón social"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
              <div className="flex items-center gap-1.5">
                <select value={idType} onChange={e => setIdType(e.target.value)}
                  className="px-2 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 shrink-0">
                  <option value="01">Física</option>
                  <option value="02">Jurídica</option>
                  <option value="03">DIMEX</option>
                  <option value="04">NITE</option>
                </select>
                <span className="relative flex-1 min-w-0">
                  <IdCard size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={identification} onChange={e => setIdentification(e.target.value)}
                    placeholder="Cédula" inputMode="numeric"
                    className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
                </span>
              </div>
              <span className="relative block">
                <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Correo (para enviarle el comprobante)" inputMode="email"
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
              </span>
              <span className="relative block">
                <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="Teléfono" inputMode="tel"
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
              </span>

              {/* Ubicación y actividad: obligatorias para factura electrónica */}
              <div className="pt-1">
                <p className="text-[11px] font-black text-gray-500 uppercase mb-1 flex items-center gap-1.5">
                  <MapPin size={12} /> Ubicación (Hacienda)
                  {docType === 'factura_electronica' && <span className="text-red-500">obligatoria</span>}
                </p>
                <CRLocationFields
                  province={province} canton={canton} district={district}
                  onChange={(f, v) => {
                    if (f === 'province') setProvince(v);
                    else if (f === 'canton') setCanton(v);
                    else setDistrict(v);
                  }}
                />
              </div>

              <textarea value={address} onChange={e => setAddress(e.target.value.slice(0, 250))}
                rows={2} placeholder="Otras señas — dirección exacta (mín. 5 caracteres)"
                className={`w-full px-3 py-2.5 border rounded-xl text-sm font-bold text-gray-800 ${
                  address.trim().length > 0 && address.trim().length < 5
                    ? 'border-red-300' : 'border-gray-200'}`} />

              <span className="relative block">
                <Briefcase size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={activity}
                  onChange={e => setActivity(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="Actividad económica (código Hacienda, ej. 620100)" inputMode="numeric"
                  className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-800" />
              </span>
            </div>
            <p className="text-[11px] font-semibold text-gray-400 mt-1">
              Se guardan en la ficha del cliente para no volver a pedirlos en la próxima venta.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 space-y-2 shrink-0">
          {error && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-600">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <button onClick={() => void confirm()} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm disabled:bg-gray-200 disabled:text-gray-400">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            Continuar al cobro · {money(finalTotal)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChargePrepModal;
