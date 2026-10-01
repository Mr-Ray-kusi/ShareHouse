import { Beneficiary, Collection, Distribution } from '../models/index.js';
import { getSb } from '../db/supabase.js';
import { dbError } from '../db/model.js';
import { foldSearch } from '../utils/search.js';
import {
  forgetActiveDistribution,
  rememberActiveDistribution,
} from './activeDistribution.js';

const SAMPLE = 8;
const UPSERT_CHUNK = 400;

export function normalizeStudentIndex(value) {
  return String(value || '').trim().toUpperCase();
}

export function buildSearchText({ studentIndex, fullName, level, phone, sheetRow }) {
  return foldSearch(
    [studentIndex, fullName, level, phone, ...Object.values(sheetRow || {})]
      .filter(Boolean)
      .join(' ')
  );
}

export function defaultHeaders() {
  return ['Student Index', 'Full Name', 'Level', 'Phone'];
}

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_HINTS = {
  index: [
    'student index', 'index number', 'index no', 'indexno', 'index',
    'matric', 'matric no', 'matriculation', 'student id', 'studentid',
    'student no', 'student number', 'reg no', 'reg number', 'registration',
    'admission', 'candidate', 'ref no', 'reference', 'id number', 'id no',
  ],
  firstName: ['first name', 'firstname', 'given name', 'forename'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  otherName: ['other name', 'other names', 'middle name', 'middle names'],
  name: ['full name', 'fullname', 'student name', 'beneficiary', 'name of student', 'names'],
  level: ['level', 'year', 'class', 'lvl', 'programme year', 'academic year'],
  phone: [
    'phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number',
    'tel', 'telephone', 'whatsapp', 'cell', 'msisdn',
  ],
};

function headerScore(header, hints) {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const hint of hints) {
    if (h === hint) best = Math.max(best, 100);
    else if (h.includes(hint) || hint.includes(h)) best = Math.max(best, 75);
  }
  return best;
}

export function classifySheetHeaders(headers = []) {
  const cols = (headers || []).filter(Boolean);
  const used = new Set();
  function pick(hints, min = 40) {
    let best = { header: '', score: 0 };
    for (const header of cols) {
      if (used.has(header)) continue;
      const score = headerScore(header, hints);
      if (score > best.score) best = { header, score };
    }
    if (best.score >= min) {
      used.add(best.header);
      return best.header;
    }
    return '';
  }

  const roles = {
    index: pick(HEADER_HINTS.index),
    lastName: pick(HEADER_HINTS.lastName),
    firstName: pick(HEADER_HINTS.firstName),
    otherName: pick(HEADER_HINTS.otherName),
    name: pick(HEADER_HINTS.name),
    phone: pick(HEADER_HINTS.phone),
    level: pick(HEADER_HINTS.level),
  };
  if (!roles.index && cols[0]) {
    roles.index = cols[0];
    used.add(cols[0]);
  }
  return roles;
}

export function composeFullName(sheetRow = {}, roles = {}) {
  const named = String(roles.name ? sheetRow[roles.name] : '').trim();
  if (named) return named;
  return [roles.lastName, roles.firstName, roles.otherName]
    .filter(Boolean)
    .map((key) => String(sheetRow[key] || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameHeaderList(a = [], b = []) {
  return (a || []).join('|') === (b || []).join('|');
}

export function headersFromSheetRows(rows = []) {
  const seen = [];
  for (const item of rows || []) {
    const sheet = item?.sheetRow && typeof item.sheetRow === 'object' ? item.sheetRow : {};
    for (const key of Object.keys(sheet)) {
      if (key && !seen.includes(key)) seen.push(key);
    }
  }
  return seen;
}

function stripDuplicateDefaultHeaders(headers = [], rows = []) {
  const defaults = defaultHeaders();
  const custom = (headers || []).filter((header) => !defaults.includes(header));
  if (!custom.length) return headers;
  const customRoles = classifySheetHeaders(custom);
  const defaultRoles = classifySheetHeaders(defaults);
  const fromRows = headersFromSheetRows(rows);
  return headers.filter((header) => {
    if (!defaults.includes(header)) return true;
    for (const role of ['index', 'name', 'level', 'phone']) {
      if (defaultRoles[role] !== header) continue;
      if (customRoles[role]) return false;
      if (role === 'name' && (customRoles.lastName || customRoles.firstName)) return false;
      if (fromRows.length && !fromRows.includes(header)) return false;
    }
    return true;
  });
}

export function resolveListHeaders(stored = [], rows = []) {
  const saved = (stored || []).filter(Boolean);
  const fromRows = headersFromSheetRows(rows);
  const defaults = defaultHeaders();
  const savedIsDefault = sameHeaderList(saved, defaults);
  const rowsAreCustom = fromRows.some((header) => !defaults.includes(header));
  let headers;
  if (saved.length && !(savedIsDefault && rowsAreCustom)) headers = saved;
  else if (fromRows.length) headers = fromRows;
  else headers = saved.length ? saved : defaults;
  const cleaned = stripDuplicateDefaultHeaders(headers, rows);
  return cleaned.length ? cleaned : defaults;
}

export function mergeHeaders(existing = [], incoming = []) {
  const existingList = (existing || []).filter(Boolean);
  const incomingList = (incoming || []).filter(Boolean);
  const defaults = defaultHeaders();
  const existingIsDefault = sameHeaderList(existingList, defaults);
  const incomingIsCustom = incomingList.some((header) => !defaults.includes(header));
  if (existingIsDefault && incomingIsCustom) {
    return incomingList.length ? incomingList : defaults;
  }
  const out = [];
  for (const header of [...existingList, ...incomingList]) {
    if (header && !out.includes(header)) out.push(header);
  }
  const merged = out.length ? out : defaults;
  const incomingAsRows = incomingList.map((header) => ({ sheetRow: { [header]: '1' } }));
  const cleaned = stripDuplicateDefaultHeaders(merged, incomingAsRows);
  return cleaned.length ? cleaned : defaults;
}

function remapSheetValues(incoming = {}, headers = []) {
  const cols = headers.length ? headers : defaultHeaders();
  const destRoles = classifySheetHeaders(cols);
  const srcRoles = classifySheetHeaders(Object.keys(incoming || {}));
  const mapped = { ...(incoming || {}) };
  for (const role of ['index', 'name', 'lastName', 'firstName', 'otherName', 'level', 'phone']) {
    const dest = destRoles[role];
    const src = srcRoles[role];
    if (dest && src && src !== dest && String(mapped[src] || '').trim() && !String(mapped[dest] || '').trim()) {
      mapped[dest] = mapped[src];
    }
  }
  return { mapped, roles: destRoles };
}

export function buildSheetRow({ studentIndex, fullName, level, phone, sheetRow }, headers = []) {
  const cols = headers.length ? headers : defaultHeaders();
  const { mapped, roles } = remapSheetValues({ ...(sheetRow || {}) }, cols);
  if (roles.index && studentIndex) mapped[roles.index] = studentIndex;
  if (roles.level && level) mapped[roles.level] = level;
  if (roles.phone && phone) mapped[roles.phone] = phone;
  if (roles.name && fullName) mapped[roles.name] = fullName;
  else if (fullName) {
    const hasParts = [roles.lastName, roles.firstName, roles.otherName]
      .some((key) => key && String(mapped[key] || '').trim());
    if (!hasParts) {
      if (roles.lastName) mapped[roles.lastName] = fullName;
      else if (roles.firstName) mapped[roles.firstName] = fullName;
    }
  }
  const row = {};
  for (const header of cols) row[header] = mapped[header] ?? '';
  return row;
}

export function beneficiaryPayload(fields, headers) {
  const cols = headers?.length ? headers : defaultHeaders();
  const roles = classifySheetHeaders(cols);
  const incomingSheet = fields.sheetRow || {};
  const incomingRoles = classifySheetHeaders(Object.keys(incomingSheet));
  const studentIndex = normalizeStudentIndex(
    fields.studentIndex
    || (roles.index ? incomingSheet[roles.index] : '')
    || (incomingRoles.index ? incomingSheet[incomingRoles.index] : '')
  );
  const fullName = String(
    fields.fullName
    || composeFullName(incomingSheet, roles)
    || composeFullName(incomingSheet, incomingRoles)
    || ''
  ).trim();
  const level = String(
    fields.level
    || (roles.level ? incomingSheet[roles.level] : '')
    || (incomingRoles.level ? incomingSheet[incomingRoles.level] : '')
    || ''
  ).trim();
  const phone = String(
    fields.phone
    || (roles.phone ? incomingSheet[roles.phone] : '')
    || (incomingRoles.phone ? incomingSheet[incomingRoles.phone] : '')
    || ''
  ).trim();
  const sheetRow = buildSheetRow({
    studentIndex,
    fullName,
    level,
    phone,
    sheetRow: incomingSheet,
  }, cols);
  return {
    studentIndex,
    fullName,
    level,
    phone,
    sheetRow,
    searchText: buildSearchText({ studentIndex, fullName, level, phone, sheetRow }),
  };
}

function sampleOf(rows, mapFn) {
  return rows.slice(0, SAMPLE).map(mapFn);
}

function coreChanged(existing, incoming) {
  return (
    String(existing.fullName || '') !== String(incoming.fullName || '')
    || String(existing.level || '') !== String(incoming.level || '')
    || String(existing.phone || '') !== String(incoming.phone || '')
    || JSON.stringify(existing.sheetRow || {}) !== JSON.stringify(incoming.sheetRow || {})
  );
}

export async function loadDistributionList(tenantId, distributionId) {
  const [beneficiaries, collections] = await Promise.all([
    Beneficiary.find({ tenantId, distributionId }),
    Collection.find({ tenantId, distributionId }).select('beneficiaryId studentIndex assistantName collectedAt'),
  ]);
  const collectedByBeneficiary = new Map(
    collections.map((c) => [String(c.beneficiaryId), c])
  );
  return { beneficiaries, collections, collectedByBeneficiary };
}

export function diffIncomingList(existingBeneficiaries, collectedByBeneficiary, incoming) {
  const existingByIndex = new Map(
    existingBeneficiaries.map((b) => [normalizeStudentIndex(b.studentIndex), b])
  );
  const incomingByIndex = new Map();
  for (const row of incoming) {
    incomingByIndex.set(normalizeStudentIndex(row.studentIndex), row);
  }

  const added = [];
  const updated = [];
  const unchanged = [];

  for (const [index, row] of incomingByIndex) {
    const current = existingByIndex.get(index);
    if (!current) {
      added.push(row);
      continue;
    }
    if (coreChanged(current, row)) updated.push({ current, incoming: row });
    else unchanged.push(current);
  }

  const missingFromFile = [];
  const missingCollected = [];
  for (const [index, current] of existingByIndex) {
    if (incomingByIndex.has(index)) continue;
    missingFromFile.push(current);
    if (collectedByBeneficiary.has(String(current._id))) missingCollected.push(current);
  }

  const summarize = (b) => ({
    studentIndex: b.studentIndex,
    fullName: b.fullName || b.incoming?.fullName || '',
  });

  return {
    added,
    updated,
    unchanged,
    missingFromFile,
    missingCollected,
    incomingCount: incomingByIndex.size,
    existingCount: existingBeneficiaries.length,
    summary: {
      added: { count: added.length, sample: sampleOf(added, (b) => ({ studentIndex: b.studentIndex, fullName: b.fullName })) },
      updated: {
        count: updated.length,
        sample: sampleOf(updated, ({ current, incoming: next }) => ({
          studentIndex: current.studentIndex,
          from: current.fullName,
          to: next.fullName,
        })),
      },
      unchanged: { count: unchanged.length },
      missingFromFile: {
        count: missingFromFile.length,
        collectedCount: missingCollected.length,
        sample: sampleOf(missingFromFile, summarize),
      },
    },
  };
}

export async function previewListUpload(dist, incoming) {
  const { beneficiaries, collectedByBeneficiary } = await loadDistributionList(dist.tenantId, dist._id);
  return diffIncomingList(beneficiaries, collectedByBeneficiary, incoming);
}

async function upsertBeneficiaries(rows) {
  if (!rows.length) return;
  const sb = getSb();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb
      .from('beneficiaries')
      .upsert(chunk, { onConflict: 'tenantId,distributionId,studentIndex' });
    if (error) {
      for (const row of chunk) {
        const one = await sb
          .from('beneficiaries')
          .upsert(row, { onConflict: 'tenantId,distributionId,studentIndex' });
        if (one.error) throw dbError(one.error);
      }
    }
  }
}

export async function refreshDistributionCounts(dist) {
  const tenantId = dist.tenantId;
  const distributionId = dist._id || dist.id;
  const [beneficiaryCount, receivedCount] = await Promise.all([
    Beneficiary.countDocuments({ tenantId, distributionId }),
    Collection.countDocuments({ tenantId, distributionId }),
  ]);
  dist.beneficiaryCount = beneficiaryCount;
  dist.receivedCount = receivedCount;
  await dist.save();
  forgetActiveDistribution(tenantId);
  if (dist.status === 'active') rememberActiveDistribution(tenantId, dist);
  return dist;
}

export async function applyListUpload(dist, incoming, options = {}) {
  const {
    headers = defaultHeaders(),
    removeMissing = false,
    resetMarks = false,
  } = options;

  const { beneficiaries, collectedByBeneficiary } = await loadDistributionList(dist.tenantId, dist._id);
  const diff = diffIncomingList(beneficiaries, collectedByBeneficiary, incoming);

  if (resetMarks) {
    await Collection.deleteMany({ tenantId: dist.tenantId, distributionId: dist._id });
  } else if (removeMissing && diff.missingFromFile.length) {
    const ids = diff.missingFromFile.map((b) => b._id);
    await Collection.deleteMany({
      tenantId: dist.tenantId,
      distributionId: dist._id,
      beneficiaryId: { $in: ids },
    });
  }

  if (removeMissing && diff.missingFromFile.length) {
    await Beneficiary.deleteMany({
      tenantId: dist.tenantId,
      distributionId: dist._id,
      _id: { $in: diff.missingFromFile.map((b) => b._id) },
    });
  }

  const now = new Date().toISOString();
  const mergedHeaders = mergeHeaders(resetMarks || !dist.sheetHeaders?.length ? [] : dist.sheetHeaders, headers);
  const upserts = incoming.map((row) => {
    const payload = beneficiaryPayload({ ...row, sheetRow: row.sheetRow }, mergedHeaders);
    return {
      tenantId: dist.tenantId,
      distributionId: dist._id,
      ...payload,
      updatedAt: now,
    };
  });

  await upsertBeneficiaries(upserts);

  dist.sheetHeaders = mergedHeaders;
  await refreshDistributionCounts(dist);

  return { dist, diff };
}

export async function findDuplicateIndex(tenantId, distributionId, studentIndex, exceptId) {
  const index = normalizeStudentIndex(studentIndex);
  if (!index) return null;
  const existing = await Beneficiary.findOne({ tenantId, distributionId, studentIndex: index });
  if (!existing) return null;
  if (exceptId && String(existing._id) === String(exceptId)) return null;
  return existing;
}

export function statsFromDist(dist) {
  const total = Number(dist?.beneficiaryCount) || 0;
  const received = Number(dist?.receivedCount) || 0;
  return {
    total,
    received,
    pending: Math.max(0, total - received),
    percent: total ? Math.round((received / total) * 100) : 0,
  };
}

export async function liveStatsForDistribution(tenantId, dist) {
  const distributionId = dist?._id || dist?.id;
  if (!tenantId || !distributionId) {
    return { total: 0, received: 0, pending: 0, percent: 0 };
  }
  const [total, received] = await Promise.all([
    Beneficiary.countDocuments({ tenantId, distributionId }),
    Collection.countDocuments({ tenantId, distributionId }),
  ]);
  return statsFromDist({ beneficiaryCount: total, receivedCount: received });
}

export function presentBeneficiary(b, mark, headers) {
  const cols = headers?.length ? headers : defaultHeaders();
  const sheetRow = buildSheetRow({
    studentIndex: b.studentIndex,
    fullName: b.fullName,
    level: b.level,
    phone: b.phone,
    sheetRow: b.sheetRow || {},
  }, cols);
  return {
    id: String(b._id || b.id),
    studentIndex: b.studentIndex,
    fullName: b.fullName,
    level: b.level,
    phone: b.phone,
    sheetRow,
    searchText: b.searchText || '',
    collected: Boolean(mark),
    collectedAt: mark?.collectedAt || null,
    markedBy: mark?.assistantName || null,
    assistantId: mark?.assistantId ? String(mark.assistantId) : null,
  };
}

export async function ensureActiveDistribution(dist) {
  if (!dist || dist.status !== 'active') {
    const err = new Error('This distribution is not active.');
    err.status = 400;
    throw err;
  }
  return dist;
}
