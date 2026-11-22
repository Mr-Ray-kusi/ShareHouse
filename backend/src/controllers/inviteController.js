import bcrypt from 'bcryptjs';
import { Invite, User, Tenant, Collection, Distribution, Beneficiary, HallAllocation } from '../models/index.js';
import { generateInviteCode, generateInvitePassword, isFieldQrCode } from '../utils/codes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { getActiveDistribution } from '../services/activeDistribution.js';
import {
  disconnectUnstaffedHallAssistants,
  loadAssignmentOptions,
  parseAssignment,
  throwIfAssignmentSchema,
  WHOLE_LIST_COLUMN,
  WHOLE_LIST_VALUE,
} from '../services/assistantAssignment.js';

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

export const assignmentOptions = asyncHandler(async (req, res) => {
  const options = await loadAssignmentOptions(req.tenantId);
  res.json(options);
});

export const listHallAllocations = asyncHandler(async (req, res) => {
  const [halls, invites] = await Promise.all([
    HallAllocation.find({ tenantId: req.tenantId }).sort({ name: 1 }),
    Invite.find({ tenantId: req.tenantId }).select('hallId isActive'),
  ]);
  const counts = new Map();
  for (const invite of invites) {
    const hallId = String(invite.hallId || '');
    if (!hallId) continue;
    const count = counts.get(hallId) || { total: 0, active: 0 };
    count.total += 1;
    if (invite.isActive) count.active += 1;
    counts.set(hallId, count);
  }
  res.json({
    halls: halls.map((hall) => ({
      ...hall.toObject(),
      assistants: counts.get(String(hall._id)) || { total: 0, active: 0 },
    })),
  });
});

export const createHallAllocation = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 80) {
    return res.status(400).json({ message: 'Hall name is required and must be 80 characters or fewer.' });
  }
  if (req.body?.wholeList === true) {
    const existing = await HallAllocation.findOne({ tenantId: req.tenantId });
    if (existing) {
      return res.status(409).json({
        message: 'A whole-list hall must be the only hall allocation. Remove existing hall allocations first.',
      });
    }
    const hall = await HallAllocation.create({
      tenantId: req.tenantId,
      name,
      assignmentColumn: WHOLE_LIST_COLUMN,
      assignmentValue: WHOLE_LIST_VALUE,
      createdBy: req.user._id,
    });
    return res.status(201).json({ hall: { ...hall.toObject(), assistants: { total: 0, active: 0 } } });
  }

  const assignment = parseAssignment(req.body);
  if (!assignment.assignmentColumn || assignment.assignmentValues.length !== 1) {
    return res.status(400).json({ message: 'Choose one hall value from the uploaded student list.' });
  }
  const options = await loadAssignmentOptions(req.tenantId);
  const column = options.columns.find((item) => item.header === assignment.assignmentColumn);
  if (!column || !column.values.some((value) => value === assignment.assignmentValues[0])) {
    return res.status(400).json({ message: 'Choose a hall column and value present in the current student list.' });
  }
  const wholeListHall = await HallAllocation.findOne({
    tenantId: req.tenantId,
    assignmentColumn: WHOLE_LIST_COLUMN,
  });
  if (wholeListHall) {
    return res.status(409).json({
      message: `The whole student list is already allocated to ${wholeListHall.name}. Remove it before creating another hall allocation.`,
    });
  }
  const existingHall = await HallAllocation.findOne({
    tenantId: req.tenantId,
    assignmentColumn: assignment.assignmentColumn,
    assignmentValue: assignment.assignmentValues[0],
  });
  if (existingHall) {
    return res.status(409).json({ message: `That student-list value is already allocated to ${existingHall.name}.` });
  }
  const hall = await HallAllocation.create({
    tenantId: req.tenantId,
    name,
    assignmentColumn: assignment.assignmentColumn,
    assignmentValue: assignment.assignmentValues[0],
    createdBy: req.user._id,
  });
  res.status(201).json({ hall: { ...hall.toObject(), assistants: { total: 0, active: 0 } } });
});

export const deleteHallAllocation = asyncHandler(async (req, res) => {
  const hall = await HallAllocation.findOne({ _id: req.params.hallId, tenantId: req.tenantId });
  if (!hall) return res.status(404).json({ message: 'Hall allocation not found.' });
  const assistants = await Invite.countDocuments({ tenantId: req.tenantId, hallId: hall._id });
  if (assistants) {
    return res.status(409).json({ message: "Reassign or delete this hall's assistants before removing the allocation." });
  }
  await HallAllocation.deleteMany({ _id: hall._id, tenantId: req.tenantId });
  res.json({ message: 'Hall allocation removed.' });
});

export const setInviteAssignment = asyncHandler(async (req, res) => {
  const invite = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Invite not found.' });
  const hall = await HallAllocation.findOne({ _id: req.body?.hallId, tenantId: req.tenantId });
  if (!hall) return res.status(400).json({ message: 'Select a hall allocation for this assistant.' });
  const previousHallId = invite.hallId;
  invite.hallId = hall._id;
  invite.assignmentColumn = hall.assignmentColumn;
  invite.assignmentValues = [hall.assignmentValue];
  try {
    await invite.save();
  } catch (err) {
    throwIfAssignmentSchema(err);
    throw err;
  }
  if (previousHallId && String(previousHallId) !== String(hall._id)) {
    await disconnectUnstaffedHallAssistants(req.app.get('io'), req.tenantId, previousHallId);
  }
  res.json({
    message: `This assistant is allocated to ${hall.name}.`,
    invite,
  });
});

export const createInvite = asyncHandler(async (req, res) => {
  const { label, password: requestedPassword } = req.body || {};
  const name = String(label || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Assistant name is required.' });
  }
  const hall = await HallAllocation.findOne({ _id: req.body?.hallId, tenantId: req.tenantId });
  if (!hall) return res.status(400).json({ message: 'Choose the hall to allocate this assistant to.' });
  const joinCode = await ensureJoinCode(req.tenant);
  const password = await uniquePassword(req.tenantId, requestedPassword);
  const passwordHash = await bcrypt.hash(password, 12);

  const payload = {
    tenantId: req.tenantId,
    code: joinCode,
    label: name,
    passwordHash,
    passwordPlain: password,
    hallId: hall._id,
    assignmentColumn: hall.assignmentColumn,
    assignmentValues: [hall.assignmentValue],
    createdBy: req.user._id,
    isActive: true,
  };
  let invite;
  try {
    invite = await Invite.create(payload);
  } catch (err) {
    throwIfAssignmentSchema(err);
    throw err;
  }

  res.status(201).json({
    invite: {
      ...invite.toObject(),
      ...joinPayload(joinCode),
      password,
    },
    warning: 'Each hall needs at least two active assistants before anyone assigned to it can verify a student.',
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
      refreshTokens: [],
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
    (await getActiveDistribution(req.tenantId)) ||
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

  const marks = await Collection.find(filter).sort({ collectedAt: -1 }).limit(400).lean();
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
    await User.findByIdAndUpdate(invite.assistantId, { isActive: false, refreshTokens: [] });
  }
  await disconnectUnstaffedHallAssistants(req.app.get('io'), req.tenantId, invite.hallId);

  res.json({ message: 'Assistant access revoked.', invite });
});

export const restoreInvite = asyncHandler(async (req, res) => {
  const invite = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invite) return res.status(404).json({ message: 'Invite not found.' });
  if (isFieldQrCode(invite.code)) {
    return res.status(400).json({ message: 'This invite cannot be managed as an assistant.' });
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
    return res.status(400).json({ message: 'This invite cannot be managed as an assistant.' });
  }

  if (invite.assistantId) {
    await User.findByIdAndUpdate(invite.assistantId, { isActive: false, refreshTokens: [] });
  }
  await Invite.deleteMany({ _id: invite._id, tenantId: req.tenantId });
  await disconnectUnstaffedHallAssistants(req.app.get('io'), req.tenantId, invite.hallId);
  res.json({ message: 'Assistant deleted.' });
});

export const getInvitePublic = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  if (isFieldQrCode(code)) {
    return res.status(404).json({ message: 'This invite link is invalid or has been revoked.' });
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
