import { Collection, Distribution, Tenant, User, Beneficiary } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const tenantDashboard = asyncHandler(async (req, res) => {
  const dist =
    (req.query.distributionId
      ? await Distribution.findOne({ _id: req.query.distributionId, tenantId: req.tenantId })
      : null) || (await Distribution.findOne({ tenantId: req.tenantId, status: 'active' })) ||
    (await Distribution.findOne({ tenantId: req.tenantId }).sort({ createdAt: -1 }));

  const [assistantCount, distributionCount] = await Promise.all([
    User.countDocuments({ tenantId: req.tenantId, role: 'assistant', isActive: true }),
    Distribution.countDocuments({ tenantId: req.tenantId }),
  ]);

  let activity = [];
  let stats = { total: 0, received: 0, pending: 0, percent: 0 };

  if (dist) {
    const marks = await Collection.find({
      tenantId: req.tenantId,
      distributionId: dist._id,
    })
      .sort({ collectedAt: -1 })
      .limit(50)
      .lean();

    const beneficiaries = await Beneficiary.find({
      _id: { $in: marks.map((m) => m.beneficiaryId) },
    }).select('sheetRow studentIndex fullName level phone');
    const byId = new Map(beneficiaries.map((b) => [String(b._id), b]));

    activity = marks.map((item) => {
      const b = byId.get(String(item.beneficiaryId));
      return {
        ...item,
        id: String(item._id),
        collected: true,
        markedBy: item.assistantName,
        sheetRow: b?.sheetRow && Object.keys(b.sheetRow || {}).length
          ? b.sheetRow
          : {
            'Student Index': item.studentIndex,
            'Full Name': item.beneficiaryName,
            Level: b?.level || '',
            Phone: b?.phone || '',
          },
      };
    });

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
