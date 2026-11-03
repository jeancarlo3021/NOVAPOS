const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
const REG: any = { enviado: [] };
(globalThis as any).__reg = REG;
let ENVIOS: any[] = [
  { id: 'e1', cliente: 'Pulpe Doña Ana', telefono: '88887777', direccion: 'Correos de CR, Grecia', detalle: '2 engranajes PLA',
    medio: 'correos', estado: 'pendiente', fecha: '2026-10-28', registrado_nombre: 'Marcela',
    despachado_nombre: null, despachado_at: null, guia: null, notas: null, created_at: '' },
  { id: 'e2', cliente: 'Super El Roble', telefono: null, direccion: null, detalle: '10 soportes de celular',
    medio: 'uber', estado: 'pendiente', fecha: HOY, registrado_nombre: 'Kendall',
    despachado_nombre: null, despachado_at: null, guia: null, notas: null, created_at: '' },
];
let CONTACTOS: any[] = [
  { id: 'c1', cliente: 'Taller Mecánico JM', telefono: '87776666', motivo: 'Confirmar el color del buje',
    estado: 'pendiente', fecha: HOY, registrado_nombre: 'Marcela', hecho_nombre: null, hecho_at: null, resultado: null, created_at: '' },
];
export async function apiFetch<T = any>(path: string, init?: any): Promise<T> {
  const cuerpo = init?.body ? JSON.parse(init.body) : null;
  if (path.startsWith('/envios/resumen')) return {
    envios: { pendientes: ENVIOS.filter(e => e.estado === 'pendiente').length,
      atrasados: ENVIOS.filter(e => e.estado === 'pendiente' && e.fecha < HOY).length, enviados_hoy: 1 },
    contactos: { pendientes: CONTACTOS.filter(c => c.estado === 'pendiente').length, atrasados: 0 },
    por_persona: [{ nombre: 'Marcela', pendientes: 1, despachados: 3 }, { nombre: 'Kendall', pendientes: 1, despachados: 0 }],
  } as any;
  if (path.startsWith('/envios/contactos') && init?.method === 'POST') {
    REG.enviado.push({ ruta: 'contacto', cuerpo });
    if (/hecho$/.test(path)) { CONTACTOS = CONTACTOS.map(c => ({ ...c, estado: 'hecho', resultado: cuerpo.resultado, hecho_nombre: 'Marcela' })); return CONTACTOS[0] as any; }
    const c = { id: 'c9', fecha: HOY, estado: 'pendiente', registrado_nombre: 'Marcela', ...cuerpo };
    CONTACTOS = [c, ...CONTACTOS]; return c as any;
  }
  if (path.startsWith('/envios/contactos')) {
    const est = new URL('http://x' + path).searchParams.get('estado') ?? 'pendiente';
    return (est === 'todos' ? CONTACTOS : CONTACTOS.filter(c => c.estado === est)) as any;
  }
  if (/\/estado$/.test(path)) {
    REG.enviado.push({ ruta: 'estado', cuerpo });
    ENVIOS = ENVIOS.map(e => e.id === path.split('/')[2] ? { ...e, ...cuerpo, despachado_nombre: 'Marcela', despachado_at: new Date().toISOString() } : e);
    return ENVIOS[0] as any;
  }
  if (path === '/envios' && init?.method === 'POST') {
    REG.enviado.push({ ruta: 'envio', cuerpo });
    const e = { id: 'e9', fecha: HOY, estado: 'pendiente', registrado_nombre: 'Marcela', ...cuerpo };
    ENVIOS = [e, ...ENVIOS]; return e as any;
  }
  if (path.startsWith('/envios')) {
    const est = new URL('http://x' + path).searchParams.get('estado') ?? 'pendiente';
    return (est === 'todos' ? ENVIOS : ENVIOS.filter(e => e.estado === est)) as any;
  }
  return [] as any;
}
export default apiFetch;
