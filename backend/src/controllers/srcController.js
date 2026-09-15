import { Distribution, ListException } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getActiveDistribution } from '../services/activeDistribution.js';
import { assertHallUnderSrc, isSrcTenant, listHallsForSrc } from '../utils/srcHalls.js';
import { tenantDashboard } from './dashboardController.js';
import { searchBeneficiaries } from './collectionController.js';
import { exceptionPhoto, listExceptions } from './exceptionController.js';

function requireSrc(req, res) {
  if (!isSrcTenant(req.tenant)) {
    res.status(403).json({ message: 'Only an SRC account can monitor campus halls.' });
    return false;
  }
  return true;
}

function campaignFrom(dist, pendingExceptions) {
  if (!dist) return null;
  const total = dist.beneficiaryCount || 0;
  const received = dist.receivedCount || 0;
  return {
    id: String(dist._id || dist.id),
    title: dist.title,
    itemName: dist.itemName || '',
    status: dist.status,
    total,
    received,
    pending: Math.max(0, total - received),
    percent: total ? Math.round((received / total) * 100) : 0,
    pendingExceptions: pendingExceptions || 0,
  };
}

async function withHall(req, hallId, nextFn) {
  const hall = await assertHallUnderSrc(req.tenant, hallId);
  req.tenantId = hall.tenantId;
  req.tenant = hall;
  return nextFn();
}

export const listSrcHalls = asyncHandler(async (req, res) => {
  if (!requireSrc(req, res)) return;
  const halls = await listHallsForSrc(req.tenant);
  const summaries = [];
  for (const hall of halls) {
    const dist = await getActiveDistribution(hall.tenantId)
      || await Distribution.findOne({ tenantId: hall.tenantId }).sort({ createdAt: -1 });
    const pendingExceptions = dist
      ? await ListException.countDocuments({
        tenantId: hall.tenantId,
        distributionId: dist._id,
        status: 'pending',
      })
      : 0;
    summaries.push({
      tenantId: hall.tenantId,
      name: hall.name,
      schoolName: hall.schoolName,
      isActive: Boolean(hall.isActive),
      linked: hall.srcTenantId === req.tenant.tenantId,
      campaign: campaignFrom(dist, pendingExceptions),
    });
  }
  res.json({
    srcId: req.tenant.tenantId,
    schoolName: req.tenant.schoolName,
    halls: summaries,
  });
});

export const srcHallDashboard = asyncHandler(async (req, res, next) => {
  if (!requireSrc(req, res)) return;
  await withHall(req, req.params.tenantId, () => tenantDashboard(req, res, next));
});

export const srcHallSearch = asyncHandler(async (req, res, next) => {
  if (!requireSrc(req, res)) return;
  await withHall(req, req.params.tenantId, () => searchBeneficiaries(req, res, next));
});

export const srcHallExceptions = asyncHandler(async (req, res, next) => {
  if (!requireSrc(req, res)) return;
  await withHall(req, req.params.tenantId, () => listExceptions(req, res, next));
});

export const srcHallExceptionPhoto = asyncHandler(async (req, res, next) => {
  if (!requireSrc(req, res)) return;
  await withHall(req, req.params.tenantId, () => exceptionPhoto(req, res, next));
});
