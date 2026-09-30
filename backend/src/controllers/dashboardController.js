import { Collection, Distribution, Tenant, User, ListException } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { liveStatsForDistribution } from '../services/listService.js';

export const tenantDashboard = asyncHandler(async (req, res) => {
  const dist =
    (req.query.distributionId
      ? await Distribution.findOne({ _id: req.query.distributionId, tenantId: req.tenantId })
      : null) ||
    (await Distribution.findOne({ tenantId: req.tenantId, status: 'active' })) ||
    (await Distribution.findOne({ tenantId: req.tenantId }).sort({ createdAt: -1 }));

  const distributionId = dist?._id || dist?.id;

  const [assistantCount, distributionCount, marks, pendingExceptions, stats] = await Promise.all([
    User.countDocuments({ tenantId: req.tenantId, role: 'assistant', isActive: true }),
    Distribution.countDocuments({ tenantId: req.tenantId }),
    dist
      ? Collection.find({
        tenantId: req.tenantId,
        distributionId,
      })
        .sort({ collectedAt: -1 })
        .limit(50)
        .lean()
      : Promise.resolve([]),
    dist
      ? ListException.countDocuments({
        tenantId: req.tenantId,
        distributionId,
        status: 'pending',
      })
      : Promise.resolve(0),
    liveStatsForDistribution(req.tenantId, dist),
  ]);

  let activity = [];
  if (dist) {
    dist.beneficiaryCount = stats.total;
    dist.receivedCount = stats.received;
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
