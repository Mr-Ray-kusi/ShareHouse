import { Distribution, Beneficiary, Collection, SheetUpload } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseBeneficiaryWorkbook } from '../services/excelService.js';
import { searchRegex } from '../utils/search.js';
import { saveUploadBuffer } from '../utils/uploads.js';
import { track } from '../services/telemetry.js';

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
  res.json({ distribution: dist });
});

export const uploadBeneficiaries = asyncHandler(async (req, res) => {
  const dist = await Distribution.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!dist) return res.status(404).json({ message: 'Distribution not found.' });
  if (!req.file?.buffer) {
    return res.status(400).json({ message: 'Upload an Excel file (.xlsx or .xls).' });
  }

  const { beneficiaries, skipped, totalRows, columns, headers } = parseBeneficiaryWorkbook(req.file.buffer);

  await Beneficiary.deleteMany({ tenantId: req.tenantId, distributionId: dist._id });
  await Collection.deleteMany({ tenantId: req.tenantId, distributionId: dist._id });

  const docs = beneficiaries.map((row) => ({
    tenantId: req.tenantId,
    distributionId: dist._id,
    ...row,
  }));

  if (docs.length) {
    await Beneficiary.insertMany(docs, { ordered: false });
  }

  dist.beneficiaryCount = docs.length;
  dist.receivedCount = 0;
  dist.sheetHeaders = headers;
  dist.originalFileName = req.file.originalname;
  dist.storedFileName = await saveUploadBuffer(req.file.buffer, req.file.originalname);
  if (dist.status === 'draft') {
    await Distribution.updateMany(
      { tenantId: req.tenantId, status: 'active', _id: { $ne: dist._id } },
      { $set: { status: 'completed' } }
    );
    dist.status = 'active';
  }
  await dist.save();

  await SheetUpload.create({
    tenantId: req.tenantId,
    tenantName: req.tenant?.name || '',
    schoolName: req.tenant?.schoolName || '',
    distributionId: dist._id,
    distributionTitle: dist.title,
    originalFileName: req.file.originalname,
    storedFileName: dist.storedFileName,
    mimeType: req.file.mimetype || '',
    size: req.file.size || req.file.buffer?.length || 0,
    uploadedBy: req.user._id,
  });
  track({ pillar: 'funnel', name: 'excel_upload', tenantId: req.tenantId || '', value: docs.length });

  res.json({
    message: `Imported ${docs.length} beneficiaries.`,
    inserted: docs.length,
    skipped,
    totalRows,
    columns,
    headers,
    distribution: dist,
  });
});

export const listBeneficiaries = asyncHandler(async (req, res) => {
  const dist = await Distribution.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!dist) return res.status(404).json({ message: 'Distribution not found.' });

  const q = String(req.query.q || '').trim();
  const filter = { tenantId: req.tenantId, distributionId: dist._id };
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [
      { studentIndex: rx },
      { fullName: rx },
      { phone: rx },
      { level: rx },
      { searchText: rx },
    ];
  }

  const [items, received] = await Promise.all([
    Beneficiary.find(filter).sort({ fullName: 1 }).limit(500),
    Collection.find({
      tenantId: req.tenantId,
      distributionId: dist._id,
    }).select('beneficiaryId collectedAt assistantName'),
  ]);

  const receivedMap = new Map(received.map((c) => [String(c.beneficiaryId), c]));
  const beneficiaries = items.map((b) => {
    const mark = receivedMap.get(String(b._id));
    return {
      ...b.toObject(),
      id: String(b._id),
      sheetRow: b.sheetRow && Object.keys(b.sheetRow || {}).length
        ? b.sheetRow
        : {
          'Student Index': b.studentIndex,
          'Full Name': b.fullName,
          Level: b.level,
          Phone: b.phone,
        },
      collected: Boolean(mark),
      collectedAt: mark?.collectedAt || null,
      markedBy: mark?.assistantName || null,
    };
  });

  res.json({
    beneficiaries,
    headers: dist.sheetHeaders?.length
      ? dist.sheetHeaders
      : ['Student Index', 'Full Name', 'Level', 'Phone'],
    distribution: dist,
  });
});

export const getActiveDistribution = asyncHandler(async (req, res) => {
  const dist = await Distribution.findOne({ tenantId: req.tenantId, status: 'active' });
  res.json({ distribution: dist });
});
