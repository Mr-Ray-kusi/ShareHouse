import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const PLANS = {
  hall: { key: 'hall', fee: 500, label: 'Hall Plan' },
  src: { key: 'src', fee: 1500, label: 'SRC Plan' },
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/welfareshare',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'ws-access-dev-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'ws-refresh-dev-change-me',
  accessTtl: process.env.JWT_ACCESS_TTL || '15m',
  refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS) || 7,
  paystackSecret: process.env.PAYSTACK_SECRET_KEY || '',
  paystackPublic: process.env.PAYSTACK_PUBLIC_KEY || '',
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || 'samuel.w@example.com',
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || 'ChangeMeNow1!',
  superAdminName: process.env.SUPER_ADMIN_NAME || 'WelfareShare Super Admin',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};

export function getPlan(planKey) {
  const plan = PLANS[planKey];
  if (!plan) {
    const err = new Error('Invalid subscription plan. Choose hall or src.');
    err.status = 400;
    throw err;
  }
  return plan;
}
