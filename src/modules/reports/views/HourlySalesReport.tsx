import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { Clock, TrendingUp, Award, Zap } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { wallClockDate } from '@/utils/datetime';

const fmt = (n: number) =>
  `₡${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

type HourFormat = '12h' | '24h';
const FORMAT_KEY = 'reports_hour_format';

// Formatear hora según el formato (12h o 24h)
function formatHour(hour: number, format: HourFormat): string {
  if (format === '24h') {
    return `${String(hour).padStart(2, '0')}:00`;
  }
  // 12h
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
}

// Versión corta para tablas/heatmap
function formatHourShort(hour: number, format: HourFormat): string {
  if (format === '24h') {
    return `${String(hour).padStart(2, '0')}h`;
  }
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}

interface HourBucket {
  hour: number;           // 0-23
  label: string;          // "08:00"
  total: number;          // ventas
  count: number;          // transacciones
  avgTicket: number;      // ticket promedio
}

interface DayHourMatrix {
  hour: number;
  label: string;
  [dayKey: string]: number | string; // 'Lun': total, 'Mar': total, etc.
}

interface Invoice {
  id: string;
  issued_at: string;
  total: number;
  payment_method: string;
  status?: string;
}

interface Props {
  tenantId: string | null;
  from: string;
  to: string;
}

export const HourlySalesReport: React.FC<Props> = ({ tenantId, from, to }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'hour' | 'heatmap'>('hour');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [hourFormat, setHourFormat] = useState<HourFormat>(() => {
    const saved = localStorage.getItem(FORMAT_KEY);
    return (saved === '12h' || saved === '24h') ? saved : '12h';
  });

  const changeFormat = (f: HourFormat) => {
    setHourFormat(f);
    localStorage.setItem(FORMAT_KEY, f);
  };

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    apiFetch<{ invoices: Invoice[] }>(`/reports/sales?from=${from}&to=${to}`)
      .then(res => {
        setInvoices(res?.invoices ?? []);
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Error cargando ventas');
        setInvoices([]);
      })
      .finally(() => setLoading(false));
  }, [tenantId, from, to]);

  // ── Filtrar por día seleccionado ──────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    if (selectedDay === 'all') return invoices;
    return invoices.filter(inv => (wallClockDate(inv.issued_at) ?? new Date(0)).getDay() === selectedDay);
  }, [invoices, selectedDay]);

  // ── Agrupar por hora (0-23) ───────────────────────────────────────────────
  const hourlyData: HourBucket[] = useMemo(() => {
    const buckets: Record<number, { total: number; count: number }> = {};
    for (let h = 0; h < 24; h++) buckets[h] = { total: 0, count: 0 };

    filteredInvoices.forEach(inv => {
      const hour = (wallClockDate(inv.issued_at) ?? new Date(0)).getHours();
      buckets[hour].total += Number(inv.total);
      buckets[hour].count += 1;
    });

    return Object.entries(buckets).map(([h, v]) => ({
      hour: Number(h),
      label: formatHour(Number(h), hourFormat),
      total: v.total,
      count: v.count,
      avgTicket: v.count > 0 ? v.total / v.count : 0,
    }));
  }, [filteredInvoices, hourFormat]);

  // ── Matriz heatmap: hora × día de la semana ───────────────────────────────
  const heatmapData: DayHourMatrix[] = useMemo(() => {
    const matrix: Record<number, Record<string, number>> = {};
    for (let h = 0; h < 24; h++) {
      matrix[h] = {};
      DAY_SHORT.forEach(d => { matrix[h][d] = 0; });
    }

    invoices.forEach(inv => {
      const date = wallClockDate(inv.issued_at) ?? new Date(0);
      const hour = date.getHours();
      const day = DAY_SHORT[date.getDay()];
      matrix[hour][day] += Number(inv.total);
    });

    return Object.entries(matrix).map(([h, days]) => ({
      hour: Number(h),
      label: formatHourShort(Number(h), hourFormat),
      ...days,
    }));
  }, [invoices, hourFormat]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalSales = hourlyData.reduce((s, h) => s + h.total, 0);
    const totalTrans = hourlyData.reduce((s, h) => s + h.count, 0);
    const peakHour = hourlyData.reduce((max, h) =>
      h.total > max.total ? h : max, hourlyData[0] ?? { total: 0, label: '—', count: 0, hour: 0, avgTicket: 0 }
    );
    const activeHours = hourlyData.filter(h => h.count > 0).length;

    return {
      totalSales,
      totalTrans,
      peakHour,
      activeHours,
      avgPerHour: activeHours > 0 ? totalSales / activeHours : 0,
    };
  }, [hourlyData]);

  // ── Color por intensidad (heatmap) ────────────────────────────────────────
  const getHeatColor = (value: number, max: number): string => {
    if (max === 0 || value === 0) return '#f9fafb';
    const intensity = Math.min(value / max, 1);
    const opacity = 0.15 + intensity * 0.85;
    return `rgba(16, 185, 129, ${opacity})`;
  };

  const maxHeat = useMemo(() => {
    let max = 0;
    heatmapData.forEach(row => {
      DAY_SHORT.forEach(d => {
        const v = Number(row[d]);
        if (v > max) max = v;
      });
    });
    return max;
  }, [heatmapData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
        ✗ {error}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center border border-gray-100">
        <Clock size={48} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 font-semibold">Sin ventas en este período</p>
        <p className="text-gray-400 text-sm mt-1">Selecciona otro rango de fechas</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: Award,
            label: 'Hora pico',
            value: stats.peakHour?.label ?? '—',
            sub: stats.peakHour ? `${fmt(stats.peakHour.total)} · ${stats.peakHour.count} ventas` : '',
            color: 'bg-emerald-500',
          },
          {
            icon: TrendingUp,
            label: 'Promedio por hora activa',
            value: fmt(stats.avgPerHour),
            sub: `${stats.activeHours} de 24 horas`,
            color: 'bg-blue-500',
          },
          {
            icon: Zap,
            label: 'Transacciones totales',
            value: String(stats.totalTrans),
            sub: 'en el período',
            color: 'bg-violet-500',
          },
          {
            icon: Clock,
            label: 'Total del período',
            value: fmt(stats.totalSales),
            color: 'bg-orange-500',
          },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
              <p className="text-gray-900 font-black text-xl leading-tight truncate">{value}</p>
              {sub && <p className="text-gray-400 text-xs">{sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs vista + Filtros ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('hour')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              viewMode === 'hour'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Por hora
          </button>
          <button
            onClick={() => setViewMode('heatmap')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              viewMode === 'heatmap'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Mapa de calor (hora × día)
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle formato 12h / 24h */}
          <div className="flex gap-0.5 bg-gray-100 p-1 rounded-lg" title="Formato de hora">
            <button
              onClick={() => changeFormat('12h')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                hourFormat === '12h'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              12h
            </button>
            <button
              onClick={() => changeFormat('24h')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
                hourFormat === '24h'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              24h
            </button>
          </div>

          {viewMode === 'hour' && (
            <select
              value={selectedDay}
              onChange={e => setSelectedDay(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:border-emerald-400"
            >
              <option value="all">Todos los días</option>
              {DAY_LABELS.map((day, i) => (
                <option key={i} value={i}>{day}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Vista: Por Hora ── */}
      {viewMode === 'hour' && (
        <>
          {/* Gráfico de barras */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-black text-gray-900 mb-4">
              Ventas por hora del día
              {selectedDay !== 'all' && (
                <span className="ml-2 text-sm text-gray-500 font-semibold">
                  · {DAY_LABELS[selectedDay]}
                </span>
              )}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(v: any, name) => {
                    if (name === 'total') return [fmt(Number(v)), 'Ventas'];
                    if (name === 'count') return [v, 'Transacciones'];
                    return [v, name];
                  }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
                  cursor={{ fill: '#f0fdf4' }}
                />
                <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico de transacciones */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-base font-black text-gray-900 mb-4">Transacciones por hora</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={hourlyData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  formatter={(v: any) => [v, 'Transacciones']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
                />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla detalle */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-black text-gray-900">Detalle por hora</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase">Hora</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Ventas</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Transacciones</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">Ticket Prom.</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase">% del Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hourlyData
                    .filter(h => h.count > 0)
                    .sort((a, b) => b.total - a.total)
                    .map(h => {
                      const pct = stats.totalSales > 0 ? (h.total / stats.totalSales) * 100 : 0;
                      const isPeak = h.hour === stats.peakHour?.hour;
                      return (
                        <tr key={h.hour} className={`border-t border-gray-100 ${isPeak ? 'bg-emerald-50/40' : ''}`}>
                          <td className="px-5 py-3 font-semibold text-gray-800">
                            {isPeak && <Award size={14} className="inline mr-1 text-emerald-600" />}
                            {h.label}
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(h.total)}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{h.count}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{fmt(h.avgTicket)}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <span className="text-gray-600 text-xs">{pct.toFixed(1)}%</span>
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Vista: Heatmap ── */}
      {viewMode === 'heatmap' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 overflow-x-auto">
          <h2 className="text-base font-black text-gray-900 mb-4">
            Mapa de calor: ventas por hora y día
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Más oscuro = más ventas. Identifica patrones por día de la semana.
          </p>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 font-bold text-gray-500 w-16">Hora</th>
                {DAY_SHORT.map(d => (
                  <th key={d} className="text-center p-2 font-bold text-gray-500">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData
                .filter(row => DAY_SHORT.some(d => Number(row[d]) > 0))
                .map(row => (
                  <tr key={row.hour}>
                    <td className="p-2 font-mono text-gray-600">{row.label}</td>
                    {DAY_SHORT.map(d => {
                      const val = Number(row[d]);
                      return (
                        <td
                          key={d}
                          className="text-center p-2 border border-white"
                          style={{ backgroundColor: getHeatColor(val, maxHeat) }}
                          title={`${row.label} ${d}: ${fmt(val)}`}
                        >
                          {val > 0 ? (
                            <span className={`font-semibold ${val / maxHeat > 0.5 ? 'text-white' : 'text-gray-700'}`}>
                              {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>

          {/* Leyenda */}
          <div className="flex items-center justify-end gap-2 mt-4 text-xs text-gray-500">
            <span>Menos</span>
            <div className="flex gap-0.5">
              {[0.15, 0.35, 0.55, 0.75, 1].map(o => (
                <div
                  key={o}
                  className="w-5 h-5 rounded-sm"
                  style={{ backgroundColor: `rgba(16, 185, 129, ${o})` }}
                />
              ))}
            </div>
            <span>Más</span>
          </div>
        </div>
      )}
    </div>
  );
};
