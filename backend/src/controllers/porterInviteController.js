import bcrypt from 'bcryptjs';
import { PorterInvite, Tenant, User } from '../models/index.js';
import { generateInvitePassword } from '../utils/codes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { ensureLodgeJoinCode } from '../utils/lodge.js';

function joinPayload(code) {
  const joinPath = `/lodge-join/${code}`;
  return { joinPath, joinUrl: `${env.frontendUrl}${joinPath}` };
}

async function passwordInUse(tenantId, password, exceptId) {
  const others = await PorterInvite.find({
    tenantId,
    isActive: true,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  for (const row of others) {
    if (!row.passwordHash) continue;
    if (await bcrypt.compare(password, row.passwordHash)) return true;
  }
  return false;
}

async function uniquePassword(tenantId, requested, exceptId) {
  const custom = String(requested || '').trim();
  if (custom) {
    if (custom.length < 6) {
      const err = new Error('Each porter password must be at least 6 characters.');
      err.status = 400;
      throw err;
    }
    if (await passwordInUse(tenantId, custom, exceptId)) {
      const err = new Error('That password is already used by another porter. Choose a different one.');
      err.status = 409;
      throw err;
    }
    return custom;
  }
  let password = generateInvitePassword();
  let tries = 0;
  while (await passwordInUse(tenantId, password, exceptId) && tries < 8) {
    password = generateInvitePassword();
    tries += 1;
  }
  return password;
}

export const listPorterInvites = asyncHandler(async (req, res) => {
  const joinCode = await ensureLodgeJoinCode(req.tenant);
  const invites = await PorterInvite.find({ tenantId: req.tenantId }).select('-passwordHash').sort({ createdAt: -1 });
  res.json({
    invites: invites.map((row) => {
      const obj = row.toObject();
      return { ...obj, password: obj.passwordPlain || '' };
    }),
    ...joinPayload(joinCode),
  });
});

export const createPorterInvite = asyncHandler(async (req, res) => {
  const name = String(req.body?.label || '').trim();
  if (!name) return res.status(400).json({ message: 'Porter name is required.' });
  const joinCode = await ensureLodgeJoinCode(req.tenant);
  const password = await uniquePassword(req.tenantId, req.body?.password);
  const invite = await PorterInvite.create({
    tenantId: req.tenantId,
    code: joinCode,
    label: name,
    passwordHash: await bcrypt.hash(password, 12),
    passwordPlain: password,
    createdBy: req.user._id,
    isActive: true,
  });
  res.status(201).json({
    invite: { ...invite.toObject(), ...joinPayload(joinCode), password },
    warning: 'Each porter has a unique password. It is shown beside their name.',
  });
});

export const setPorterPassword = asyncHandler(async (req, res) => {
  const invite = await PorterInvite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Porter not found.' });
  if (!invite.isActive) return res.status(400).json({ message: 'This porter access has been revoked.' });
  const password = await uniquePassword(req.tenantId, req.body?.password, invite._id);
  invite.passwordHash = await bcrypt.hash(password, 12);
  invite.passwordPlain = password;
  await invite.save();
  if (invite.porterId) {
    await User.findByIdAndUpdate(invite.porterId, { passwordHash: await User.hashPassword(password) });
  }
  res.json({
    message: 'New password set for this porter.',
    invite: { ...invite.toObject(), ...joinPayload(invite.code), password },
  });
});

export const revokePorterInvite = asyncHandler(async (req, res) => {
  const invite = await PorterInvite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Porter not found.' });
  invite.isActive = false;
  await invite.save();
  if (invite.porterId) await User.findByIdAndUpdate(invite.porterId, { isActive: false });
  res.json({ message: 'Porter access revoked.', invite });
});

export const restorePorterInvite = asyncHandler(async (req, res) => {
  const invite = await PorterInvite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Porter not found.' });
  invite.isActive = true;
  await invite.save();
  if (invite.porterId) await User.findByIdAndUpdate(invite.porterId, { isActive: true });
  res.json({ message: 'Porter access restored.', invite });
});

export const deletePorterInvite = asyncHandler(async (req, res) => {
  const invite = await PorterInvite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Porter not found.' });
  if (invite.porterId) await User.findByIdAndUpdate(invite.porterId, { isActive: false });
  await PorterInvite.deleteMany({ _id: invite._id, tenantId: req.tenantId });
  res.json({ message: 'Porter deleted.' });
});

export const getPorterInvitePublic = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  let tenant = await Tenant.findOne({ lodgeJoinCode: code });
  if (!tenant) tenant = await Tenant.findOne({ tenantId: String(req.params.code || '').toLowerCase() });
  const invites = tenant
    ? await PorterInvite.find({ tenantId: tenant.tenantId, isActive: true })
    : await PorterInvite.find({ code, isActive: true });
  if (!invites.length && !tenant) {
    return res.status(404).json({ message: 'This lodge join link is invalid or has been revoked.' });
  }
  const hall = tenant || await Tenant.findOne({ tenantId: invites[0].tenantId });
  res.json({
    invite: {
      code: hall?.lodgeJoinCode || code,
      tenantId: hall?.tenantId,
      hallName: hall?.name,
      schoolName: hall?.schoolName,
    },
  });
});
