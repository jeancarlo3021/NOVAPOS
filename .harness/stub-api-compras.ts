/** El estado de carga de una orden, y lo que el usuario confirma. */
const REG: any = { recargas: [] };
(globalThis as any).__reg = REG;
export async function apiFetch<T = any>(path: string, init?: any): Promise<T> {
  if (/\/stock-status$/.test(path)) return ((globalThis as any).__estado) as any;
  if (/\/reload-stock$/.test(path)) {
    REG.recargas.push(JSON.parse(init?.body ?? '{}'));
    return { purchase_number: 'PO-0001', aplicados: 143, sinStock: 2, fallaron: 0, unidades: 512 } as any;
  }
  return [] as any;
}
export default apiFetch;
