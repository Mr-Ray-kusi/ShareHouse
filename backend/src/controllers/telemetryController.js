import { asyncHandler } from '../utils/asyncHandler.js';
import { track, parseUserAgent } from '../services/telemetry.js';

const ALLOWED = new Set([
  'page_view',
  'js_error',
  'web_vital',
  'site_search',
  'scroll_depth',
  'session_ping',
]);

export const ingest = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '');
  if (!ALLOWED.has(name)) {
    return res.status(400).json({ message: 'Unknown telemetry event.' });
  }
  const ua = parseUserAgent(req.get('user-agent'));
  track({
    pillar: name === 'js_error' || name === 'web_vital' ? 'health' : name === 'page_view' || name === 'site_search' || name === 'scroll_depth' ? 'behavior' : 'audience',
    name,
    path: body.path || '',
    value: body.value,
    message: body.message || '',
    metric: body.metric || '',
    term: body.term || '',
    tenantId: req.user?.tenantId || body.tenantId || '',
    role: req.user?.role || '',
    channel: body.channel || '',
    ...ua,
    device: body.device || ua.device,
    browser: body.browser || ua.browser,
  });
  res.status(204).end();
});
