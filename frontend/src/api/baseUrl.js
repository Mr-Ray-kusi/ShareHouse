const PRODUCTION_API = 'https://sharehouse-yv9s.onrender.com';

function normalize(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  return value.replace(/\/api$/i, '');
}

/** Public API origin. Empty in local Vite so `/api` is proxied to localhost. */
export function apiOrigin() {
  const fromEnv = normalize(import.meta.env.VITE_API_URL);
  if (fromEnv && !fromEnv.includes('vercel.app')) return fromEnv;
  if (import.meta.env.PROD) return PRODUCTION_API;
  return '';
}
