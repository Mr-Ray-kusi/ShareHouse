import { User, Tenant } from '../models/index.js';
import { verifyAccessToken } from '../utils/tokens.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account is inactive or missing.' });
    }

    req.user = user;
    req.auth = payload;
    req.tenantId = payload.tenantId || user.tenantId || null;
    req.supportMode = Boolean(payload.supportMode);
    next();
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission for this action.' });
    }
    next();
  };
}

export function blockSupportWrites(req, res, next) {
  if (!req.supportMode) return next();
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.path.includes('/support/exit')) return next();
  return res.status(403).json({
    message: 'Support Mode is view-only. Super admins cannot create distributions or mark beneficiaries.',
  });
}

export async function requireActiveTenant(req, res, next) {
  try {
    if (req.user?.role === 'super_admin' && !req.supportMode) {
      return next();
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'No tenant is associated with this account.' });
    }
    const tenant = await Tenant.findOne({ tenantId });
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found.' });
    }
    if (req.supportMode) {
      req.tenant = tenant;
      return next();
    }
    if (!tenant.hasAccess()) {
      return res.status(402).json({
        message: tenant.isActive
          ? 'This hall subscription has expired. Renew to continue.'
          : 'This hall is not yet activated. Complete payment to unlock WelfareShare.',
        code: tenant.isActive ? 'SUBSCRIPTION_EXPIRED' : 'SUBSCRIPTION_INACTIVE',
      });
    }
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

export function scopeTenant(req, res, next) {
  if (req.user?.role === 'super_admin' && !req.supportMode) {
    return next();
  }
  if (!req.tenantId) {
    return res.status(403).json({ message: 'Tenant scope missing.' });
  }
  next();
}
