import { createRoot } from 'react-dom/client';
import { EnviosEquipo } from '@/modules/envios/EnviosEquipo';
createRoot(document.getElementById('root')!).render(
  <div style={{ position: 'fixed', inset: 0 }}><EnviosEquipo /></div>);
