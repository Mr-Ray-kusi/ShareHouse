import bcrypt from 'bcryptjs';
import { Invite, Tenant, Distribution, Beneficiary, Collection } from '../models/index.js';
import { generateFieldQrToken, generateInvitePassword, isFieldQrCode } from '../utils/codes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { foldSearch, searchRegex } from '../utils/search.js';
import { track } from '../services/telemetry.js';

function fieldPayload(row) {
  const path = `/field/${row.code}`;
  return {
    id: String(row._id),
    token: row.code,
    label: row.label,
    distributionId: row.distributionId ? String(row.distributionId) : null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    fieldPath: path,
    fieldUrl: `${env.frontendUrl}${path}`,
  };
}

async function resolveFieldQr(token) {
  const code = String(token || '').toUpperCase().trim();
  if (!isFieldQrCode(code)) return null;
  const qr = await Invite.findOne({ code, isActive: true });
  if (!qr) return null;
  const tenant = await Tenant.findOne({ tenantId: qr.tenantId });
  if (!tenant?.hasAccess()) return { error: 402, message: 'This hall subscription is not active.' };
  const dist = await Distribution.findOne({ _id: qr.distributionId, tenantId: qr.tenantId });
  if (!dist || dist.status !== 'active') {
    return { error: 400, message: 'This sharing campaign is not active.' };
  }
  return { qr, tenant, dist };
}

function sheetRowOf(b) {
  return b.sheetRow && Object.keys(b.sheetRow).length
    ? b.sheetRow
    : {
      'Student Index': b.studentIndex,
      'Full Name': b.fullName,
      Level: b.level,
      Phone: b.phone,
    };
}

function headersOf(dist) {
  return dist.sheetHeaders?.length
    ? dist.sheetHeaders
    : ['Student Index', 'Full Name', 'Level', 'Phone'];
}

export const listFieldQrs = asyncHandler(async (req, res) => {
  const items = await Invite.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
  const qrs = items.filter((row) => isFieldQrCode(row.code)).map(fieldPayload);
  const distributions = await Distribution.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
  res.json({
    qrs,
    distributions: distributions.map((d) => ({
      id: String(d._id),
      title: d.title,
      status: d.status,
      itemName: d.itemName,
    })),
  });
});

export const createFieldQrs = asyncHandler(async (req, res) => {
  let count = Number(req.body?.count) || 5;
  if (count < 1) count = 5;
  if (count > 10) count = 10;

  let dist = null;
  if (req.body?.distributionId) {
    dist = await Distribution.findOne({ _id: req.body.distributionId, tenantId: req.tenantId });
  } else {
    dist = await Distribution.findOne({ tenantId: req.tenantId, status: 'active' });
  }
  if (!dist) {
    return res.status(400).json({ message: 'Start a sharing campaign first, then generate QR codes.' });
  }
  if (dist.status !== 'active') {
    return res.status(400).json({ message: 'Activate the campaign before generating field QR codes.' });
  }

  const existing = (await Invite.find({ tenantId: req.tenantId, isActive: true }))
    .filter((row) => isFieldQrCode(row.code) && String(row.distributionId) === String(dist._id));
  if (existing.length + count > 25) {
    return res.status(400).json({ message: 'This campaign already has the maximum number of QR codes.' });
  }

  const created = [];
  for (let i = 0; i < count; i += 1) {
    const token = generateFieldQrToken();
    const secret = generateInvitePassword() + generateInvitePassword();
    const row = await Invite.create({
      tenantId: req.tenantId,
      code: token,
      label: `Station ${existing.length + i + 1}`,
      passwordHash: await bcrypt.hash(secret, 8),
      passwordPlain: '',
      distributionId: dist._id,
      createdBy: req.user._id,
      isActive: true,
    });
    created.push(fieldPayload(row));
  }

  res.status(201).json({
    qrs: created,
    distribution: { id: String(dist._id), title: dist.title },
  });
});

export const revokeFieldQr = asyncHandler(async (req, res) => {
  const qr = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!qr || !isFieldQrCode(qr.code)) {
    return res.status(404).json({ message: 'QR code not found.' });
  }
  qr.isActive = false;
  await qr.save();
  res.json({ message: 'QR code revoked.', qr: fieldPayload(qr) });
});

export const getFieldPublic = asyncHandler(async (req, res) => {
  const resolved = await resolveFieldQr(req.params.token);
  if (!resolved) return res.status(404).json({ message: 'This QR link is invalid or has been revoked.' });
  if (resolved.error) return res.status(resolved.error).json({ message: resolved.message });
  const { qr, tenant, dist } = resolved;
  res.json({
    hallName: tenant.name,
    schoolName: tenant.schoolName,
    campaignTitle: dist.title,
    itemName: dist.itemName,
    station: qr.label,
    headers: headersOf(dist),
  });
});

export const searchFieldPublic = asyncHandler(async (req, res) => {
  const resolved = await resolveFieldQr(req.params.token);
  if (!resolved) return res.status(404).json({ message: 'This QR link is invalid or has been revoked.' });
  if (resolved.error) return res.status(resolved.error).json({ message: resolved.message });
  const { qr, dist } = resolved;

  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ message: 'Type at least 2 characters to search.' });
  }

  track({ pillar: 'behavior', name: 'site_search', term: q, tenantId: qr.tenantId, role: 'field_qr' });
  const rx = searchRegex(q);
  const items = await Beneficiary.find({
    tenantId: qr.tenantId,
    distributionId: dist._id,
    $or: [
      { studentIndex: rx },
      { fullName: rx },
      { phone: rx },
      { level: rx },
      { searchText: rx },
    ],
  }).sort({ fullName: 1, studentIndex: 1 }).limit(40);

  const marks = await Collection.find({ tenantId: qr.tenantId, distributionId: dist._id });
  const markMap = new Map(marks.map((m) => [String(m.beneficiaryId), m]));
  const needle = foldSearch(q);

  const results = items
    .map((b) => {
      const mark = markMap.get(String(b._id));
      const hay = foldSearch(`${b.studentIndex} ${b.fullName} ${b.searchText || ''} ${Object.values(b.sheetRow || {}).join(' ')}`);
      let rank = 0;
      if (foldSearch(b.studentIndex) === needle) rank = 3;
      else if (foldSearch(b.studentIndex).startsWith(needle)) rank = 2;
      else if (hay.includes(needle)) rank = 1;
      return {
        id: String(b._id),
        studentIndex: b.studentIndex,
        fullName: b.fullName,
        level: b.level,
        sheetRow: sheetRowOf(b),
        collected: Boolean(mark),
        collectedAt: mark?.collectedAt || null,
        markedBy: mark?.assistantName || null,
        rank,
      };
    })
    .sort((a, b) => b.rank - a.rank || a.fullName.localeCompare(b.fullName));

  res.json({
    headers: headersOf(dist),
    results,
  });
});

export const verifyFieldPublic = asyncHandler(async (req, res) => {
  const resolved = await resolveFieldQr(req.params.token);
  if (!resolved) return res.status(404).json({ message: 'This QR link is invalid or has been revoked.' });
  if (resolved.error) return res.status(resolved.error).json({ message: resolved.message });
  const { qr, dist } = resolved;

  const { beneficiaryId } = req.body || {};
  if (!beneficiaryId) return res.status(400).json({ message: 'beneficiaryId is required.' });

  const beneficiary = await Beneficiary.findOne({
    _id: beneficiaryId,
    tenantId: qr.tenantId,
    distributionId: dist._id,
  });
  if (!beneficiary) {
    return res.status(404).json({ message: 'Student not found on this hall list.' });
  }

  const existing = await Collection.findOne({
    distributionId: dist._id,
    beneficiaryId: beneficiary._id,
  });
  if (existing) {
    return res.status(409).json({
      message: 'This student has already collected.',
      collection: existing,
    });
  }

  const assistantName = `QR · ${qr.label}`;
  let collection;
  try {
    collection = await Collection.create({
      tenantId: qr.tenantId,
      distributionId: dist._id,
      beneficiaryId: beneficiary._id,
      assistantId: qr._id,
      studentIndex: beneficiary.studentIndex,
      beneficiaryName: beneficiary.fullName,
      assistantName,
      collectedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      const dup = await Collection.findOne({
        distributionId: dist._id,
        beneficiaryId: beneficiary._id,
      });
      return res.status(409).json({
        message: 'This student has already collected.',
        collection: dup,
      });
    }
    throw err;
  }

  const updated = await Distribution.findOneAndUpdate(
    { _id: dist._id },
    { $inc: { receivedCount: 1 } },
    { new: true }
  );

  const payload = {
    collection: {
      id: String(collection._id),
      studentIndex: collection.studentIndex,
      beneficiaryName: collection.beneficiaryName,
      assistantName: collection.assistantName,
      collectedAt: collection.collectedAt,
      beneficiaryId: String(beneficiary._id),
      sheetRow: sheetRowOf(beneficiary),
    },
    stats: {
      total: updated.beneficiaryCount,
      received: updated.receivedCount,
      pending: Math.max(0, updated.beneficiaryCount - updated.receivedCount),
      percent: updated.beneficiaryCount
        ? Math.round((updated.receivedCount / updated.beneficiaryCount) * 100)
        : 0,
    },
  };

  req.app.get('io')?.to(`tenant:${qr.tenantId}`).emit('collection:new', payload);
  track({ pillar: 'funnel', name: 'collection_mark', tenantId: qr.tenantId, role: 'field_qr' });
  res.status(201).json({ message: 'Marked as received.', ...payload });
});
