import { registerSW } from 'virtual:pwa-register';

// Crea un banner mínimo, sin tocar el árbol de React.
function showUpdateBanner(onUpdate: () => Promise<void>) {
  // Evita duplicados si se llama dos veces.
  if (document.getElementById('pwa-update-banner')) return;

  const bar = document.createElement('div');
  bar.id = 'pwa-update-banner';
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:20px',
    'transform:translateX(-50%)',
    'background:#0f172a', 'color:#fff',
    'padding:10px 14px', 'border-radius:12px',
    'box-shadow:0 6px 24px rgba(0,0,0,.25)',
    'font: 600 13px system-ui, -apple-system, sans-serif',
    'display:flex', 'gap:10px', 'align-items:center',
    'z-index:99999',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'Hay una nueva versión disponible';
  text.style.opacity = '.9';

  const btn = document.createElement('button');
  btn.textContent = 'Actualizar';
  btn.style.cssText = [
    'background:#10b981', 'color:#fff', 'border:0',
    'padding:6px 12px', 'border-radius:8px',
    'font: 700 12px system-ui, -apple-system, sans-serif',
    'cursor:pointer',
  ].join(';');
  btn.onclick = () => onUpdate();

  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = [
    'background:transparent', 'color:#94a3b8', 'border:0',
    'padding:4px 6px', 'cursor:pointer', 'font-size:14px',
  ].join(';');
  close.onclick = () => bar.remove();

  bar.append(text, btn, close);
  document.body.appendChild(bar);
}

export function setupPWA() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showUpdateBanner(async () => {
        await updateSW(true); // skipWaiting + reload
      });
    },
    onOfflineReady() {
      // Listo para usar sin conexión — silencioso, no interrumpe al cajero.
    },
  });
}
