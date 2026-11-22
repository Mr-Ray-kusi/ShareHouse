import crypto from 'crypto';
import { Beneficiary, ListException, Distribution } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { saveUploadBuffer, storedUploadPath, storedFileExists } from '../utils/uploads.js';
import { track } from '../services/telemetry.js';
import { getActiveDistribution } from '../services/activeDistribution.js';
import {
  beneficiaryPayload,
  defaultHeaders,
  findDuplicateIndex,
  presentBeneficiary,
  resolveListHeaders,
} from '../services/listService.js';

function walkInIndex() {
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `WALK-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function parseSheetRow(body) {
  const raw = body?.sheetRow;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function listHeaders(dist) {
  if (!dist) return defaultHeaders();
  const saved = (dist.sheetHeaders || []).filter(Boolean);
  const defaults = defaultHeaders();
  if (saved.length && saved.join('|') !== defaults.join('|')) {
    return resolveListHeaders(saved, []);
  }
  const sample = await Beneficiary.find({
    tenantId: dist.tenantId,
    distributionId: dist._id,
  }).select('sheetRow').limit(80);
  return resolveListHeaders(dist.sheetHeaders, sample);
}

function mappedWalkIn(body, headers) {
  return beneficiaryPayload({
    studentIndex: body?.studentIndex,
    fullName: body?.fullName,
    level: body?.level,
    phone: body?.phone,
    sheetRow: parseSheetRow(body),
  }, headers);
}

function presentException(row) {
  return {
    id: String(row._id || row.id),
    status: row.status,
    addonPaymentId: row.addonPaymentId ? String(row.addonPaymentId) : null,
    studentIndex: row.studentIndex,
    fullName: row.fullName,
    level: row.level,
    phone: row.phone,
    reason: row.reason,
    sheetRow: row.sheetRow && typeof row.sheetRow === 'object' ? row.sheetRow : {},
    hasPhoto: Boolean(row.photoFileName),
    requestedBy: row.requestedBy ? String(row.requestedBy) : null,
    requestedByName: row.requestedByName,
    reviewedByName: row.reviewedByName,
    reviewNote: row.reviewNote,
    beneficiaryId: row.beneficiaryId ? String(row.beneficiaryId) : null,
    markedOnApprove: Boolean(row.markedOnApprove),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    distributionId: row.distributionId ? String(row.distributionId) : null,
  };
}

async function workingDistribution(req) {
  if (req.query.distributionId || req.body?.distributionId || req.params.distributionId) {
    const id = req.query.distributionId || req.body?.distributionId || req.params.distributionId;
    return Distribution.findOne({ _id: id, tenantId: req.tenantId });
  }
  return getActiveDistribution(req.tenantId);
}

export const listExceptions = asyncHandler(async (req, res) => {
  const dist = await workingDistribution(req);
  const filter = { tenantId: req.tenantId };
  if (dist) filter.distributionId = dist._id;
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.mine === '1' || req.user.role === 'assistant') {
    filter.requestedBy = req.user._id;
  }
  const items = await ListException.find(filter).sort({ createdAt: -1 }).limit(80);
  res.json({
    exceptions: items.map(presentException),
    distribution: dist
      ? { id: String(dist._id), title: dist.title, status: dist.status }
      : null,
  });
});

export const createException = asyncHandler(async (req, res) => {
  const dist = await workingDistribution(req);
  if (!dist || dist.status !== 'active') {
    return res.status(400).json({ message: 'No active distribution. Ask the SRC administrator to start one.' });
  }

  const headers = await listHeaders(dist);
  const mapped = mappedWalkIn(req.body, headers);
  const reason = String(req.body?.reason || '').trim();
  if (mapped.fullName.length < 2) {
    return res.status(400).json({ message: 'Student name is required.' });
  }
  if (reason.length < 3) {
    return res.status(400).json({ message: 'Say why they are not on the list.' });
  }

  let studentIndex = mapped.studentIndex;
  if (!studentIndex) studentIndex = walkInIndex();

  const existingPending = await ListException.findOne({
    tenantId: req.tenantId,
    distributionId: dist._id,
    studentIndex,
    status: { $in: ['pending', 'payment_pending'] },
  });
  if (existingPending) {
    return res.status(409).json({
      message: existingPending.status === 'payment_pending'
        ? 'A walk-in request for this ID is already awaiting SRC payment.'
        : 'A walk-in request for this ID is already waiting for SRC review.',
      exception: presentException(existingPending),
    });
  }

  const alreadyOnList = await findDuplicateIndex(req.tenantId, dist._id, studentIndex);
  if (alreadyOnList && !String(studentIndex).startsWith('WALK-')) {
    return res.status(409).json({
      message: `${studentIndex} is already on the list as ${alreadyOnList.fullName}. Search that ID instead.`,
      beneficiary: presentBeneficiary(alreadyOnList, null, headers),
    });
  }

  let photoFileName = '';
  let photoMimeType = '';
  if (req.file?.buffer) {
    photoFileName = await saveUploadBuffer(req.file.buffer, req.file.originalname || 'walk-in.jpg');
    photoMimeType = req.file.mimetype || '';
  }

  const doc = {
    tenantId: req.tenantId,
    distributionId: dist._id,
    status: 'pending',
    studentIndex,
    fullName: mapped.fullName,
    level: mapped.level,
    phone: mapped.phone,
    reason,
    sheetRow: mapped.sheetRow,
    photoFileName,
    photoMimeType,
    requestedBy: req.user._id,
    requestedByName: req.user.name,
  };
  let created;
  try {
    created = await ListException.create(doc);
  } catch (_err) {
    delete doc.sheetRow;
    created = await ListException.create(doc);
  }

  const payload = presentException(created);
  const io = req.app.get('io');
  io?.to(`tenant:${req.tenantId}`).emit('exception:new', { exception: payload });
  track({ pillar: 'funnel', name: 'exception_create', tenantId: req.tenantId || '', role: req.user?.role || '' });

  res.status(201).json({
    message: 'Student request sent. The linked SRC administrator must pay the add-on fee before the student is added.',
    exception: payload,
  });
});

export const reviewException = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tenant_admin') {
    return res.status(403).json({ message: 'Only a campus administrator can approve or reject walk-ins.' });
  }
  const isLinkedSrcReviewer = Boolean(
    req.srcReview
    && req.srcTenantId
    && String(req.user.tenantId) === String(req.srcTenantId)
    && String(req.tenant?.srcTenantId) === String(req.srcTenantId)
  );
  const isLocalSrcReviewer = Boolean(
    !req.srcReview
    && req.tenant?.subscriptionPlan === 'src'
    && String(req.user.tenantId) === String(req.tenantId)
  );
  const isSrcReviewer = isLinkedSrcReviewer || isLocalSrcReviewer;
  if (req.srcReview && !isLinkedSrcReviewer) {
    return res.status(403).json({ message: 'This SRC is not authorized to review walk-ins for this hall.' });
  }
  if (!isSrcReviewer) {
    return res.status(403).json({
      message: 'Only the linked SRC administrator can approve or reject walk-in students.',
    });
  }

  const row = await ListException.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!row) return res.status(404).json({ message: 'Walk-in request not found.' });
  if (row.status !== 'pending') {
    return res.status(400).json({ message: `This walk-in was already ${row.status}.` });
  }

  const action = String(req.body?.action || '').toLowerCase();
  const reviewNote = String(req.body?.note || req.body?.reviewNote || '').trim();

  if (action === 'reject') {
    row.status = 'rejected';
    row.reviewedBy = req.user._id;
    row.reviewedByName = req.user.name;
    row.reviewNote = reviewNote || 'Rejected';
    await row.save();
    const payload = presentException(row);
    req.app.get('io')?.to(`tenant:${req.tenantId}`).emit('exception:updated', { exception: payload });
    return res.json({ message: 'Walk-in rejected.', exception: payload });
  }

  if (action !== 'approve') {
    return res.status(400).json({ message: 'action must be approve or reject.' });
  }

  return res.status(409).json({
    message: 'Walk-ins are added only after the SRC pays GHS 0.05 per selected student from the Student additions section.',
  });
});

export const cancelException = asyncHandler(async (req, res) => {
  const row = await ListException.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!row) return res.status(404).json({ message: 'Walk-in request not found.' });
  if (row.status !== 'pending') {
    return res.status(400).json({ message: 'Only a waiting walk-in can be cancelled.' });
  }
  const isOwner = String(row.requestedBy) === String(req.user._id);
  if (!isOwner && req.user.role !== 'tenant_admin') {
    return res.status(403).json({ message: 'You can only cancel your own walk-in request.' });
  }
  row.status = 'cancelled';
  row.reviewedBy = req.user._id;
  row.reviewedByName = req.user.name;
  row.reviewNote = String(req.body?.note || 'Cancelled').trim();
  await row.save();
  const payload = presentException(row);
  req.app.get('io')?.to(`tenant:${req.tenantId}`).emit('exception:updated', { exception: payload });
  res.json({ message: 'Walk-in cancelled.', exception: payload });
});

export const exceptionPhoto = asyncHandler(async (req, res) => {
  const row = await ListException.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
  });
  if (!row || !row.photoFileName) {
    return res.status(404).json({ message: 'No photo for this walk-in.' });
  }
  if (!(await storedFileExists(row.photoFileName))) {
    return res.status(404).json({ message: 'Photo file is no longer available.' });
  }
  res.setHeader('Content-Type', row.photoMimeType || 'image/jpeg');
  res.sendFile(storedUploadPath(row.photoFileName));
});
