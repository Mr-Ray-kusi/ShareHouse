import { Distribution, Beneficiary, Collection, SheetUpload } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseBeneficiaryWorkbook } from '../services/excelService.js';
import { looksLikeStudentIndex, searchRegex } from '../utils/search.js';
import { saveUploadBuffer } from '../utils/uploads.js';
import { track } from '../services/telemetry.js';
import {
  forgetActiveDistribution,
  getActiveDistribution as loadActiveDistribution,
  rememberActiveDistribution,
} from '../services/activeDistribution.js';
import {
  applyListUpload,
  beneficiaryPayload,
  defaultHeaders,
  findDuplicateIndex,
  presentBeneficiary,
  previewListUpload,
  refreshDistributionCounts,
} from '../services/listService.js';

function truthy(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

async function parseUploadedWorkbook(req) {
  if (!req.file?.buffer) {
    const err = new Error('Upload an Excel file (.xlsx, .xls, or .csv).');
    err.status = 400;
    throw err;
  }
  return parseBeneficiaryWorkbook(req.file.buffer);
}

async function requireDistribution(req) {
  const dist = await Distribution.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!dist) {
    const err = new Error('Distribution not found.');
    err.status = 404;
    throw err;
  }
  return dist;
}

export const listDistributions = asyncHandler(async (req, res) => {
  const items = await Distribution.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
  res.json({ distributions: items });
});

export const createDistribution = asyncHandler(async (req, res) => {
  const { title, description, itemName, startDate, endDate } = req.body || {};
  if (!title?.trim()) {
    return res.status(400).json({ message: 'Distribution title is required.' });
  }

  const dist = await Distribution.create({
    tenantId: req.tenantId,
    title: title.trim(),
    description: description?.trim() || '',
    itemName: itemName?.trim() || '',
    startDate: startDate || null,
    endDate: endDate || null,
    createdBy: req.user._id,
    status: 'draft',
  });

  res.status(201).json({ distribution: dist });
});

export const getDistribution = asyncHandler(async (req, res) => {
  const dist = await Distribution.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!dist) return res.status(404).json({ message: 'Distribution not found.' });
  res.json({ distribution: dist });
});

export const updateDistribution = asyncHandler(async (req, res) => {
  const dist = await Distribution.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!dist) return res.status(404).json({ message: 'Distribution not found.' });

  const { title, description, itemName, startDate, endDate } = req.body || {};
  if (title !== undefined) dist.title = title.trim();
  if (description !== undefined) dist.description = description.trim();
  if (itemName !== undefined) dist.itemName = itemName.trim();
  if (startDate !== undefined) dist.startDate = startDate || null;
  if (endDate !== undefined) dist.endDate = endDate || null;
  await dist.save();
  res.json({ distribution: dist });
});

export const setDistributionStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['draft', 'active', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Invalid distribution status.' });
  }

  const dist = await Distribution.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!dist) return res.status(404).json({ message: 'Distribution not found.' });

  if (status === 'active') {
    await Distribution.updateMany(
      { tenantId: req.tenantId, status: 'active', _id: { $ne: dist._id } },
      { $set: { status: 'completed' } }
    );
  }

  dist.status = status;
  await dist.save();
  forgetActiveDistribution(req.tenantId);
  if (status === 'active') rememberActiveDistribution(req.tenantId, dist);
  res.json({ distribution: dist });
});

export const previewBeneficiariesUpload = asyncHandler(async (req, res) => {
  const dist = await requireDistribution(req);
  const parsed = await parseUploadedWorkbook(req);
  const diff = await previewListUpload(dist, parsed.beneficiaries);
  res.json({
    headers: parsed.headers,
    skipped: parsed.skipped,
    totalRows: parsed.totalRows,
    columns: parsed.columns,
    fileName: req.file.originalname,
    existingCount: diff.existingCount,
    incomingCount: diff.incomingCount,
    ...diff.summary,
    needsConfirmRemove: diff.missingCollected.length > 0,
    needsConfirmReset: (dist.receivedCount || 0) > 0,
  });
});

export const uploadBeneficiaries = asyncHandler(async (req, res) => {
  const dist = await requireDistribution(req);
  const parsed = await parseUploadedWorkbook(req);
  const diff = await previewListUpload(dist, parsed.beneficiaries);

  const resetMarks = truthy(req.body?.resetMarks);
  const removeMissing = resetMarks || truthy(req.body?.removeMissing);

  if (resetMarks && (dist.receivedCount || 0) > 0 && !truthy(req.body?.confirmResetMarks)) {
    return res.status(409).json({
      message: 'This will erase every mark for this distribution. Confirm to continue.',
      code: 'CONFIRM_RESET_MARKS',
      receivedCount: dist.receivedCount,
      ...diff.summary,
    });
  }

  if (
    removeMissing
    && !resetMarks
    && diff.missingCollected.length
    && !truthy(req.body?.confirmRemoveCollected)
  ) {
    return res.status(409).json({
      message: `${diff.missingCollected.length} student(s) already collected would be removed. Confirm to continue.`,
      code: 'CONFIRM_REMOVE_COLLECTED',
      collectedCount: diff.missingCollected.length,
      ...diff.summary,
    });
  }

  const { dist: updated, diff: applied } = await applyListUpload(dist, parsed.beneficiaries, {
    headers: parsed.headers,
    removeMissing,
    resetMarks,
  });

  updated.originalFileName = req.file.originalname;
  updated.storedFileName = await saveUploadBuffer(req.file.buffer, req.file.originalname);
  if (updated.status === 'draft') {
    await Distribution.updateMany(
      { tenantId: req.tenantId, status: 'active', _id: { $ne: updated._id } },
      { $set: { status: 'completed' } }
    );
    updated.status = 'active';
    await updated.save();
    forgetActiveDistribution(req.tenantId);
    rememberActiveDistribution(req.tenantId, updated);
  } else {
    await updated.save();
  }

  await SheetUpload.create({
    tenantId: req.tenantId,
    tenantName: req.tenant?.name || '',
    schoolName: req.tenant?.schoolName || '',
    distributionId: updated._id,
    distributionTitle: updated.title,
    originalFileName: req.file.originalname,
    storedFileName: updated.storedFileName,
    mimeType: req.file.mimetype || '',
    size: req.file.size || req.file.buffer?.length || 0,
    uploadedBy: req.user._id,
  });
  track({ pillar: 'funnel', name: 'excel_upload', tenantId: req.tenantId || '', value: parsed.beneficiaries.length });

  const added = applied.added.length;
  const changed = applied.updated.length;
  const keptMarks = resetMarks ? 0 : updated.receivedCount;
  res.json({
    message: resetMarks
      ? `Replaced the list with ${parsed.beneficiaries.length} students and reset all marks.`
      : `Updated the list: ${added} added, ${changed} details changed. ${keptMarks} mark${keptMarks === 1 ? '' : 's'} kept.`,
    inserted: added,
    updated: changed,
    unchanged: applied.unchanged.length,
    removed: removeMissing ? applied.missingFromFile.length : 0,
    skipped: parsed.skipped,
    totalRows: parsed.totalRows,
    columns: parsed.columns,
    headers: updated.sheetHeaders,
    distribution: updated,
  });
});

export const addBeneficiary = asyncHandler(async (req, res) => {
  const dist = await requireDistribution(req);
  const headers = dist.sheetHeaders?.length ? dist.sheetHeaders : defaultHeaders();
  const payload = beneficiaryPayload(req.body || {}, headers);
  if (!payload.fullName) {
    return res.status(400).json({ message: 'Full name is required.' });
  }
  if (!payload.studentIndex) {
    return res.status(400).json({ message: 'Student index is required.' });
  }
  const duplicate = await findDuplicateIndex(req.tenantId, dist._id, payload.studentIndex);
  if (duplicate) {
    return res.status(409).json({
      message: `${payload.studentIndex} is already on this list (${duplicate.fullName}).`,
      beneficiary: presentBeneficiary(duplicate, null, headers),
    });
  }

  const created = await Beneficiary.create({
    tenantId: req.tenantId,
    distributionId: dist._id,
    ...payload,
  });
  dist.sheetHeaders = headers;
  await refreshDistributionCounts(dist);
  track({ pillar: 'funnel', name: 'beneficiary_add', tenantId: req.tenantId || '' });
  res.status(201).json({
    message: 'Student added to the list.',
    beneficiary: presentBeneficiary(created, null, headers),
    distribution: dist,
  });
});

export const updateBeneficiary = asyncHandler(async (req, res) => {
  const dist = await requireDistribution(req);
  const beneficiary = await Beneficiary.findOne({
    _id: req.params.beneficiaryId,
    tenantId: req.tenantId,
    distributionId: dist._id,
  });
  if (!beneficiary) return res.status(404).json({ message: 'Student not found on this list.' });

  const headers = dist.sheetHeaders?.length ? dist.sheetHeaders : defaultHeaders();
  const next = beneficiaryPayload({
    studentIndex: req.body?.studentIndex ?? beneficiary.studentIndex,
    fullName: req.body?.fullName ?? beneficiary.fullName,
    level: req.body?.level ?? beneficiary.level,
    phone: req.body?.phone ?? beneficiary.phone,
    sheetRow: req.body?.sheetRow ?? beneficiary.sheetRow,
  }, headers);
  if (!next.fullName) {
    return res.status(400).json({ message: 'Full name is required.' });
  }
  if (!next.studentIndex) {
    return res.status(400).json({ message: 'Student index is required.' });
  }
  const duplicate = await findDuplicateIndex(req.tenantId, dist._id, next.studentIndex, beneficiary._id);
  if (duplicate) {
    return res.status(409).json({
      message: `${next.studentIndex} is already used by ${duplicate.fullName}.`,
      beneficiary: presentBeneficiary(duplicate, null, headers),
    });
  }

  Object.assign(beneficiary, next);
  await beneficiary.save();

  const mark = await Collection.findOne({
    tenantId: req.tenantId,
    distributionId: dist._id,
    beneficiaryId: beneficiary._id,
  });
  if (mark) {
    mark.studentIndex = beneficiary.studentIndex;
    mark.beneficiaryName = beneficiary.fullName;
    await mark.save();
  }
  if (headers.join('|') !== (dist.sheetHeaders || []).join('|')) {
    dist.sheetHeaders = headers;
    await dist.save();
  }

  res.json({
    message: 'Student details updated. Existing marks were kept.',
    beneficiary: presentBeneficiary(beneficiary, mark, headers),
    distribution: dist,
  });
});

export const removeBeneficiary = asyncHandler(async (req, res) => {
  const dist = await requireDistribution(req);
  const beneficiary = await Beneficiary.findOne({
    _id: req.params.beneficiaryId,
    tenantId: req.tenantId,
    distributionId: dist._id,
  });
  if (!beneficiary) return res.status(404).json({ message: 'Student not found on this list.' });

  const mark = await Collection.findOne({
    tenantId: req.tenantId,
    distributionId: dist._id,
    beneficiaryId: beneficiary._id,
  });
  if (mark && !truthy(req.query.confirmCollected) && !truthy(req.body?.confirmCollected)) {
    return res.status(409).json({
      message: `${beneficiary.fullName} has already collected. Confirm to remove them and void that mark.`,
      code: 'CONFIRM_REMOVE_COLLECTED',
      collected: true,
    });
  }

  if (mark) {
    await Collection.deleteMany({ _id: mark._id });
  }
  await Beneficiary.deleteMany({ _id: beneficiary._id });
  await refreshDistributionCounts(dist);

  const io = req.app.get('io');
  if (mark) {
    io?.to(`tenant:${req.tenantId}`).emit('collection:void', {
      beneficiaryId: String(beneficiary._id),
      collectionId: String(mark._id),
      studentIndex: beneficiary.studentIndex,
      beneficiaryName: beneficiary.fullName,
      stats: {
        total: dist.beneficiaryCount,
        received: dist.receivedCount,
        pending: Math.max(0, dist.beneficiaryCount - dist.receivedCount),
        percent: dist.beneficiaryCount
          ? Math.round((dist.receivedCount / dist.beneficiaryCount) * 100)
          : 0,
      },
    });
  }

  res.json({
    message: mark
      ? `${beneficiary.fullName} was removed and their mark was voided.`
      : `${beneficiary.fullName} was removed from the list.`,
    distribution: dist,
  });
});

export const listBeneficiaries = asyncHandler(async (req, res) => {
  const dist = await requireDistribution(req);

  const q = String(req.query.q || '').trim();
  const filter = { tenantId: req.tenantId, distributionId: dist._id };
  if (q) {
    if (looksLikeStudentIndex(q)) {
      filter.studentIndex = { $startsWith: q.trim() };
    } else {
      filter.searchText = searchRegex(q);
    }
  }

  const items = await Beneficiary.find(filter).sort({ fullName: 1 }).limit(500);
  const received = items.length
    ? await Collection.find({
      tenantId: req.tenantId,
      distributionId: dist._id,
      beneficiaryId: { $in: items.map((b) => b._id) },
    }).select('beneficiaryId collectedAt assistantName assistantId')
    : [];

  const receivedMap = new Map(received.map((c) => [String(c.beneficiaryId), c]));
  const headers = dist.sheetHeaders?.length ? dist.sheetHeaders : defaultHeaders();
  const beneficiaries = items.map((b) => presentBeneficiary(b, receivedMap.get(String(b._id)), headers));

  res.json({
    beneficiaries,
    headers,
    distribution: dist,
  });
});

export const getActiveDistribution = asyncHandler(async (req, res) => {
  const dist = await loadActiveDistribution(req.tenantId);
  res.json({ distribution: dist });
});
