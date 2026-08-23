import React from 'react';

/**
 * Límite de errores de la raíz, SIN dependencias.
 *
 * Antes esto lo daba `Sentry.ErrorBoundary`, lo que obligaba a cargar el SDK de
 * Sentry (~240 kB) antes del primer pintado, en la ruta crítica de arranque. El
 * SDK ahora se carga en segundo plano y este límite le reenvía el error si ya
 * está listo; si no lo está, el error igual se ve en pantalla.
 */
interface State { error: Error | null }

export class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  // El estado se asigna en el constructor a propósito: un campo de clase obliga
  // al compilador a emitir su helper `__publicField`, y ese helper terminaba en
  // el chunk de gráficos, arrastrando 390 kB al arranque por dos líneas.
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[app] error no capturado:', error, info);
    // Reporte best-effort: si Sentry todavía no cargó, no se espera por él.
    const capture = (window as any).__sentryCapture;
    if (typeof capture === 'function') {
      try { capture(error, info); } catch { /* el reporte no puede romper la app */ }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-black text-gray-900 mb-2">Algo salió mal</h1>
          <p className="text-sm text-gray-600 mb-4">
            Se reportó automáticamente el error al equipo. Probá recargar la página.
          </p>
          <p className="text-xs text-gray-400 font-mono mb-4 bg-gray-50 p-2 rounded break-all">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="w-full px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

export default RootErrorBoundary;
