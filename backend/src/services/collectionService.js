import { Beneficiary, Collection, CollectionVoid, Distribution } from '../models/index.js';
import { bumpReceivedCount, getActiveDistribution } from './activeDistribution.js';
import { presentBeneficiary, refreshDistributionCounts, statsFromDist } from './listService.js';

export async function resolveActiveForBeneficiary(tenantId, beneficiary) {
  let dist = await getActiveDistribution(tenantId);
  const distId = String(beneficiary.distributionId);
  if (!dist || String(dist._id) !== distId) {
    dist = await Distribution.findOne({
      _id: beneficiary.distributionId,
      tenantId,
    });
  }
  if (!dist || dist.status !== 'active') {
    const err = new Error('This distribution is not active.');
    err.status = 400;
    throw err;
  }
  return dist;
}

export function collectionPayload(collection, beneficiary, stats) {
  return {
    collection: {
      id: String(collection._id),
      studentIndex: collection.studentIndex,
      beneficiaryName: collection.beneficiaryName,
      assistantName: collection.assistantName,
      collectedAt: collection.collectedAt,
      beneficiaryId: String(beneficiary._id || beneficiary.id),
      sheetRow: beneficiary.sheetRow && Object.keys(beneficiary.sheetRow || {}).length
        ? beneficiary.sheetRow
        : {
          'Student Index': beneficiary.studentIndex,
          'Full Name': beneficiary.fullName,
          Level: beneficiary.level,
          Phone: beneficiary.phone,
        },
    },
    stats,
  };
}

export async function createCollectionMark({ tenantId, user, beneficiary, dist }) {
  let collection;
  try {
    collection = await Collection.create({
      tenantId,
      distributionId: dist._id,
      beneficiaryId: beneficiary._id,
      assistantId: user._id,
      studentIndex: beneficiary.studentIndex,
      beneficiaryName: beneficiary.fullName,
      assistantName: user.name,
      collectedAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      const dup = await Collection.findOne({
        distributionId: dist._id,
        beneficiaryId: beneficiary._id,
      });
      const error = new Error('This student has already collected.');
      error.status = 409;
      error.collection = dup;
      throw error;
    }
    throw err;
  }

  const updated = await bumpReceivedCount(dist);
  return {
    collection,
    dist: updated,
    payload: collectionPayload(collection, beneficiary, statsFromDist(updated)),
  };
}

export async function voidCollectionMark({ tenantId, user, beneficiaryId, reason }) {
  const beneficiary = await Beneficiary.findOne({ _id: beneficiaryId, tenantId });
  if (!beneficiary) {
    const err = new Error('Student not found on this hall list.');
    err.status = 404;
    throw err;
  }

  const mark = await Collection.findOne({
    tenantId,
    distributionId: beneficiary.distributionId,
    beneficiaryId: beneficiary._id,
  });
  if (!mark) {
    const err = new Error('This student has not been marked received.');
    err.status = 404;
    throw err;
  }

  const dist = await Distribution.findOne({ _id: beneficiary.distributionId, tenantId });
  await CollectionVoid.create({
    tenantId,
    distributionId: beneficiary.distributionId,
    beneficiaryId: beneficiary._id,
    collectionId: mark._id,
    studentIndex: mark.studentIndex,
    beneficiaryName: mark.beneficiaryName,
    originalAssistantId: mark.assistantId,
    originalAssistantName: mark.assistantName,
    originalCollectedAt: mark.collectedAt,
    voidedBy: user._id,
    voidedByName: user.name,
    reason,
  });
  await Collection.deleteMany({ _id: mark._id });
  if (dist) await refreshDistributionCounts(dist);

  return {
    beneficiary,
    mark,
    dist,
    payload: {
      beneficiaryId: String(beneficiary._id),
      collectionId: String(mark._id),
      studentIndex: beneficiary.studentIndex,
      beneficiaryName: beneficiary.fullName,
      reason,
      voidedByName: user.name,
      stats: statsFromDist(dist),
      beneficiary: presentBeneficiary(beneficiary, null, dist?.sheetHeaders),
    },
  };
}
