import { User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createPresidentUser,
  isHiddenPresident,
  serializePresident,
  uniquePresidentPassword,
} from '../utils/presidents.js';

function visiblePresidents(rows) {
  return rows.filter((row) => !isHiddenPresident(row));
}

export const listPresidents = asyncHandler(async (req, res) => {
  const rows = await User.find({ tenantId: req.tenantId, role: 'tenant_admin' }).sort({ createdAt: -1 });
  res.json({
    hallId: req.tenantId,
    presidents: visiblePresidents(rows).map((row) => serializePresident(row, { includePassword: true })),
  });
});

export const createPresident = asyncHandler(async (req, res) => {
  const user = await createPresidentUser({
    tenantId: req.tenantId,
    name: req.body?.name || req.body?.label,
    password: req.body?.password,
    createdByRole: 'hall_admin',
    isActive: false,
  });
  res.status(201).json({
    president: serializePresident(user, { includePassword: true }),
    warning: 'A system admin must approve this hall president before they can sign in.',
  });
});

export const setPresidentPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId, role: 'tenant_admin' });
  if (!user || isHiddenPresident(user)) {
    return res.status(404).json({ message: 'Hall president not found.' });
  }
  const password = await uniquePresidentPassword(req.tenantId, req.body?.password, user.id);
  user.passwordHash = await User.hashPassword(password);
  user.passwordPlain = password;
  await user.save();
  res.json({
    president: serializePresident(user, { includePassword: true }),
    message: 'Password updated.',
  });
});

export const revokePresident = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId, role: 'tenant_admin' });
  if (!user || isHiddenPresident(user)) {
    return res.status(404).json({ message: 'Hall president not found.' });
  }
  if (user.isActive) user.approvedAt = user.approvedAt || new Date();
  user.isActive = false;
  user.refreshTokens = [];
  await user.save();
  res.json({ president: serializePresident(user, { includePassword: true }), message: 'Hall president access revoked.' });
});

export const restorePresident = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId, role: 'tenant_admin' });
  if (!user || isHiddenPresident(user)) {
    return res.status(404).json({ message: 'Hall president not found.' });
  }
  if (!user.approvedAt) {
    return res.status(403).json({ message: 'A system admin must approve this account before it can be restored.' });
  }
  user.isActive = true;
  await user.save();
  res.json({ president: serializePresident(user, { includePassword: true }), message: 'Hall president access restored.' });
});

export const deletePresident = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId, role: 'tenant_admin' });
  if (!user || isHiddenPresident(user)) {
    return res.status(404).json({ message: 'Hall president not found.' });
  }
  await User.deleteMany({ _id: user.id });
  res.json({ message: 'Hall president deleted.' });
});
