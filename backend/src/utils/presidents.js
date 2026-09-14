import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { generateInvitePassword } from './codes.js';
import { foldSearch, namesMatch } from './search.js';

export function isHiddenPresident(user) {
  return user?.role === 'tenant_admin' && user?.createdByRole === 'super_admin';
}

export function serializePresident(user, { includePassword = false } = {}) {
  return {
    id: String(user.id || user._id),
    tenantId: user.tenantId,
    name: user.name,
    email: user.email || null,
    role: user.role,
    isActive: Boolean(user.isActive),
    createdByRole: user.createdByRole || '',
    approvedAt: user.approvedAt || null,
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt,
    hiddenFromHall: isHiddenPresident(user),
    pendingApproval: !user.isActive && !user.approvedAt,
    ...(includePassword ? { password: user.passwordPlain || '' } : {}),
  };
}

export function serializeStaffAccount(user, tenant, { includePassword = false } = {}) {
  const roleLabel = user.role === 'hall_admin'
    ? 'Hall administrator'
    : user.role === 'tenant_admin'
      ? 'Hall president'
      : user.role;
  return {
    ...serializePresident(user, { includePassword }),
    roleLabel,
    hallName: tenant?.name || user.tenantId || '',
    schoolName: tenant?.schoolName || '',
    hallActive: Boolean(tenant?.isActive),
    hallPaid: Boolean(tenant?.lastPaymentAt),
  };
}

export async function presidentPasswordInUse(tenantId, password, exceptId) {
  const others = await User.find({ tenantId, role: 'tenant_admin' });
  for (const row of others) {
    if (exceptId && String(row.id || row._id) === String(exceptId)) continue;
    if (row.passwordHash && await bcrypt.compare(password, row.passwordHash)) return true;
  }
  return false;
}

export async function uniquePresidentPassword(tenantId, requested, exceptId) {
  const custom = String(requested || '').trim();
  if (custom) {
    if (custom.length < 6) {
      const err = new Error('Each hall president password must be at least 6 characters.');
      err.status = 400;
      throw err;
    }
    if (await presidentPasswordInUse(tenantId, custom, exceptId)) {
      const err = new Error('That password is already used by another hall president. Choose a different one.');
      err.status = 409;
      throw err;
    }
    return custom;
  }

  let password = generateInvitePassword();
  let tries = 0;
  while (await presidentPasswordInUse(tenantId, password, exceptId) && tries < 8) {
    password = generateInvitePassword();
    tries += 1;
  }
  return password;
}

export async function createPresidentUser({
  tenantId,
  name,
  password,
  createdByRole,
  isActive,
}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    const err = new Error('Hall president name is required.');
    err.status = 400;
    throw err;
  }
  const plain = await uniquePresidentPassword(tenantId, password);
  const now = isActive ? new Date() : null;
  return User.create({
    tenantId,
    name: trimmed,
    email: null,
    phone: '',
    passwordHash: await User.hashPassword(plain),
    passwordPlain: plain,
    role: 'tenant_admin',
    isActive: Boolean(isActive),
    createdByRole: createdByRole || '',
    approvedAt: now,
    refreshTokens: [],
  });
}

export async function findPresidentByCredentials(tenant, name, password) {
  const presidents = await User.find({ tenantId: tenant.tenantId, role: 'tenant_admin' });
  const named = presidents.filter((row) => namesMatch(name, row.name) || foldSearch(name) === foldSearch(row.name));
  for (const row of named) {
    if (await row.comparePassword(password)) return row;
  }
  return null;
}
