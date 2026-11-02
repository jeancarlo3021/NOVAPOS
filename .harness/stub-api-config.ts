const REG: any = { guardados: [] };
(globalThis as any).__reg = REG;
let CFG: any = {
  activo: true, hora_corte: '16:00', dias: [1, 2, 3, 4, 5, 6],
  minutos_para_editar: 0, mensaje_cerrado: 'Ya cerramos los pedidos de hoy.',
  ver_existencias: true, avisar_limite: true,
};
export async function apiFetch<T = any>(path: string, init?: any): Promise<T> {
  if (path === '/portal-cliente/config' && init?.method === 'PUT') {
    CFG = { ...CFG, ...JSON.parse(init.body) };
    REG.guardados.push(CFG);
    return CFG as any;
  }
  if (path === '/portal-cliente/config') return CFG as any;
  return {} as any;
}
export default apiFetch;
