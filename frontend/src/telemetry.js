import api from './api/client';

export function emitTelemetry(payload) {
  api.post('/api/telemetry', payload).catch(() => {});
}

export function startWebVitals() {
  if (typeof window === 'undefined' || !window.PerformanceObserver) return;
  try {
    const lcp = new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      if (entry) emitTelemetry({ name: 'web_vital', metric: 'lcp', value: Math.round(entry.startTime), path: window.location.pathname });
    });
    lcp.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* unsupported */
  }
  try {
    const fid = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const delay = entry.processingStart - entry.startTime;
        emitTelemetry({ name: 'web_vital', metric: 'fid', value: Math.round(delay), path: window.location.pathname });
      }
    });
    fid.observe({ type: 'first-input', buffered: true });
  } catch {
    /* unsupported */
  }
}

export function startErrorTracking() {
  window.addEventListener('error', (event) => {
    emitTelemetry({
      name: 'js_error',
      message: event.message || 'Uncaught exception',
      path: window.location.pathname,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    emitTelemetry({
      name: 'js_error',
      message: String(event.reason?.message || event.reason || 'Unhandled rejection'),
      path: window.location.pathname,
    });
  });
}
