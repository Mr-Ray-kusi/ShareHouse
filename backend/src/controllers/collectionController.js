import { Collection, CollectionVoid, Beneficiary, Distribution } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { foldSearch, looksLikeStudentIndex, searchRegex } from '../utils/search.js';
import { track } from '../services/telemetry.js';
import { getActiveDistribution } from '../services/activeDistribution.js';
import { defaultHeaders, presentBeneficiary, statsFromDist } from '../services/listService.js';
import {
  createCollectionMark,
  resolveActiveForBeneficiary,
  voidCollectionMark,
} from '../services/collectionService.js';

async function resolveWorkingDistribution(req) {
  if (req.query.distributionId || req.body?.distributionId) {
    const id = req.query.distributionId || req.body.distributionId;
    return Distribution.findOne({ _id: id, tenantId: req.tenantId });
  }
  return getActiveDistribution(req.tenantId);
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
    if (looksLikeStudentIndex(q)) {
      filter.studentIndex = { $startsWith: q.trim() };
    } else {
      filter.searchText = searchRegex(q);
    }
  }

  const headers = dist.sheetHeaders?.length ? dist.sheetHeaders : defaultHeaders();
  const meta = {
    distribution: {
      id: dist._id,
      title: dist.title,
      itemName: dist.itemName,
      status: dist.status,
      beneficiaryCount: dist.beneficiaryCount,
    },
    headers,
    offline: false,
  };

  if (req.query.meta === '1' || (!q && req.user.role === 'assistant')) {
    return res.json({ ...meta, results: [] });
  }

  const limit = q ? 24 : 2000;
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
        const hay = foldSearch(`${b.studentIndex} ${b.fullName} ${Object.values(b.sheetRow || {}).join(' ')}`);
        if (foldSearch(b.studentIndex) === needle) rank = 3;
        else if (foldSearch(b.studentIndex).startsWith(needle)) rank = 2;
        else if (hay.includes(needle)) rank = 1;
      }
      return { ...presentBeneficiary(b, mark, headers), rank };
    })
    .sort((a, b) => (q ? b.rank - a.rank : 0) || a.fullName.localeCompare(b.fullName));

  res.json({
    ...meta,
    results: ranked,
  });
});

export const offlinePack = asyncHandler(async (req, res) => {
  const dist = await getActiveDistribution(req.tenantId);
  if (!dist) {
    return res.status(404).json({ message: 'No active distribution. Ask the hall president to start one.' });
  }

  const headers = dist.sheetHeaders?.length ? dist.sheetHeaders : defaultHeaders();
  const items = await Beneficiary.find({
    tenantId: req.tenantId,
    distributionId: dist._id,
  })
    .select('studentIndex fullName level phone sheetRow searchText')
    .sort({ fullName: 1, studentIndex: 1 })
    .limit(8000);
  const marks = items.length
    ? await Collection.find({
      tenantId: req.tenantId,
      distributionId: dist._id,
      beneficiaryId: { $in: items.map((b) => b._id) },
    }).select('beneficiaryId collectedAt assistantName assistantId')
    : [];
  const markMap = new Map(marks.map((m) => [String(m.beneficiaryId), m]));

  res.json({
    fetchedAt: new Date().toISOString(),
    tenantId: req.tenantId,
    distribution: {
      id: String(dist._id),
      title: dist.title,
      itemName: dist.itemName,
      status: dist.status,
      beneficiaryCount: dist.beneficiaryCount,
      receivedCount: dist.receivedCount,
    },
    headers,
    stats: statsFromDist(dist),
    truncated: items.length >= 8000,
    beneficiaries: items.map((b) => presentBeneficiary(b, markMap.get(String(b._id)), headers)),
  });
});

async function markOne(req, beneficiaryId) {
  if (req.user.role === 'super_admin') {
    const err = new Error('Super admins cannot mark beneficiaries.');
    err.status = 403;
    throw err;
  }
  if (!beneficiaryId) {
    const err = new Error('beneficiaryId is required.');
    err.status = 400;
    throw err;
  }

  const beneficiary = await Beneficiary.findOne({
    _id: beneficiaryId,
    tenantId: req.tenantId,
  });
  if (!beneficiary) {
    const err = new Error('Student not found on this hall list.');
    err.status = 404;
    throw err;
  }

  const dist = await resolveActiveForBeneficiary(req.tenantId, beneficiary);
  const result = await createCollectionMark({
    tenantId: req.tenantId,
    user: req.user,
    beneficiary,
    dist,
  });
  const io = req.app.get('io');
  io?.to(`tenant:${req.tenantId}`).emit('collection:new', result.payload);
  track({ pillar: 'funnel', name: 'collection_mark', tenantId: req.tenantId || '', role: req.user?.role || '' });
  return result;
}

export const markReceived = asyncHandler(async (req, res) => {
  try {
    const result = await markOne(req, req.body?.beneficiaryId);
    res.status(201).json({ message: 'Marked as received.', ...result.payload });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({
        message: err.message,
        collection: err.collection,
      });
    }
    throw err;
  }
});

export const markReceivedBatch = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
  if (!items.length) {
    return res.status(400).json({ message: 'items is required.' });
  }

  const results = [];
  for (const item of items) {
    const beneficiaryId = item?.beneficiaryId;
    try {
      const result = await markOne(req, beneficiaryId);
      results.push({
        beneficiaryId,
        status: 'accepted',
        collection: result.payload.collection,
        stats: result.payload.stats,
      });
    } catch (err) {
      results.push({
        beneficiaryId,
        status: err.status === 409 ? 'duplicate' : 'failed',
        message: err.message,
        collection: err.collection || null,
      });
    }
  }

  res.json({ results });
});

export const voidReceived = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tenant_admin') {
    return res.status(403).json({ message: 'Only the hall admin can void a mark.' });
  }
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) {
    return res.status(400).json({ message: 'Give a short reason for voiding this mark.' });
  }
  if (!req.body?.beneficiaryId) {
    return res.status(400).json({ message: 'beneficiaryId is required.' });
  }

  const result = await voidCollectionMark({
    tenantId: req.tenantId,
    user: req.user,
    beneficiaryId: req.body.beneficiaryId,
    reason,
  });

  const io = req.app.get('io');
  io?.to(`tenant:${req.tenantId}`).emit('collection:void', result.payload);
  track({ pillar: 'funnel', name: 'collection_void', tenantId: req.tenantId || '' });

  res.json({
    message: `${result.beneficiary.fullName} was unmarked.`,
    ...result.payload,
  });
});

export const activityFeed = asyncHandler(async (req, res) => {
  const dist = await resolveWorkingDistribution(req);
  const filter = { tenantId: req.tenantId };
  if (dist) filter.distributionId = dist._id;
  const items = await Collection.find(filter).sort({ collectedAt: -1 }).limit(Number(req.query.limit) || 40);
  res.json({ activity: items, distribution: dist });
});

export const listVoids = asyncHandler(async (req, res) => {
  const dist = await resolveWorkingDistribution(req);
  const filter = { tenantId: req.tenantId };
  if (dist) filter.distributionId = dist._id;
  const items = await CollectionVoid.find(filter).sort({ createdAt: -1 }).limit(40);
  res.json({ voids: items });
});
