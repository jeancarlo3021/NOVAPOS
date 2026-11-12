import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { TrendingDown, DollarSign, Calendar, Tag, RefreshCw, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { expensesService } from '@/services/expenses/expensesService';
import {
  PAYMENT_METHOD_LABELS, EXPENSE_TYPE_LABELS,
  type ExpenseSummary, type Expense,
} from '@/types/Types_Expenses';
import { downloadCsv } from '@/utils/csv';
import { downloadXlsx } from '@/utils/xlsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Miles con PUNTO, igual que la pantalla de Gastos.
 *
 * `toLocaleString('es-CR')` devuelve un espacio fino —«₡45 000»— y el mismo
 * monto se veía distinto en el módulo y en su reporte.
 */
const fmt = (n: number) =>
  `₡${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

function shortDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
        {sub && <p className="text-gray-400 text-xs">{sub}</p>}
      </div>
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-lg rounded-xl px-3 py-2 border border-gray-100 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-emerald-600 font-bold">{fmt(payload[0].value)}</p>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  tenantId: string | null;
  from: string;
  to: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ExpensesReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Qué descarga se está armando (el detalle se pide al servidor). */
  const [bajando, setBajando] = useState<null | 'xlsx' | 'csv'>(null);
  /**
   * El error de la DESCARGA va aparte del error de CARGA.
   *
   * `error` hace que la pantalla se reemplace por el aviso —correcto cuando el
   * reporte no cargó—. Si una descarga fallida escribiera ahí, el reporte que
   * el usuario ya estaba viendo desaparecería por no haber podido bajar un
   * archivo.
   */
  const [errorBaja, setErrorBaja] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    expensesService
      .getSummary(tenantId, from, to)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, from, to]);

  /**
   * LA DESCARGA.
   *
   * El detalle NO se trae con el reporte: esta pantalla son gráficos y un
   * negocio con un año de gastos no tiene por qué bajar miles de filas para
   * mirar una torta. Se piden al tocar el botón.
   *
   * Los montos van como NÚMERO, no como «₡45.000»: una columna de textos no se
   * suma, y un Excel de gastos que no se puede sumar no sirve para nada —es la
   * primera cosa que hace quien lo abre—.
   */
  const bajarDetalle = async (): Promise<Expense[]> => {
    if (!tenantId) return [];
    const filas = await expensesService.getAll(tenantId, { from, to });
    /* Del más viejo al más nuevo: el orden en que se leen las cuentas. La
       pantalla de Gastos los muestra al revés, que es lo correcto ahí. */
    return [...filas].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  };

  const hojaDetalle = (filas: Expense[]) => {
    const encabezado = [
      'Fecha', 'Categoría', 'Descripción', 'Tipo', 'Método de pago',
      'Referencia', 'Notas', 'Origen', 'Monto',
    ];
    const cuerpo = filas.map(g => [
      g.date,
      g.category?.name ?? (g.origen === 'caja' ? 'Salida de caja' : 'Sin categoría'),
      g.description ?? '',
      EXPENSE_TYPE_LABELS[g.type] ?? g.type ?? '',
      PAYMENT_METHOD_LABELS[g.payment_method] ?? g.payment_method ?? '',
      g.reference ?? '',
      g.notes ?? '',
      /* De dónde salió la plata: un gasto anotado en el módulo y una salida
         del cajón se suman igual, pero no se revisan igual. */
      g.origen === 'caja' ? 'Salida de caja' : 'Gastos',
      Math.round((Number(g.amount) || 0) * 100) / 100,
    ]);
    const total = Math.round(filas.reduce((t, g) => t + (Number(g.amount) || 0), 0) * 100) / 100;
    return [encabezado, ...cuerpo, [], ['', '', '', '', '', '', '', 'TOTAL', total]];
  };

  const hojasResumen = () => {
    const pct = (n: number) => (summary && summary.total > 0
      ? Math.round((n / summary.total) * 1000) / 10 : 0);
    return [
      {
        name: 'Resumen',
        rows: [
          ['Reporte de gastos'],
          ['Desde', from],
          ['Hasta', to],
          [],
          ['Total de gastos', summary?.total ?? 0],
          ['Cantidad de registros', summary?.count ?? 0],
          ['Promedio por día', summary?.avgPerDay ?? 0],
          ['Categorías con gasto', summary?.byCategory.length ?? 0],
          [],
          ['Generado', new Date().toLocaleString('es-CR')],
        ] as Array<Array<string | number>>,
      },
      {
        name: 'Por categoría',
        rows: [
          ['Categoría', 'Registros', 'Monto', '% del total'],
          ...(summary?.byCategory ?? []).map(c => [c.name, c.count, c.total, pct(c.total)]),
        ] as Array<Array<string | number>>,
      },
      {
        name: 'Por día',
        rows: [
          ['Fecha', 'Monto'],
          ...(summary?.byDay ?? []).map(d => [d.date, d.total]),
        ] as Array<Array<string | number>>,
      },
      {
        name: 'Por método de pago',
        rows: [
          ['Método', 'Monto', '% del total'],
          ...(summary?.byPaymentMethod ?? []).map(m => [m.label, m.total, pct(m.total)]),
        ] as Array<Array<string | number>>,
      },
    ];
  };

  const descargar = async (formato: 'xlsx' | 'csv') => {
    setBajando(formato);
    setErrorBaja('');
    try {
      const filas = await bajarDetalle();
      const nombre = `gastos_${from}_${to}`;
      if (formato === 'csv') {
        /* El CSV lleva SOLO el detalle: es un archivo de una sola tabla, y
           pegarle los resúmenes abajo lo vuelve ilegible para quien lo abre
           con un lector de texto o lo importa a otro sistema. */
        downloadCsv(nombre, hojaDetalle(filas));
      } else {
        downloadXlsx(nombre, [...hojasResumen(), { name: 'Detalle', rows: hojaDetalle(filas) }]);
      }
    } catch (e) {
      setErrorBaja(e instanceof Error ? e.message : 'No se pudo generar la descarga');
    } finally { setBajando(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
        <RefreshCw size={18} className="animate-spin" /> Cargando reporte de gastos...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Descargas. Arriba a la derecha, como en los demás reportes. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-black text-gray-900 text-base">Gastos del período</h2>
          <p className="text-xs text-gray-400">
            El Excel trae el detalle gasto por gasto y los resúmenes en hojas aparte.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void descargar('csv')} disabled={bajando !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 disabled:opacity-40">
            {bajando === 'csv' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} CSV
          </button>
          <button type="button" onClick={() => void descargar('xlsx')} disabled={bajando !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-40">
            {bajando === 'xlsx' ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            {bajando === 'xlsx' ? 'Armando…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Un error de la descarga no puede borrar el reporte que ya está en
          pantalla: se avisa acá arriba y los gráficos siguen. */}
      {errorBaja && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <span className="flex-1">{errorBaja}</span>
          <button type="button" onClick={() => setErrorBaja('')} className="font-black px-2">×</button>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={TrendingDown} label="Total Gastos" value={fmt(summary.total)} sub={`${summary.count} registro${summary.count !== 1 ? 's' : ''}`} color="bg-red-500" />
        <KPICard icon={DollarSign}   label="Promedio por día" value={fmt(summary.avgPerDay)} color="bg-orange-400" />
        <KPICard icon={Tag}          label="Categorías"       value={String(summary.byCategory.length)} color="bg-violet-500" />
        <KPICard icon={Calendar}     label="Período"          value={`${from} → ${to}`} color="bg-blue-500" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart by day */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide">Gastos por día</h3>
          {summary.byDay.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.byDay} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₡${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart by category */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide">Por categoría</h3>
          {summary.byCategory.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={summary.byCategory}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {summary.byCategory.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => fmt(value)} />
                <Legend formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Category breakdown table */}
      {summary.byCategory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Detalle por categoría</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {summary.byCategory.map((cat) => (
              <div key={cat.name} className="flex items-center px-5 py-3 gap-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: cat.color + '22' }}
                >
                  {cat.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800 truncate">{cat.name}</span>
                    <span className="text-sm font-bold text-gray-900 ml-4 shrink-0">{fmt(cat.total)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${summary.total > 0 ? (cat.total / summary.total) * 100 : 0}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 w-10 text-right">
                      {summary.total > 0 ? ((cat.total / summary.total) * 100).toFixed(1) : 0}%
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{cat.count} reg.</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment method breakdown */}
      {summary.byPaymentMethod.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Por método de pago</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100">
            {summary.byPaymentMethod.map((pm) => (
              <div key={pm.method} className="p-4 text-center">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{pm.label}</p>
                <p className="text-lg font-black text-gray-900 mt-1">{fmt(pm.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
