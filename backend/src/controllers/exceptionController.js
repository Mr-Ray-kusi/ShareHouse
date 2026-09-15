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
  mergeHeaders,
  presentBeneficiary,
  refreshDistributionCounts,
} from '../services/listService.js';
import { createCollectionMark } from '../services/collectionService.js';

function walkInIndex() {
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `WALK-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function presentException(row) {
  return {
    id: String(row._id || row.id),
    status: row.status,
    studentIndex: row.studentIndex,
    fullName: row.fullName,
    level: row.level,
    phone: row.phone,
    reason: row.reason,
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
    return res.status(400).json({ message: 'No active distribution. Ask the hall president to start one.' });
  }

  const fullName = String(req.body?.fullName || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (fullName.length < 2) {
    return res.status(400).json({ message: 'Student name is required.' });
  }
  if (reason.length < 3) {
    return res.status(400).json({ message: 'Say why they are not on the list.' });
  }

  let studentIndex = String(req.body?.studentIndex || '').trim().toUpperCase();
  if (!studentIndex) studentIndex = walkInIndex();

  const existingPending = await ListException.findOne({
    tenantId: req.tenantId,
    distributionId: dist._id,
    studentIndex,
    status: 'pending',
  });
  if (existingPending) {
    return res.status(409).json({
      message: 'A walk-in request for this ID is already waiting for approval.',
      exception: presentException(existingPending),
    });
  }

  const alreadyOnList = await findDuplicateIndex(req.tenantId, dist._id, studentIndex);
  if (alreadyOnList && !String(studentIndex).startsWith('WALK-')) {
    return res.status(409).json({
      message: `${studentIndex} is already on the list as ${alreadyOnList.fullName}. Search that ID instead.`,
      beneficiary: presentBeneficiary(alreadyOnList, null, dist.sheetHeaders),
    });
  }

  let photoFileName = '';
  let photoMimeType = '';
  if (req.file?.buffer) {
    photoFileName = await saveUploadBuffer(req.file.buffer, req.file.originalname || 'walk-in.jpg');
    photoMimeType = req.file.mimetype || '';
  }

  const created = await ListException.create({
    tenantId: req.tenantId,
    distributionId: dist._id,
    status: 'pending',
    studentIndex,
    fullName,
    level: String(req.body?.level || '').trim(),
    phone: String(req.body?.phone || '').trim(),
    reason,
    photoFileName,
    photoMimeType,
    requestedBy: req.user._id,
    requestedByName: req.user.name,
  });

  const payload = presentException(created);
  const io = req.app.get('io');
  io?.to(`tenant:${req.tenantId}`).emit('exception:new', { exception: payload });
  track({ pillar: 'funnel', name: 'exception_create', tenantId: req.tenantId || '', role: req.user?.role || '' });

  res.status(201).json({
    message: 'Walk-in request sent. Wait for the hall admin to approve before giving the item.',
    exception: payload,
  });
});

export const reviewException = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tenant_admin') {
    return res.status(403).json({ message: 'Only the hall president can approve or reject walk-ins.' });
  }
  if (req.tenant?.subscriptionPlan === 'src') {
    return res.status(403).json({
      message: 'SRC can monitor halls but cannot approve a student. The hall president must review walk-ins.',
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

  const dist = await Distribution.findOne({ _id: row.distributionId, tenantId: req.tenantId });
  if (!dist || dist.status !== 'active') {
    return res.status(400).json({ message: 'This distribution is not active.' });
  }

  const headers = mergeHeaders(dist.sheetHeaders, defaultHeaders());
  let beneficiary = await findDuplicateIndex(req.tenantId, dist._id, row.studentIndex);
  const linkedExisting = Boolean(beneficiary);
  if (!beneficiary) {
    const payload = beneficiaryPayload({
      studentIndex: row.studentIndex,
      fullName: row.fullName,
      level: row.level,
      phone: row.phone,
    }, headers);
    beneficiary = await Beneficiary.create({
      tenantId: req.tenantId,
      distributionId: dist._id,
      ...payload,
    });
    dist.sheetHeaders = headers;
    await refreshDistributionCounts(dist);
  }

  const markReceived = Boolean(req.body?.markReceived);
  let markPayload = null;
  if (markReceived) {
    try {
      const marked = await createCollectionMark({
        tenantId: req.tenantId,
        user: req.user,
        beneficiary,
        dist,
      });
      markPayload = marked.payload;
      req.app.get('io')?.to(`tenant:${req.tenantId}`).emit('collection:new', marked.payload);
    } catch (err) {
      if (err.status !== 409) throw err;
    }
  }

  row.status = 'approved';
  row.reviewedBy = req.user._id;
  row.reviewedByName = req.user.name;
  row.reviewNote = reviewNote || (linkedExisting ? 'Already on the list; linked.' : 'Approved');
  row.beneficiaryId = beneficiary._id;
  row.markedOnApprove = markReceived;
  await row.save();

  const payload = presentException(row);
  req.app.get('io')?.to(`tenant:${req.tenantId}`).emit('exception:updated', { exception: payload });
  track({ pillar: 'funnel', name: 'exception_approve', tenantId: req.tenantId || '' });

  res.json({
    message: linkedExisting
      ? `${row.fullName} was already on the list. Walk-in linked to that row.`
      : `${row.fullName} was added to the list.`,
    exception: payload,
    beneficiary: presentBeneficiary(beneficiary, markPayload?.collection, headers),
    collection: markPayload?.collection || null,
    distribution: dist,
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
