(globalThis as any).__comandas = [];
export const posPrinterService: any = {
  async printComandas(...a: any[]) { (globalThis as any).__comandas.push(a); },
  async loadReceiptConfig() { return { printers: [] }; }, async printAuto() {}, async openCashDrawer() {},
};
export default posPrinterService;
