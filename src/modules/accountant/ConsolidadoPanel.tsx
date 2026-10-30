import React, { useMemo, useState } from 'react';
import { Download, Loader2, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { downloadXlsx, type XlsxSheet } from '@/utils/xlsx';
import { accountantService, type Consolidado } from '@/services/accountant/accountantService';

/**
 * EL CONSOLIDADO DEL MES, con una pestaña por cliente.
 *
 * Es el trabajo de todos los meses del contador: juntar lo que emitieron sus
 * clientes para declarar. Antes había que entrar negocio por negocio, bajar su
 * lista y pegarlas a mano; con quince clientes eso es media mañana y un error de
 * copiado que no aparece hasta la declaración.
 *
 * El archivo sale con:
 *   · «Consolidado» — una fila por cliente con sus totales, y la fila TOTAL.
 *   · una pestaña POR CLIENTE con sus comprobantes, uno por fila.
 *   · «Rechazados» — los de toda la cartera juntos, que es la alarma: un
 *     comprobante rechazado no vale ante Hacienda y hay que reemitirlo.
 */

/** El mes de hoy en Costa Rica, como AAAA-MM. */
const mesActualCR = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit' })
    .format(new Date()).slice(0, 7);

/** Primer y último instante de un mes AAAA-MM, en hora de Costa Rica. */
const rangoDelMes = (mes: string): { desde: string; hasta: string } => {
  const [a, m] = mes.split('-').map(Number);
  // Costa Rica es UTC-6 todo el año: el día 1 a las 00:00 locales son las 06:00 UTC.
  const desde = new Date(Date.UTC(a, m - 1, 1, 6, 0, 0));
  const hasta = new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 6, 0, 0) - 1);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
};

const fechaHora = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit',
  }).format(d);
  return `${f} ${h}`;
};

/* Los nombres que de verdad usa la base (`document_type`): medidos, no
   supuestos — `ticket` y `factura_electronica` son el 100% de las filas—. Los
   demás quedan por si aparecen; si no está en la tabla se escribe tal cual. */
const TIPO: Record<string, string> = {
  ticket: 'Tiquete',
  factura_electronica: 'Factura electrónica',
  tiquete_electronico: 'Tiquete electrónico',
  invoice: 'Factura',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
  credit_note: 'Nota de crédito',
  debit_note: 'Nota de débito',
  proforma: 'Proforma',
};
const ESTADO: Record<string, string> = {
  accepted: 'Aceptado', rejected: 'RECHAZADO', error: 'ERROR',
  pending: 'Pendiente', processing: 'En proceso', sent: 'Enviado',
};

const miles = (n: number) =>
  Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const ConsolidadoPanel: React.FC<{ cantidadClientes: number }> = ({ cantidadClientes }) => {
  const [mes, setMes] = useState(mesActualCR);
  const [soloFe, setSoloFe] = useState(true);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');
  const [ultimo, setUltimo] = useState<string>('');

  const etiquetaMes = useMemo(() => {
    const [a, m] = mes.split('-').map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
  }, [mes]);

  const armar = (d: Consolidado): XlsxSheet[] => {
    const hojas: XlsxSheet[] = [];

    /* HOJA 1 — el resumen. Va primera porque es la que se mira: una fila por
       cliente y el total de la cartera abajo. */
    const resumen: (string | number)[][] = [
      ['Negocio', 'Cédula', 'Comprobantes', 'Válidos', 'Aceptados', 'Rechazados',
       'Pendientes', 'Anulados', 'Subtotal', 'Impuesto', 'Total'],
    ];
    const t = { c: 0, v: 0, a: 0, r: 0, p: 0, an: 0, sub: 0, imp: 0, tot: 0 };
    for (const cl of d.clientes) {
      const x = cl.totales;
      resumen.push([cl.nombre, cl.cedula, x.comprobantes, x.validos, x.aceptados,
        x.rechazados, x.pendientes, x.anulados, x.subtotal, x.impuesto, x.total]);
      t.c += x.comprobantes; t.v += x.validos; t.a += x.aceptados; t.r += x.rechazados;
      t.p += x.pendientes; t.an += x.anulados;
      t.sub += x.subtotal; t.imp += x.impuesto; t.tot += x.total;
    }
    resumen.push([]);
    resumen.push(['TOTAL DE LA CARTERA', '', t.c, t.v, t.a, t.r, t.p, t.an,
      Math.round(t.sub * 100) / 100, Math.round(t.imp * 100) / 100, Math.round(t.tot * 100) / 100]);
    resumen.push([]);
    resumen.push([`Período: ${etiquetaMes}`]);
    resumen.push([d.solo_fe ? 'Solo comprobantes electrónicos (con clave de Hacienda)'
                            : 'Todos los comprobantes, electrónicos y corrientes']);
    resumen.push(['Los rechazados y los anulados NO se suman en los montos.']);
    hojas.push({ name: 'Consolidado', rows: resumen });

    // UNA PESTAÑA POR CLIENTE. Se incluye también el que no emitió nada: que
    // aparezca vacío es el dato —quiere decir que ese mes no facturó—.
    const CABECERA = ['Fecha', 'Número', 'Consecutivo FE', 'Clave', 'Tipo', 'Cliente',
      'Cédula cliente', 'Moneda', 'Subtotal', 'Impuesto', 'Total', 'Medio de pago',
      'Estado Hacienda', 'Anulada', 'Nota de crédito', 'Error'];
    for (const cl of d.clientes) {
      const filas: (string | number)[][] = [CABECERA];
      for (const r of cl.comprobantes) {
        filas.push([
          fechaHora(r.fecha), r.numero ?? '', r.consecutivo_fe, r.clave,
          TIPO[r.tipo] ?? r.tipo, r.cliente, r.cliente_id, r.moneda,
          r.subtotal, r.impuesto, r.total, r.medio_pago,
          ESTADO[r.estado_fe] ?? r.estado_fe, r.anulada ? 'Sí' : '',
          r.nota_credito, r.error_fe,
        ]);
      }
      if (cl.comprobantes.length) {
        filas.push([]);
        filas.push(['TOTAL', '', '', '', '', '', '', '',
          cl.totales.subtotal, cl.totales.impuesto, cl.totales.total,
          '', `${cl.totales.validos} válidos de ${cl.totales.comprobantes}`]);
      } else {
        filas.push(['(este negocio no emitió comprobantes en el período)']);
      }
      hojas.push({ name: cl.nombre, rows: filas });
    }

    /* HOJA FINAL — los rechazados de TODA la cartera. Un rechazado no vale ante
       Hacienda: hay que reemitirlo, y buscarlo cliente por cliente es como se
       termina declarando un mes con comprobantes que no existen. */
    const malos: (string | number)[][] = [
      ['Negocio', 'Fecha', 'Número', 'Clave', 'Total', 'Estado', 'Error'],
    ];
    for (const cl of d.clientes) {
      for (const r of cl.comprobantes) {
        if (r.estado_fe === 'rejected' || r.estado_fe === 'error') {
          malos.push([cl.nombre, fechaHora(r.fecha), r.numero ?? '', r.clave, r.total,
            ESTADO[r.estado_fe] ?? r.estado_fe, r.error_fe]);
        }
      }
    }
    if (malos.length === 1) malos.push(['Ninguno: todos los comprobantes del período fueron aceptados.']);
    hojas.push({ name: 'Rechazados', rows: malos });

    return hojas;
  };

  const descargar = async () => {
    setBajando(true); setError(''); setUltimo('');
    try {
      const { desde, hasta } = rangoDelMes(mes);
      const d = await accountantService.consolidado(desde, hasta, soloFe);
      if (!d.clientes.length) { setError('No hay negocios en tu cartera.'); return; }
      downloadXlsx(`consolidado-${mes}`, armar(d));
      const docs = d.clientes.reduce((s, c) => s + c.totales.comprobantes, 0);
      const monto = d.clientes.reduce((s, c) => s + c.totales.total, 0);
      const malos = d.clientes.reduce((s, c) => s + c.totales.rechazados, 0);
      setUltimo(`${d.clientes.length} negocio(s) · ${miles(docs)} comprobante(s) · ₡${miles(monto)}`
        + (malos ? ` · ${malos} RECHAZADO(S)` : ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el consolidado');
    } finally { setBajando(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <FileSpreadsheet size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-gray-900">Consolidado de comprobantes emitidos</h2>
            <p className="text-xs text-gray-500">
              Un archivo de Excel con una <b>pestaña por cliente</b> y la hoja de totales de los
              {' '}{cantidadClientes} negocio(s) de tu cartera.
            </p>
          </div>
        </div>

        <div className="flex items-end gap-2 flex-wrap ml-auto">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1">Mes</label>
            <input type="month" value={mes} max={mesActualCR()} onChange={e => setMes(e.target.value || mesActualCR())}
              className="h-10 px-3 border-2 border-gray-200 rounded-xl text-sm" />
          </div>
          <button type="button" onClick={() => void descargar()} disabled={bajando || cantidadClientes === 0}
            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black
                       inline-flex items-center gap-2 disabled:opacity-50 shrink-0">
            {bajando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {bajando ? 'Armando el archivo…' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      <label className="inline-flex items-center gap-2 mt-3 text-xs font-bold text-gray-600">
        <input type="checkbox" checked={soloFe} onChange={e => setSoloFe(e.target.checked)}
          className="w-4 h-4 accent-emerald-600" />
        Solo los electrónicos (con clave de Hacienda)
        <span className="font-normal text-gray-400">
          — destildalo para incluir los tiquetes corrientes de los negocios en simplificado
        </span>
      </label>

      {ultimo && (
        <p className="mt-2 text-xs font-bold text-emerald-700">Listo: {ultimo}</p>
      )}
      {error && (
        <p className="mt-2 text-xs font-bold text-red-600 inline-flex items-center gap-1">
          <AlertCircle size={13} /> {error}
        </p>
      )}
    </div>
  );
};

export default ConsolidadoPanel;
