import crypto from 'crypto';

export function generateInviteCode(tenantName) {
  const prefix = String(tenantName || 'HALL')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5);
  return `${prefix}-${rand}`;
}

export function generateFieldQrToken() {
  return `FLD-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

export function isFieldQrCode(code) {
  return /^FLD-[0-9A-F]{12,}$/i.test(String(code || ''));
}

export function generateInvitePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function addYears(date, years) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}
