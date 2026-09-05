import bcrypt from 'bcryptjs';
import { Invite, User, Tenant, Collection, Distribution, Beneficiary } from '../models/index.js';
import { generateInviteCode, generateInvitePassword, isFieldQrCode } from '../utils/codes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';

export async function ensureJoinCode(tenant) {
  if (tenant.joinCode) return tenant.joinCode;
  let code = generateInviteCode(tenant.name || tenant.tenantId);
  while (await Tenant.exists({ joinCode: code })) {
    code = generateInviteCode(tenant.name || tenant.tenantId);
  }
  tenant.joinCode = code;
  await tenant.save();
  return code;
}

function joinPayload(code) {
  const joinPath = `/join/${code}`;
  return { joinPath, joinUrl: `${env.frontendUrl}${joinPath}` };
}

async function passwordInUse(tenantId, password, exceptId) {
  const others = await Invite.find({
    tenantId,
    isActive: true,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  for (const row of others) {
    if (isFieldQrCode(row.code) || !row.passwordHash) continue;
    if (await bcrypt.compare(password, row.passwordHash)) return true;
  }
  return false;
}

async function uniquePassword(tenantId, requested, exceptId) {
  const custom = String(requested || '').trim();
  if (custom) {
    if (custom.length < 6) {
      const err = new Error('Each assistant password must be at least 6 characters.');
      err.status = 400;
      throw err;
    }
    if (await passwordInUse(tenantId, custom, exceptId)) {
      const err = new Error('That password is already used by another assistant. Choose a different one.');
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

export const listInvites = asyncHandler(async (req, res) => {
  const joinCode = await ensureJoinCode(req.tenant);
  const invites = await Invite.find({ tenantId: req.tenantId }).select('-passwordHash').sort({ createdAt: -1 });
  res.json({
    invites: invites
      .filter((row) => !isFieldQrCode(row.code))
      .map((row) => {
        const obj = row.toObject();
        return { ...obj, password: obj.passwordPlain || '' };
      }),
    ...joinPayload(joinCode),
  });
});

export const createInvite = asyncHandler(async (req, res) => {
  const { label, distributionId, password: requestedPassword } = req.body || {};
  const name = String(label || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Assistant name is required.' });
  }
  const joinCode = await ensureJoinCode(req.tenant);
  const password = await uniquePassword(req.tenantId, requestedPassword);
  const passwordHash = await bcrypt.hash(password, 12);

  const invite = await Invite.create({
    tenantId: req.tenantId,
    code: joinCode,
    label: name,
    passwordHash,
    passwordPlain: password,
    distributionId: distributionId || null,
    createdBy: req.user._id,
    isActive: true,
  });

  res.status(201).json({
    invite: {
      ...invite.toObject(),
      ...joinPayload(joinCode),
      password,
    },
    warning: 'Each assistant has a unique password. It is shown beside their name.',
  });
});

export const setInvitePassword = asyncHandler(async (req, res) => {
  const invite = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Invite not found.' });
  if (!invite.isActive) return res.status(400).json({ message: 'This assistant access has been revoked.' });

  const password = await uniquePassword(req.tenantId, req.body?.password, invite._id);
  invite.passwordHash = await bcrypt.hash(password, 12);
  invite.passwordPlain = password;
  await invite.save();

  if (invite.assistantId) {
    await User.findByIdAndUpdate(invite.assistantId, {
      passwordHash: await User.hashPassword(password),
    });
  }

  res.json({
    message: 'New password set for this assistant.',
    invite: {
      ...invite.toObject(),
      ...joinPayload(invite.code),
      password,
    },
  });
});

export const listAssistantCollections = asyncHandler(async (req, res) => {
  const invite = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Assistant not found.' });

  const dist =
    (await Distribution.findOne({ tenantId: req.tenantId, status: 'active' })) ||
    (await Distribution.findOne({ tenantId: req.tenantId }).sort({ createdAt: -1 }));

  if (!invite.assistantId && !invite.assistantName) {
    return res.json({
      invite,
      headers: dist?.sheetHeaders || ['Student Index', 'Full Name', 'Level', 'Phone'],
      results: [],
      distribution: dist,
    });
  }

  const filter = { tenantId: req.tenantId };
  if (dist) filter.distributionId = dist._id;
  if (invite.assistantId) filter.assistantId = invite.assistantId;
  else filter.assistantName = invite.assistantName;

  const marks = await Collection.find(filter).sort({ collectedAt: -1 }).lean();
  const beneficiaries = await Beneficiary.find({
    _id: { $in: marks.map((m) => m.beneficiaryId) },
  }).select('sheetRow studentIndex fullName level phone');
  const byId = new Map(beneficiaries.map((b) => [String(b._id), b]));
  const headers = dist?.sheetHeaders?.length
    ? dist.sheetHeaders
    : ['Student Index', 'Full Name', 'Level', 'Phone'];

  const results = marks.map((item) => {
    const b = byId.get(String(item.beneficiaryId));
    return {
      id: String(item._id),
      studentIndex: item.studentIndex,
      fullName: item.beneficiaryName,
      collected: true,
      markedBy: item.assistantName,
      assistantName: item.assistantName,
      collectedAt: item.collectedAt,
      assistantId: item.assistantId ? String(item.assistantId) : null,
      sheetRow:
        b?.sheetRow && Object.keys(b.sheetRow || {}).length
          ? b.sheetRow
          : {
              'Student Index': item.studentIndex,
              'Full Name': item.beneficiaryName,
              Level: b?.level || '',
              Phone: b?.phone || '',
            },
    };
  });

  res.json({ invite, headers, results, distribution: dist });
});

export const revokeInvite = asyncHandler(async (req, res) => {
  const invite = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Invite not found.' });

  invite.isActive = false;
  await invite.save();

  if (invite.assistantId) {
    await User.findByIdAndUpdate(invite.assistantId, { isActive: false });
  }

  res.json({ message: 'Assistant access revoked.', invite });
});

export const restoreInvite = asyncHandler(async (req, res) => {
  const invite = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Invite not found.' });
  if (isFieldQrCode(invite.code)) {
    return res.status(400).json({ message: 'This is a field QR code, not an assistant.' });
  }

  invite.isActive = true;
  await invite.save();

  if (invite.assistantId) {
    await User.findByIdAndUpdate(invite.assistantId, { isActive: true });
  }

  res.json({ message: 'Assistant access restored.', invite });
});

export const deleteInvite = asyncHandler(async (req, res) => {
  const invite = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Invite not found.' });
  if (isFieldQrCode(invite.code)) {
    return res.status(400).json({ message: 'This is a field QR code, not an assistant.' });
  }

  if (invite.assistantId) {
    await User.findByIdAndUpdate(invite.assistantId, { isActive: false });
  }
  await Invite.deleteMany({ _id: invite._id, tenantId: req.tenantId });
  res.json({ message: 'Assistant deleted.' });
});

export const getInvitePublic = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  if (isFieldQrCode(code)) {
    return res.status(404).json({ message: 'Use the field collection page from the QR code, not the assistant join link.' });
  }
  let tenant = await Tenant.findOne({ joinCode: code });
  if (!tenant) tenant = await Tenant.findOne({ tenantId: String(req.params.code || '').toLowerCase() });

  const invites = tenant
    ? await Invite.find({ tenantId: tenant.tenantId, isActive: true })
    : await Invite.find({ code, isActive: true });

  if (!invites.length && !tenant) {
    return res.status(404).json({ message: 'This invite link is invalid or has been revoked.' });
  }

  const hall = tenant || await Tenant.findOne({ tenantId: invites[0].tenantId });
  res.json({
    invite: {
      code: hall?.joinCode || code,
      tenantId: hall?.tenantId,
      hallName: hall?.name,
      schoolName: hall?.schoolName,
    },
  });
});
