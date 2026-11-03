/** Un día de taller, para ver las pantallas con datos reales. */
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const REG: any = { enviado: [] };
(globalThis as any).__reg = REG;
let VENTAS: any[] = [
  { id: 'v1', fecha: HOY, descripcion: 'Llavero personalizado y 1 más', cliente: 'Don Beto', cantidad: 4, precio_unitario: 0, total: 11000, medio_pago: 'sinpe', categoria: 'impresion', notas: null, created_at: '', envio: 2500,
    items: [
      { descripcion: 'Llavero personalizado', variante: 'Chico', cantidad: 3, precio_unitario: 2000, subtotal: 6000 },
      { descripcion: 'Buje de nylon', variante: null, cantidad: 1, precio_unitario: 2500, subtotal: 2500 },
    ] },
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
const masDias = (f: string, n: number) => {
  const [y, m, d] = f.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d)); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const LUNES = (() => {
  const [y, m, d] = HOY.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return masDias(HOY, dow === 0 ? -6 : 1 - dow);
})();
let ENTREGAS: any[] = [
  { id: 'e1', fecha_entrega: HOY, cliente: 'Don Beto', telefono: '88887777',
    total: 18000, adelanto: 9000, estado_pago: 'adelanto', saldo: 9000, medio_pago: 'sinpe',
    estado: 'pendiente', entregado_at: null, entregado_nombre: null, notas: null, created_at: '',
    items: [
      { id: 'ei1', descripcion: 'Llavero personalizado', variante: 'Grande', cantidad: 4, precio_unitario: 3500, subtotal: 14000 },
      { id: 'ei2', descripcion: 'Buje de nylon', variante: null, cantidad: 1, precio_unitario: 4000, subtotal: 4000 },
    ] },
  { id: 'e2', fecha_entrega: masDias(HOY, 2), cliente: 'Super El Roble', telefono: null,
    total: 25000, adelanto: 25000, estado_pago: 'pagado', saldo: 0, medio_pago: 'transferencia',
    estado: 'pendiente', entregado_at: null, entregado_nombre: null, notas: 'Retira en el local', created_at: '',
    items: [{ id: 'ei3', descripcion: 'Soporte de celular', variante: null, cantidad: 10, precio_unitario: 2500, subtotal: 25000 }] },
  { id: 'e3', fecha_entrega: masDias(HOY, -3), cliente: 'Doña Ana', telefono: '70001111',
    total: 6000, adelanto: 0, estado_pago: 'sin_pago', saldo: 6000, medio_pago: null,
    estado: 'pendiente', entregado_at: null, entregado_nombre: null, notas: null, created_at: '',
    items: [{ id: 'ei4', descripcion: 'Reparación de pieza', variante: null, cantidad: 1, precio_unitario: 6000, subtotal: 6000 }] },
];
const calEntregas = () => {
  const hoyMas = (n: number) => masDias(HOY, n);
  const atrasadas = ENTREGAS.filter(e => e.estado === 'pendiente' && e.fecha_entrega < HOY)
    .map(e => ({ ...e, atrasada: true }));
  const dias = [HOY, hoyMas(2)].map(f => {
    const items = ENTREGAS.filter(e => e.fecha_entrega === f && e.estado !== 'cancelado');
    return { fecha: f, items, total: items.reduce((a, e) => a + e.total, 0),
      adelantos: items.reduce((a, e) => a + e.adelanto, 0), saldo: items.reduce((a, e) => a + e.saldo, 0) };
  }).filter(d => d.items.length > 0);
  const pend = ENTREGAS.filter(e => e.estado === 'pendiente');
  return { desde: HOY, hasta: hoyMas(30), dias, atrasadas, totales: {
    pendientes: pend.length, atrasadas: atrasadas.length,
    total: pend.reduce((a, e) => a + e.total, 0),
    adelantos: pend.reduce((a, e) => a + e.adelanto, 0),
    saldo: pend.reduce((a, e) => a + e.saldo, 0),
  } };
};
const CFG = { margen_horas: 2, hora_corte_entrega: '16:00', dias_entrega: [1,2,3,4,5,6], comision_ventas: 30, comision_gastos: 15 };
const resumen = () => ({
  desde: HOY, hasta: HOY,
  ventas: {
    total: VENTAS.reduce((s, v) => s + v.total, 0), cuantas: VENTAS.length,
    piezas: 25000, envios: 2500, cuantos_envios: 1,
    por_producto: [{ clave: 'Llavero personalizado · Grande', monto: 7000, cuantos: 1 }, { clave: 'Suelto', monto: 18000, cuantos: 1 }],
    por_medio: [{ clave: 'efectivo', monto: 20000, cuantos: 1 }, { clave: 'sinpe', monto: 7500, cuantos: 1 }],
    por_categoria: [{ clave: 'diseno', monto: 20000, cuantos: 1 }, { clave: 'impresion', monto: 7500, cuantos: 1 }],
  },
  gastos: {
    total: GASTOS.reduce((s, g) => s + g.monto, 0), cuantos: GASTOS.length,
    por_categoria: [{ clave: 'filamento', monto: 12000, cuantos: 1 }, { clave: 'electricidad', monto: 8000, cuantos: 1 }],
    por_medio: [{ clave: 'sinpe', monto: 12000, cuantos: 1 }, { clave: 'transferencia', monto: 8000, cuantos: 1 }],
  },
  queda: VENTAS.reduce((s, v) => s + v.total, 0) - GASTOS.reduce((s, g) => s + g.monto, 0),
  /* Día por día y comisión, igual que los arma el servidor. */
  por_dia: Array.from({ length: 7 }, (_, i) => {
    const f = masDias(LUNES, i);
    const v = VENTAS.filter(x => x.fecha === f).reduce((a, x) => a + x.total, 0);
    const g = GASTOS.filter(x => x.fecha === f).reduce((a, x) => a + x.monto, 0);
    return { fecha: f, ventas: v, gastos: g, queda: v - g };
  }),
  comision: (() => {
    const v = VENTAS.reduce((s, x) => s + x.total, 0);
    const g = GASTOS.reduce((s, x) => s + x.monto, 0);
    const desc = Math.round(g * (CFG.comision_gastos / 100) * 100) / 100;
    const base = v - desc;
    return { porcentaje_ventas: CFG.comision_ventas, porcentaje_gastos: CFG.comision_gastos,
      ventas: v, gastos: g, gastos_descontados: desc, base,
      monto: Math.max(0, Math.round(base * (CFG.comision_ventas / 100) * 100) / 100) };
  })(),
});
const CATALOGO = [
  { id: 'a1', nombre: 'Llavero personalizado', descripcion: null, categoria: 'impresion',
    precio: 2000, variantes: [{ nombre: 'Chico', precio: 2000 }, { nombre: 'Grande', precio: 3500 }],
    horas: 0.5, material: 'PLA', color: null, activo: true },
  { id: 'a2', nombre: 'Buje de nylon', descripcion: null, categoria: 'impresion',
    precio: 4500, variantes: [], horas: 3, material: 'Nylon', color: 'Natural', activo: true },
  { id: 'a3', nombre: 'Molde viejo', descripcion: null, categoria: 'otro',
    precio: 1000, variantes: [], horas: null, material: null, color: null, activo: false },
];
const TARIFAS = [
  { id: 't1', nombre: 'Correos GAM', monto: 2500, activo: true },
  { id: 't2', nombre: 'Uber', monto: 3500, activo: true },
  { id: 't3', nombre: 'Retiro en el local', monto: 0, activo: true },
];
export async function apiFetch<T = any>(path: string, init?: any): Promise<T> {
  const cuerpo = init?.body ? JSON.parse(init.body) : null;
  if (path.startsWith('/taller-3d/catalogo')) {
    if (init?.method === 'POST' || init?.method === 'PUT') { REG.enviado.push({ ruta: 'articulo', cuerpo }); return { id: 'a9', ...cuerpo } as any; }
    return (path.includes('todos=1') ? CATALOGO : CATALOGO.filter(a => a.activo)) as any;
  }
  if (path.startsWith('/taller-3d/tarifas')) {
    if (init?.method) { REG.enviado.push({ ruta: 'tarifa', cuerpo }); return { id: 't9', ...cuerpo } as any; }
    return TARIFAS as any;
  }
  if (path.startsWith('/taller-3d/entregas/calendario')) return calEntregas() as any;
  if (path.match(/\/taller-3d\/entregas\/[^/]+\/pago/)) {
    REG.enviado.push({ ruta: 'pago-entrega', cuerpo, path });
    const id = path.split('/')[3];
    ENTREGAS = ENTREGAS.map(e => {
      if (e.id !== id) return e;
      const ade = cuerpo.completo ? e.total : Math.min(e.total, e.adelanto + (cuerpo.monto ?? 0));
      return { ...e, adelanto: ade, saldo: e.total - ade,
        estado_pago: ade <= 0 ? 'sin_pago' : ade >= e.total ? 'pagado' : 'adelanto' };
    });
    return ENTREGAS.find(e => e.id === id) as any;
  }
  if (path.match(/\/taller-3d\/entregas\/[^/]+\/estado/)) {
    REG.enviado.push({ ruta: 'estado-entrega', cuerpo, path });
    const id = path.split('/')[3];
    ENTREGAS = ENTREGAS.map(e => e.id === id ? { ...e, estado: cuerpo.estado } : e);
    return ENTREGAS.find(e => e.id === id) as any;
  }
  if (path.startsWith('/taller-3d/entregas') && init?.method === 'POST') {
    REG.enviado.push({ ruta: 'entrega', cuerpo });
    const its = (cuerpo.items ?? []).map((l: any) => ({ ...l, subtotal: (l.cantidad ?? 1) * (l.precio_unitario ?? 0) }));
    const total = its.reduce((a: number, l: any) => a + l.subtotal, 0);
    const ade = cuerpo.pago_completo ? total : Math.min(total, cuerpo.adelanto ?? 0);
    const e = { id: 'e' + (ENTREGAS.length + 1), ...cuerpo, items: its, total, adelanto: ade,
      saldo: total - ade, estado: 'pendiente', estado_pago: ade <= 0 ? 'sin_pago' : ade >= total ? 'pagado' : 'adelanto',
      entregado_at: null, entregado_nombre: null, created_at: '' };
    ENTREGAS = [...ENTREGAS, e]; return e as any;
  }
  if (path.startsWith('/taller-3d/entregas')) return ENTREGAS as any;
  if (path.startsWith('/taller-3d/resumen')) return resumen() as any;
  if (path.startsWith('/taller-3d/ventas') && init?.method === 'POST') {
    REG.enviado.push({ ruta: 'venta', cuerpo });
    // El total lo arma el servidor: piezas + envío (ver routes/taller3d.ts).
    // El total lo arma el servidor: la suma de las líneas más el envío.
    const its = (cuerpo.items ?? [{ descripcion: cuerpo.descripcion, cantidad: cuerpo.cantidad ?? 1, precio_unitario: cuerpo.precio_unitario ?? 0, variante: cuerpo.variante ?? null, producto_id: cuerpo.producto_id ?? null }])
      .map((l: any) => ({ ...l, subtotal: (l.cantidad ?? 1) * (l.precio_unitario ?? 0) }));
    const v = {
      id: 'v' + (VENTAS.length + 1), fecha: HOY, ...cuerpo,
      descripcion: its.length === 1 ? its[0].descripcion : `${its[0].descripcion} y ${its.length - 1} más`,
      cantidad: its.length === 1 ? its[0].cantidad : its.reduce((a: number, l: any) => a + l.cantidad, 0),
      precio_unitario: its.length === 1 ? its[0].precio_unitario : 0,
      items: its,
      total: its.reduce((a: number, l: any) => a + l.subtotal, 0) + (cuerpo.envio ?? 0),
    };
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
  if (path.startsWith('/taller-3d/config')) {
    if (init?.method === 'PUT') { REG.enviado.push({ ruta: 'config', cuerpo }); Object.assign(CFG, cuerpo); }
    return CFG as any;
  }
  if (path.startsWith('/taller-3d/planificar')) return { programados: 2, tarde: 1 } as any;
  return [] as any;
}
export default apiFetch;
