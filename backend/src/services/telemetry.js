import { SystemEvent } from '../models/index.js';

export function parseUserAgent(ua = '') {
  const raw = String(ua || '');
  const device = /Mobile|Android|iPhone|iPad/i.test(raw) ? 'mobile' : 'desktop';
  let browser = 'other';
  if (/Edg\//i.test(raw)) browser = 'edge';
  else if (/Chrome\//i.test(raw) && !/Edg\//i.test(raw)) browser = 'chrome';
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = 'safari';
  else if (/Firefox\//i.test(raw)) browser = 'firefox';
  return { device, browser };
}

export function track(event) {
  if (!event?.name) return;
  SystemEvent.create({
    pillar: event.pillar || 'health',
    name: String(event.name).slice(0, 80),
    path: String(event.path || '').slice(0, 180),
    method: String(event.method || '').slice(0, 12),
    status: Number(event.status) || 0,
    durationMs: Number(event.durationMs) || 0,
    value: Number(event.value) || 0,
    message: String(event.message || '').slice(0, 300),
    metric: String(event.metric || '').slice(0, 40),
    term: String(event.term || '').slice(0, 80),
    tenantId: String(event.tenantId || ''),
    role: String(event.role || ''),
    device: String(event.device || ''),
    browser: String(event.browser || ''),
    channel: String(event.channel || ''),
    country: String(event.country || ''),
  }).catch(() => {});
}

export function telemetryMiddleware(req, res, next) {
  const path = req.path || '';
  if (!path.startsWith('/api') || path === '/api/health' || path.startsWith('/api/telemetry')) {
    return next();
  }
  const started = Date.now();
  res.on('finish', () => {
    const ua = parseUserAgent(req.get('user-agent'));
    track({
      pillar: 'health',
      name: 'api_call',
      path: (req.originalUrl || path).split('?')[0],
      method: req.method,
      status: res.statusCode,
      durationMs: Date.now() - started,
      tenantId: req.tenantId || req.auth?.tenantId || '',
      role: req.user?.role || req.auth?.role || '',
      ...ua,
    });
    if (res.statusCode >= 500) {
      track({
        pillar: 'health',
        name: 'http_500',
        path: (req.originalUrl || path).split('?')[0],
        status: res.statusCode,
        tenantId: req.tenantId || '',
      });
    } else if (res.statusCode === 404) {
      track({
        pillar: 'health',
        name: 'http_404',
        path: (req.originalUrl || path).split('?')[0],
        status: 404,
      });
    }
  });
  next();
}
