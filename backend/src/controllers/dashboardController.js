import { Collection, Distribution, Tenant, User, ListException } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getActiveDistribution } from '../services/activeDistribution.js';

export const tenantDashboard = asyncHandler(async (req, res) => {
  const dist =
    (req.query.distributionId
      ? await Distribution.findOne({ _id: req.query.distributionId, tenantId: req.tenantId })
      : null) ||
    (await getActiveDistribution(req.tenantId)) ||
    (await Distribution.findOne({ tenantId: req.tenantId }).sort({ createdAt: -1 }));

  const [assistantCount, distributionCount, marks, pendingExceptions] = await Promise.all([
    User.countDocuments({ tenantId: req.tenantId, role: 'assistant', isActive: true }),
    Distribution.countDocuments({ tenantId: req.tenantId }),
    dist
      ? Collection.find({
        tenantId: req.tenantId,
        distributionId: dist._id,
      })
        .sort({ collectedAt: -1 })
        .limit(50)
        .lean()
      : Promise.resolve([]),
    dist
      ? ListException.countDocuments({
        tenantId: req.tenantId,
        distributionId: dist._id,
        status: 'pending',
      })
      : Promise.resolve(0),
  ]);

  let activity = [];
  let stats = { total: 0, received: 0, pending: 0, percent: 0 };

  if (dist) {
    activity = marks.map((item) => ({
      ...item,
      id: String(item._id),
      beneficiaryId: item.beneficiaryId ? String(item.beneficiaryId) : null,
      collected: true,
      markedBy: item.assistantName,
      sheetRow: {
        'Student Index': item.studentIndex,
        'Full Name': item.beneficiaryName,
      },
    }));

    stats = {
      total: dist.beneficiaryCount,
      received: dist.receivedCount,
      pending: Math.max(0, dist.beneficiaryCount - dist.receivedCount),
      percent: dist.beneficiaryCount
        ? Math.round((dist.receivedCount / dist.beneficiaryCount) * 100)
        : 0,
    };
  }

  res.json({
    tenant: req.tenant,
    distribution: dist,
    stats,
    activity,
    headers: dist?.sheetHeaders || [],
    pendingExceptions,
    meta: { assistantCount, distributionCount },
  });
});

export const tenantLookup = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ tenantId: req.params.tenantId }).select(
    'tenantId name schoolName isActive expiryDate subscriptionPlan'
  );
  if (!tenant) return res.status(404).json({ message: 'Hall not found.' });
  res.json({ tenant });
});
