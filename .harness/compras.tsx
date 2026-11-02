import { createRoot } from 'react-dom/client';
import { ReloadStockModal } from '@/modules/purchases/components/ReloadStockModal';
createRoot(document.getElementById('root')!).render(
  <ReloadStockModal
    purchase={{ id: 'compra-1', purchase_number: 'PO-0001' }}
    onClose={() => { (window as any).__cerrado = true; }}
    onDone={() => { (window as any).__listo = true; }}
  />);
