const CLIENTES = [
  { id: 'cli-1', name: 'Pulpería Doña Ana', commercial_name: 'Pulpe Doña Ana',
    identification_type: '01', identification: '102340567', email: 'ana@correo.cr',
    phone: '88887777', is_active: true, credit_enabled: true, credit_limit: 200000 },
  { id: 'cli-2', name: 'Super El Roble', commercial_name: null,
    identification_type: '02', identification: '3101123456', email: null,
    phone: null, is_active: true, credit_enabled: false, credit_limit: 0 },
];
/** Lo que el servidor va recibiendo, para poder revisarlo desde la prueba. */
const REG: any = { creados: [], revocados: [] };
(globalThis as any).__reg = REG;
let ENLACES: any[] = [{
  id: 'l-1', customer_id: 'cli-1', token: 'token-larguisimo-de-prueba-0001',
  puede_pedir: true, puede_ver_saldo: true, tiene_pin: false, vence_el: null,
  ultimo_uso: null, usos: 3, created_at: new Date().toISOString(),
}];
/** Lo que el dueño le concedió al cajero. La prueba lo cambia antes de abrir. */
(globalThis as any).__permisos ??= {};
export async function apiFetch<T = any>(path: string, init?: any): Promise<T> {
  if (path.startsWith('/users/roles/')) return ((globalThis as any).__permisos ?? {}) as any;
  if (path.startsWith('/customers/zones')) return [] as any;
  if (path.startsWith('/customers')) return CLIENTES as any;
  if (path === '/portal-cliente/enlaces' && (!init || init.method === undefined)) return ENLACES as any;
  if (path === '/portal-cliente/enlaces' && init?.method === 'POST') {
    const body = JSON.parse(init.body);
    REG.creados.push(body);
    const l = { id: 'l-nuevo', customer_id: body.customer_id, token: 'token-nuevo-larguisimo-999999',
      puede_pedir: body.puede_pedir, puede_ver_saldo: body.puede_ver_saldo,
      tiene_pin: !!body.pin, vence_el: body.vence_el ?? null, ultimo_uso: null, usos: 0,
      created_at: new Date().toISOString() };
    ENLACES = [...ENLACES.filter(x => x.customer_id !== body.customer_id), l];
    return l as any;
  }
  if (path.startsWith('/portal-cliente/enlaces/') && init?.method === 'DELETE') {
    const id = path.split('/').pop();
    REG.revocados.push(id);
    ENLACES = ENLACES.filter(x => x.customer_id !== id);
    return { revocado: true } as any;
  }
  return [] as any;
}
export default apiFetch;
