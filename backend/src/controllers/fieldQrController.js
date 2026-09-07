import { Invite, Tenant, Distribution, Beneficiary, Collection } from '../models/index.js';
import { isFieldQrCode } from '../utils/codes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { env } from '../config/env.js';
import { foldSearch, searchRegex } from '../utils/search.js';
import { track } from '../services/telemetry.js';
import { cacheWrap } from '../utils/cache.js';
import { ensureCollectionUnit, readUnitCode, rotateCollectionUnit, unitCodesMatch } from '../services/collectionUnit.js';

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
  return cacheWrap(`fieldqr:${code}`, 15000, async () => {
    const qr = await Invite.findOne({ code, isActive: true });
    if (!qr) return null;
    const [tenant, dist] = await Promise.all([
      Tenant.findOne({ tenantId: qr.tenantId }),
      qr.distributionId
        ? Distribution.findOne({ _id: qr.distributionId, tenantId: qr.tenantId })
        : Distribution.findOne({ tenantId: qr.tenantId, status: 'active' }),
    ]);
    if (!tenant?.hasAccess()) return { error: 402, message: 'This hall subscription is not active.' };
    if (!dist || dist.status !== 'active') {
      return { error: 400, message: 'This sharing campaign is not active.' };
    }
    return { qr, tenant, dist };
  });
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
  const distributions = await Distribution.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
  const active = distributions.find((d) => d.status === 'active');
  let unitCode = '';
  let primary = null;

  if (active) {
    const pack = await ensureCollectionUnit({
      tenantId: req.tenantId,
      distributionId: active._id,
      createdBy: req.user._id,
    });
    unitCode = pack.unitCode;
    primary = pack.qr;
  } else {
    unitCode = await readUnitCode(req.tenantId);
  }

  res.json({
    unitCode,
    qrs: primary ? [fieldPayload(primary)] : [],
    distributions: distributions.map((d) => ({
      id: String(d._id),
      title: d.title,
      status: d.status,
      itemName: d.itemName,
    })),
  });
});

export const createFieldQrs = asyncHandler(async (req, res) => {
  let dist = null;
  if (req.body?.distributionId) {
    dist = await Distribution.findOne({ _id: req.body.distributionId, tenantId: req.tenantId });
  } else {
    dist = await Distribution.findOne({ tenantId: req.tenantId, status: 'active' });
  }
  if (!dist) {
    return res.status(400).json({ message: 'Start a sharing campaign first, then generate the collection QR.' });
  }
  if (dist.status !== 'active') {
    return res.status(400).json({ message: 'Activate the campaign before generating the collection QR.' });
  }

  const pack = await ensureCollectionUnit({
    tenantId: req.tenantId,
    distributionId: dist._id,
    createdBy: req.user._id,
  });

  res.status(201).json({
    unitCode: pack.unitCode,
    qrs: [fieldPayload(pack.qr)],
    distribution: { id: String(dist._id), title: dist.title },
  });
});

export const rotateUnitCode = asyncHandler(async (req, res) => {
  const { unitCode, updated } = await rotateCollectionUnit(req.tenantId);
  if (!updated) {
    return res.status(400).json({ message: 'Create the collection QR first, then rotate the unit code.' });
  }
  res.json({
    unitCode,
    message: 'New unit code set. Share it only with collection assistants.',
  });
});

export const deleteFieldQr = asyncHandler(async (req, res) => {
  const qr = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!qr || !isFieldQrCode(qr.code)) {
    return res.status(404).json({ message: 'QR code not found.' });
  }
  const unitCode = qr.passwordPlain || await readUnitCode(req.tenantId);
  await Invite.deleteMany({ _id: qr._id, tenantId: req.tenantId });
  if (qr.distributionId) {
    await ensureCollectionUnit({
      tenantId: req.tenantId,
      distributionId: qr.distributionId,
      createdBy: req.user._id,
      preferredCode: unitCode,
    });
  }
  res.json({ message: 'QR code replaced with a fresh shared link. The unit code is unchanged.' });
});

export const getFieldPublic = asyncHandler(async (req, res) => {
  const resolved = await resolveFieldQr(req.params.token);
  if (!resolved) return res.status(404).json({ message: 'This QR link is invalid or has been revoked.' });
  if (resolved.error) return res.status(resolved.error).json({ message: resolved.message });
  const { qr, tenant, dist } = resolved;
  if (!String(qr.passwordPlain || '').trim()) {
    const pack = await ensureCollectionUnit({
      tenantId: qr.tenantId,
      distributionId: dist._id,
      createdBy: qr.createdBy,
    });
    qr.passwordPlain = pack.unitCode;
  }
  res.json({
    hallName: tenant.name,
    schoolName: tenant.schoolName,
    campaignTitle: dist.title,
    itemName: dist.itemName,
    station: qr.label,
    headers: headersOf(dist),
    requiresUnitCode: true,
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
  }).select('studentIndex fullName level phone sheetRow searchText').sort({ fullName: 1, studentIndex: 1 }).limit(24);

  const marks = items.length
    ? await Collection.find({
      tenantId: qr.tenantId,
      distributionId: dist._id,
      beneficiaryId: { $in: items.map((b) => b._id) },
    }).select('beneficiaryId collectedAt assistantName')
    : [];
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
    requiresUnitCode: true,
  });
});

export const verifyFieldPublic = asyncHandler(async (req, res) => {
  const resolved = await resolveFieldQr(req.params.token);
  if (!resolved) return res.status(404).json({ message: 'This QR link is invalid or has been revoked.' });
  if (resolved.error) return res.status(resolved.error).json({ message: resolved.message });
  const { qr, dist } = resolved;

  const { beneficiaryId, unitCode } = req.body || {};
  if (!beneficiaryId) return res.status(400).json({ message: 'beneficiaryId is required.' });

  const storedCode = qr.passwordPlain || await readUnitCode(qr.tenantId);
  if (!storedCode || !unitCodesMatch(unitCode, storedCode)) {
    return res.status(401).json({
      message: 'Enter the unit code from a hall admin or collection assistant to finish verification.',
      code: 'UNIT_CODE_REQUIRED',
    });
  }

  const beneficiary = await Beneficiary.findOne({
    _id: beneficiaryId,
    tenantId: qr.tenantId,
    distributionId: dist._id,
  }).select('studentIndex fullName level phone sheetRow');
  if (!beneficiary) {
    return res.status(404).json({ message: 'Student not found on this hall list.' });
  }

  const existing = await Collection.findOne({
    distributionId: dist._id,
    beneficiaryId: beneficiary._id,
  }).select('assistantName collectedAt studentIndex beneficiaryName');
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
      }).select('assistantName collectedAt studentIndex beneficiaryName');
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
