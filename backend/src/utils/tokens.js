import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.accessTtl });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwtRefreshSecret, {
    expiresIn: `${env.refreshTtlDays}d`,
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure || env.nodeEnv === 'production',
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: env.refreshTtlDays * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  };
}

export function accessPayload(user, extras = {}) {
  return {
    sub: String(user._id),
    role: user.role,
    tenantId: extras.tenantId ?? user.tenantId ?? null,
    name: user.name,
    supportMode: Boolean(extras.supportMode),
    ...extras,
  };
}
