import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2, HandCoins, AlertTriangle } from 'lucide-react';
import {
  accountsReceivableService,
  type Receivable, type ReceivablePayment,
} from '@/services/accountsReceivable/accountsReceivableService';
import { useAuth } from '@/context/AuthContext';

const fmt = (n: number) => `₡${Number(n || 0).toLocaleString('es-CR')}`;
const dateOnly = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : '');
const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', sinpe: 'SINPE', transfer: 'Transf.', check: 'Cheque',
};

/** Quién puede anular. La misma lista que valida el servidor. */
const ROLES_ANULAR = ['owner', 'admin', 'gerente', 'contador'];

/**
 * MOTIVOS DE UN CLIC.
 *
 * El motivo es obligatorio, y un campo obligatorio que hay que escribir a mano
 * termina lleno de «.» y «x». Estos cuatro cubren casi todo lo que de verdad
 * pasa, y se pueden editar antes de confirmar.
 */
const MOTIVOS = ['Error de digitación', 'Cheque devuelto', 'El dinero no entró', 'Abono duplicado'];

/**
 * LOS ABONOS DE UNA CUENTA, CON OPCIÓN DE ANULARLOS.
 *
 * Vive aparte de la pantalla de abonar porque hacen falta en dos momentos
 * distintos: al cobrar (ver qué se abonó antes) y cuando hay que CORREGIR. El
 * segundo caso casi siempre llega sobre una cuenta ya cancelada —el abono de
 * más es justo el que la canceló—, y ahí la pantalla de abonar no se abre.
 */
export const ListaAbonos: React.FC<{
  receivableId: string;
  /** Se llama cuando un abono se anuló: el saldo del padre cambió. */
  onChanged?: () => void;
  /** Cuántos abonos caben sin tener que desplazar. */
  alto?: string;
}> = ({ receivableId, onChanged, alto = 'max-h-56' }) => {
  const { user } = useAuth();
  const puedeAnular = ROLES_ANULAR.includes(user?.role ?? '');

  const [pays, setPays] = useState<ReceivablePayment[] | null>(null);
  const [err, setErr] = useState('');
  // Abono que se está anulando, con el motivo que se escribió.
  const [objetivo, setObjetivo] = useState<ReceivablePayment | null>(null);
  const [motivo, setMotivo] = useState('');
  const [anulando, setAnulando] = useState(false);
  /** Aviso de caja cerrada: el servidor pide confirmar una segunda vez. */
  const [cajaCerrada, setCajaCerrada] = useState<{ fecha: string | null; monto: number } | null>(null);

  const cargar = useCallback(() => {
    accountsReceivableService.get(receivableId)
      .then(r => setPays(r.payments ?? []))
      .catch(e => { setPays([]); setErr(e instanceof Error ? e.message : 'No se pudieron cargar los abonos'); });
  }, [receivableId]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirAnular = (p: ReceivablePayment) => {
    setObjetivo(p); setMotivo(''); setCajaCerrada(null); setErr('');
  };

  const anular = async (force = false) => {
    if (!objetivo) return;
    const texto = motivo.trim();
    if (texto.length < 4) { setErr('Escribí por qué se anula (4 letras o más).'); return; }
    setAnulando(true); setErr('');
    try {
      await accountsReceivableService.voidPayment(objetivo.id, texto, force);
      setObjetivo(null); setMotivo(''); setCajaCerrada(null);
      cargar();
      onChanged?.();
    } catch (e) {
      const ex = e as Error & { status?: number; body?: any };
      /* 409 con `caja_cerrada`: no es un error, es una advertencia que hay que
         leer antes de seguir. El arqueo de ese turno va a cambiar. */
      if (ex?.status === 409 && ex?.body?.caja_cerrada) {
        setCajaCerrada({ fecha: ex.body.caja_fecha ?? null, monto: Number(ex.body.monto || 0) });
        setErr('');
      } else {
        setErr(ex instanceof Error ? ex.message : 'No se pudo anular el abono');
      }
    } finally { setAnulando(false); }
  };

  if (pays === null) {
    return <p className="text-xs text-gray-400 flex items-center gap-1.5 py-2"><Loader2 size={13} className="animate-spin" /> Cargando abonos…</p>;
  }

  const vigentes = pays.filter(p => !p.voided_at);
  const totalVigente = vigentes.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <p className="text-xs font-bold text-gray-500">Abonos registrados</p>
        <span className="text-xs font-black text-emerald-700">{vigentes.length} · {fmt(totalVigente)}</span>
        {pays.length > vigentes.length && (
          <span className="text-[11px] text-red-500">{pays.length - vigentes.length} anulado(s)</span>
        )}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-2">{err}</div>}

      {pays.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Esta cuenta todavía no tiene abonos.</p>
      ) : (
        <div className={`space-y-1 ${alto} overflow-y-auto`}>
          {pays.map(p => {
            const anulado = !!p.voided_at;
            return (
              <div key={p.id} className={`rounded-lg px-2.5 py-1.5 ${anulado ? 'bg-red-50/60' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 text-[11px] shrink-0">{dateOnly(p.created_at)}</span>
                  <span className={`font-bold ${anulado ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {fmt(Number(p.amount || 0))}
                  </span>
                  <span className="text-[11px] text-gray-400">{METHOD_LABEL[p.method] ?? p.method}</span>
                  {/* La caja ya cerrada se dice ANTES de tocar «Anular», no
                      después: es lo que cambia la decisión. */}
                  {!anulado && p.caja_cerrada && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                      caja cerrada
                    </span>
                  )}
                  {anulado ? (
                    <span className="ml-auto text-[10px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">ANULADO</span>
                  ) : puedeAnular ? (
                    <button onClick={() => abrirAnular(p)}
                      className="ml-auto text-[11px] font-bold text-red-600 hover:text-red-800">
                      Anular
                    </button>
                  ) : null}
                </div>
                {p.note && <p className="text-[11px] text-gray-400 truncate">{p.note}</p>}
                {/* El motivo de la anulación se muestra: es el dato por el que
                    se pregunta cuando el cliente reclama el saldo. */}
                {anulado && (
                  <p className="text-[11px] text-red-500">
                    Anulado el {dateOnly(p.voided_at)}
                    {p.void_reason ? ` · ${p.void_reason}` : ' · sin motivo anotado'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!puedeAnular && pays.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-1">Solo el administrador, gerente o contador pueden anular abonos.</p>
      )}

      {/* ── Confirmar la anulación: el motivo es obligatorio ── */}
      {objetivo && (
        <div className="mt-2 border-2 border-red-200 bg-red-50/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-black text-red-800">
            Anular el abono de {fmt(Number(objetivo.amount || 0))} del {dateOnly(objetivo.created_at)}
          </p>
          <p className="text-[11px] text-gray-600">
            El saldo del cliente vuelve a subir {fmt(Number(objetivo.amount || 0))}. El abono no se borra:
            queda marcado como anulado, con quién, cuándo y por qué.
          </p>

          {cajaCerrada ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg px-3 py-2 space-y-1.5">
              <p className="text-[11px] font-bold text-amber-900 flex items-start gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Este abono entró por una caja que ya se cerró
                  {cajaCerrada.fecha ? ` el ${dateOnly(cajaCerrada.fecha)}` : ''}. Al anularlo, ese arqueo
                  queda con {fmt(cajaCerrada.monto)} de más: el cajero de ese turno va a aparecer con un
                  sobrante que no cometió. Avisale.
                </span>
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.map(m => (
              <button key={m} onClick={() => setMotivo(m)}
                className={`text-[11px] font-bold px-2 py-1 rounded-lg ${
                  motivo === m ? 'bg-red-600 text-white' : 'bg-white border border-red-200 text-red-700'}`}>
                {m}
              </button>
            ))}
          </div>
          <input value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Por qué se anula"
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm" />

          <div className="flex gap-2">
            <button onClick={() => anular(!!cajaCerrada)} disabled={anulando}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 text-white font-black py-2 rounded-lg text-sm">
              {anulando ? 'Anulando…' : cajaCerrada ? 'Anular igual' : 'Anular abono'}
            </button>
            <button onClick={() => { setObjetivo(null); setCajaCerrada(null); setErr(''); }}
              className="px-4 bg-white border border-gray-200 text-gray-600 font-bold py-2 rounded-lg text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * LOS ABONOS DE UNA CUENTA, EN SU PROPIA VENTANA.
 *
 * Se abre desde cualquier cuenta que tenga abonos —incluidas las CANCELADAS—.
 * Antes la lista vivía solo dentro de «Registrar abono», y ese botón no existe
 * cuando la cuenta ya está en cero: el abono mal puesto era precisamente el
 * que la había cancelado, y no había forma de llegar a él.
 */
export const AbonosModal: React.FC<{
  ar: Receivable;
  onClose: () => void;
  onChanged: () => void;
}> = ({ ar, onClose, onChanged }) => {
  const saldo = Number(ar.total_amount) - Number(ar.paid_amount);
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-black text-gray-900 flex items-center gap-2">
              <HandCoins size={17} className="text-emerald-600" /> Abonos de la cuenta
            </h2>
            <p className="text-xs text-gray-400 truncate">
              {ar.customer_name ?? 'Cliente'}
              {ar.invoice_number ? ` · factura ${ar.invoice_number}` : ''} · saldo {fmt(saldo)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5">
          <ListaAbonos receivableId={ar.id} onChanged={onChanged} alto="max-h-72" />
        </div>
      </div>
    </div>
  );
};
