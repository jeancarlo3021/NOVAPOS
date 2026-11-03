/** Un día de taller, para ver las pantallas con datos reales. */
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const REG: any = { enviado: [] };
(globalThis as any).__reg = REG;
let VENTAS: any[] = [
  { id: 'v1', fecha: HOY, descripcion: 'Llavero personalizado', cliente: 'Don Beto', cantidad: 3, precio_unitario: 2500, total: 7500, medio_pago: 'sinpe', categoria: 'impresion', notas: null, created_at: '' },
  { id: 'v2', fecha: HOY, descripcion: 'Diseño de pieza a medida', cliente: null, cantidad: 1, precio_unitario: 20000, total: 20000, medio_pago: 'efectivo', categoria: 'diseno', notas: null, created_at: '' },
];
let GASTOS: any[] = [
  { id: 'g1', fecha: HOY, descripcion: 'Rollo PLA negro', categoria: 'filamento', monto: 12000, medio_pago: 'sinpe', proveedor: 'Tecnoshop', notas: null, created_at: '' },
  { id: 'g2', fecha: HOY, descripcion: 'Recibo de luz', categoria: 'electricidad', monto: 8000, medio_pago: 'transferencia', proveedor: null, notas: null, created_at: '' },
];
const IMPRESORAS = [
  { id: 'm1', nombre: 'Ender 3', notas: null, activa: true },
  { id: 'm2', nombre: 'Bambu A1', notas: null, activa: true },
  { id: 'm3', nombre: 'Prusa (en reparación)', notas: null, activa: false },
];
const manana = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const CAL = {
  desde: HOY, hasta: manana,
  dias: [
    { fecha: HOY, items: [
      { id: 'i1', pieza: 'Engranaje de repuesto', cliente: 'Don Beto', cantidad: 2, horas: 4, material: 'PLA', color: 'Negro',
        prioridad: 1, estado: 'imprimiendo', impresora_id: 'm1', impresora: 'Ender 3',
        inicio: new Date(Date.now() - 3600000).toISOString(), fin: new Date(Date.now() + 25200000).toISOString(),
        entrega_estimada: HOY, fecha_limite: HOY, tarde: false, notas: null, created_at: '' },
    ] },
    { fecha: manana, items: [
      { id: 'i2', pieza: 'Soporte de celular', cliente: 'Super El Roble', cantidad: 10, horas: 1.5, material: 'PETG', color: 'Azul',
        prioridad: 0, estado: 'programado', impresora_id: 'm2', impresora: 'Bambu A1',
        inicio: new Date().toISOString(), fin: new Date(Date.now() + 54000000).toISOString(),
        entrega_estimada: manana, fecha_limite: HOY, tarde: true, notas: null, created_at: '' },
    ] },
  ],
  sin_programar: [],
  impresoras: IMPRESORAS,
};
const resumen = () => ({
  desde: HOY, hasta: HOY,
  ventas: {
    total: VENTAS.reduce((s, v) => s + v.total, 0), cuantas: VENTAS.length,
    por_medio: [{ clave: 'efectivo', monto: 20000, cuantos: 1 }, { clave: 'sinpe', monto: 7500, cuantos: 1 }],
    por_categoria: [{ clave: 'diseno', monto: 20000, cuantos: 1 }, { clave: 'impresion', monto: 7500, cuantos: 1 }],
  },
  gastos: {
    total: GASTOS.reduce((s, g) => s + g.monto, 0), cuantos: GASTOS.length,
    por_categoria: [{ clave: 'filamento', monto: 12000, cuantos: 1 }, { clave: 'electricidad', monto: 8000, cuantos: 1 }],
    por_medio: [{ clave: 'sinpe', monto: 12000, cuantos: 1 }, { clave: 'transferencia', monto: 8000, cuantos: 1 }],
  },
  queda: VENTAS.reduce((s, v) => s + v.total, 0) - GASTOS.reduce((s, g) => s + g.monto, 0),
});
export async function apiFetch<T = any>(path: string, init?: any): Promise<T> {
  const cuerpo = init?.body ? JSON.parse(init.body) : null;
  if (path.startsWith('/taller-3d/resumen')) return resumen() as any;
  if (path.startsWith('/taller-3d/ventas') && init?.method === 'POST') {
    REG.enviado.push({ ruta: 'venta', cuerpo });
    const v = { id: 'v' + (VENTAS.length + 1), fecha: HOY, ...cuerpo, total: (cuerpo.cantidad ?? 1) * (cuerpo.precio_unitario ?? 0) };
    VENTAS = [v, ...VENTAS]; return v as any;
  }
  if (path.startsWith('/taller-3d/ventas')) return VENTAS as any;
  if (path.startsWith('/taller-3d/gastos') && init?.method === 'POST') {
    REG.enviado.push({ ruta: 'gasto', cuerpo });
    const g = { id: 'g' + (GASTOS.length + 1), fecha: HOY, ...cuerpo }; GASTOS = [g, ...GASTOS]; return g as any;
  }
  if (path.startsWith('/taller-3d/gastos')) return GASTOS as any;
  if (path.startsWith('/taller-3d/impresoras')) return IMPRESORAS as any;
  if (path.startsWith('/taller-3d/impresiones') && init?.method === 'POST') {
    REG.enviado.push({ ruta: 'impresion', cuerpo });
    return { id: 'i9', pieza: cuerpo.pieza, plan: {
      impresora_id: 'm2', inicio: new Date().toISOString(),
      fin: new Date(Date.now() + 7200000).toISOString(), entrega_estimada: manana, tarde: false,
    } } as any;
  }
  if (path.startsWith('/taller-3d/calendario')) return CAL as any;
  if (path.startsWith('/taller-3d/config')) return { margen_horas: 2, hora_corte_entrega: '16:00', dias_entrega: [1,2,3,4,5,6] } as any;
  if (path.startsWith('/taller-3d/planificar')) return { programados: 2, tarde: 1 } as any;
  return [] as any;
}
export default apiFetch;
