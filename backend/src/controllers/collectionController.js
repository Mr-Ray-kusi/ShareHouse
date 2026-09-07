import { Beneficiary, Collection, Distribution } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { foldSearch, searchRegex } from '../utils/search.js';
import { track } from '../services/telemetry.js';
import { ensureCollectionUnit, readUnitCode } from '../services/collectionUnit.js';

async function resolveWorkingDistribution(req) {
  if (req.query.distributionId || req.body?.distributionId) {
    const id = req.query.distributionId || req.body.distributionId;
    const dist = await Distribution.findOne({ _id: id, tenantId: req.tenantId });
    return dist;
  }
  return Distribution.findOne({ tenantId: req.tenantId, status: 'active' });
}

export const searchBeneficiaries = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const dist = await resolveWorkingDistribution(req);
  if (!dist) {
    return res.status(404).json({ message: 'No active distribution. Ask the hall president to start one.' });
  }

  const filter = {
    tenantId: req.tenantId,
    distributionId: dist._id,
  };
  if (q) {
    track({ pillar: 'behavior', name: 'site_search', term: q, tenantId: req.tenantId || '', role: req.user?.role || '' });
    const rx = searchRegex(q);
    filter.$or = [
      { studentIndex: rx },
      { fullName: rx },
      { phone: rx },
      { level: rx },
      { searchText: rx },
    ];
  }

  const headers = dist.sheetHeaders?.length
    ? dist.sheetHeaders
    : ['Student Index', 'Full Name', 'Level', 'Phone'];

  let unitCode = await readUnitCode(req.tenantId);
  if (!unitCode) {
    const pack = await ensureCollectionUnit({
      tenantId: req.tenantId,
      distributionId: dist._id,
      createdBy: req.user._id,
    });
    unitCode = pack.unitCode;
  }

  const meta = {
    distribution: {
      id: dist._id,
      title: dist.title,
      itemName: dist.itemName,
      status: dist.status,
      beneficiaryCount: dist.beneficiaryCount,
    },
    headers,
    unitCode,
  };

  if (req.query.meta === '1' || (!q && req.user.role === 'assistant')) {
    return res.json({ ...meta, results: [] });
  }

  const limit = q ? 40 : 5000;
  const items = await Beneficiary.find(filter)
    .select('studentIndex fullName level phone sheetRow searchText')
    .sort({ fullName: 1, studentIndex: 1 })
    .limit(limit);
  const marks = items.length
    ? await Collection.find({
      tenantId: req.tenantId,
      distributionId: dist._id,
      beneficiaryId: { $in: items.map((b) => b._id) },
    }).select('beneficiaryId collectedAt assistantName assistantId')
    : [];
  const markMap = new Map(marks.map((m) => [String(m.beneficiaryId), m]));
  const needle = foldSearch(q);

  const ranked = items
    .map((b) => {
      const mark = markMap.get(String(b._id));
      let rank = 0;
      if (q) {
        const hay = foldSearch(`${b.studentIndex} ${b.fullName} ${b.searchText || ''} ${Object.values(b.sheetRow || {}).join(' ')}`);
        if (foldSearch(b.studentIndex) === needle) rank = 3;
        else if (foldSearch(b.studentIndex).startsWith(needle)) rank = 2;
        else if (hay.includes(needle)) rank = 1;
      }
      return {
        id: String(b._id),
        studentIndex: b.studentIndex,
        fullName: b.fullName,
        level: b.level,
        phone: b.phone,
        sheetRow: b.sheetRow && Object.keys(b.sheetRow).length
          ? b.sheetRow
          : {
            'Student Index': b.studentIndex,
            'Full Name': b.fullName,
            Level: b.level,
            Phone: b.phone,
          },
        collected: Boolean(mark),
        collectedAt: mark?.collectedAt || null,
        markedBy: mark?.assistantName || null,
        assistantId: mark?.assistantId ? String(mark.assistantId) : null,
        rank,
      };
    })
    .sort((a, b) => (q ? b.rank - a.rank : 0) || a.fullName.localeCompare(b.fullName));

  res.json({
    ...meta,
    results: ranked,
  });
});

export const markReceived = asyncHandler(async (req, res) => {
  if (req.user.role === 'super_admin') {
    return res.status(403).json({ message: 'Super admins cannot mark beneficiaries.' });
  }

  const { beneficiaryId } = req.body || {};
  if (!beneficiaryId) {
    return res.status(400).json({ message: 'beneficiaryId is required.' });
  }

  const beneficiary = await Beneficiary.findOne({
    _id: beneficiaryId,
    tenantId: req.tenantId,
  });
  if (!beneficiary) {
    return res.status(404).json({ message: 'Student not found on this hall list.' });
  }

  const dist = await Distribution.findOne({
    _id: beneficiary.distributionId,
    tenantId: req.tenantId,
  });
  if (!dist || dist.status !== 'active') {
    return res.status(400).json({ message: 'This distribution is not active.' });
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

  let collection;
  try {
    collection = await Collection.create({
      tenantId: req.tenantId,
      distributionId: dist._id,
      beneficiaryId: beneficiary._id,
      assistantId: req.user._id,
      studentIndex: beneficiary.studentIndex,
      beneficiaryName: beneficiary.fullName,
      assistantName: req.user.name,
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
      sheetRow: beneficiary.sheetRow && Object.keys(beneficiary.sheetRow || {}).length
        ? beneficiary.sheetRow
        : {
          'Student Index': beneficiary.studentIndex,
          'Full Name': beneficiary.fullName,
          Level: beneficiary.level,
          Phone: beneficiary.phone,
        },
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

  const io = req.app.get('io');
  io?.to(`tenant:${req.tenantId}`).emit('collection:new', payload);
  track({ pillar: 'funnel', name: 'collection_mark', tenantId: req.tenantId || '', role: req.user?.role || '' });

  res.status(201).json({ message: 'Marked as received.', ...payload });
});

export const activityFeed = asyncHandler(async (req, res) => {
  const dist = await resolveWorkingDistribution(req);
  const filter = { tenantId: req.tenantId };
  if (dist) filter.distributionId = dist._id;
  const items = await Collection.find(filter).sort({ collectedAt: -1 }).limit(Number(req.query.limit) || 40);
  res.json({ activity: items, distribution: dist });
});
