import { Beneficiary, Distribution } from '../models/index.js';
import {
  forgetActiveDistribution,
  rememberActiveDistribution,
} from './activeDistribution.js';

export const STUDENT_FEE_PESEWAS = 5;

export function campaignBillingQuote(studentCount) {
  const amountPesewas = studentCount * STUDENT_FEE_PESEWAS;
  if (!Number.isSafeInteger(studentCount) || studentCount < 0 || !Number.isSafeInteger(amountPesewas)) {
    const err = new Error('This student list is too large to calculate a valid payment.');
    err.status = 400;
    throw err;
  }
  return {
    studentCount,
    ratePesewas: STUDENT_FEE_PESEWAS,
    amountPesewas,
  };
}

export function clearCampaignPayment(dist) {
  dist.paymentStatus = 'unpaid';
  dist.paymentAmount = 0;
  dist.paymentStudentCount = 0;
  dist.paymentReference = '';
  dist.paymentUrl = '';
  dist.paymentPaidAt = null;
}

export async function requireNoPendingPayment(dist) {
  if (dist.paymentStatus !== 'pending') return;
  const updatedAt = new Date(dist.updatedAt || 0).getTime();
  if (!dist.paymentUrl && Date.now() - updatedAt >= 120_000) {
    clearCampaignPayment(dist);
    await dist.save();
    return;
  }
  const err = new Error('A campaign payment is already in progress. Complete it before changing this list.');
  err.status = 409;
  throw err;
}

export async function pauseCampaignForListChange(dist) {
  await requireNoPendingPayment(dist);
  if (dist.status !== 'active') return;
  dist.status = 'draft';
  await dist.save();
  forgetActiveDistribution(dist.tenantId);
}

export async function syncCampaignAfterListChange(dist) {
  const count = await Beneficiary.countDocuments({
    tenantId: dist.tenantId,
    distributionId: dist._id,
  });
  dist.beneficiaryCount = count;
  if (
    dist.paymentStatus === 'paid'
    && (dist.paymentStudentCount !== count || dist.paymentAmount !== count * STUDENT_FEE_PESEWAS)
  ) {
    clearCampaignPayment(dist);
  }
  await dist.save();
  forgetActiveDistribution(dist.tenantId);
  return dist;
}

export async function activatePaidCampaign(dist) {
  const count = await Beneficiary.countDocuments({
    tenantId: dist.tenantId,
    distributionId: dist._id,
  });
  if (
    !count
    || dist.paymentStatus !== 'paid'
    || dist.paymentStudentCount !== count
    || dist.paymentAmount !== count * STUDENT_FEE_PESEWAS
  ) {
    const err = new Error('Campaign payment does not match the current student list. Start a new payment.');
    err.status = 409;
    throw err;
  }
  await Distribution.updateMany(
    { tenantId: dist.tenantId, status: 'active', _id: { $ne: dist._id } },
    { $set: { status: 'completed' } }
  );
  dist.beneficiaryCount = count;
  dist.status = 'active';
  await dist.save();
  forgetActiveDistribution(dist.tenantId);
  rememberActiveDistribution(dist.tenantId, dist);
  return dist;
}
