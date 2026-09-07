import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Invite } from '../models/index.js';
import { generateFieldQrToken, generateUnitCode, isFieldQrCode, normalizeUnitCode } from '../utils/codes.js';
import { cacheDeletePrefix, cacheWrap } from '../utils/cache.js';

const UNUSED_QR_HASH = bcrypt.hashSync('field-qr-unused', 4);

function fieldQrs(rows) {
  return (rows || []).filter((row) => isFieldQrCode(row.code));
}

function oldestFirst(rows) {
  return [...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function unitCodesMatch(entered, stored) {
  const a = normalizeUnitCode(entered);
  const b = normalizeUnitCode(stored);
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

async function loadActiveInvites(tenantId) {
  return Invite.find({ tenantId, isActive: true });
}

export async function readUnitCode(tenantId) {
  return cacheWrap(`unit:${tenantId}`, 20000, async () => {
    const qrs = fieldQrs(await loadActiveInvites(tenantId));
    return qrs.map((row) => String(row.passwordPlain || '').trim()).find(Boolean) || '';
  });
}

export async function ensureCollectionUnit({ tenantId, distributionId, createdBy, preferredCode }) {
  const items = await loadActiveInvites(tenantId);
  const qrs = fieldQrs(items);
  const forDist = oldestFirst(qrs.filter((row) => String(row.distributionId || '') === String(distributionId || '')));
  let unitCode = normalizeUnitCode(preferredCode)
    || qrs.map((row) => String(row.passwordPlain || '').trim()).find(Boolean)
    || generateUnitCode();
  let primary = forDist[0] || null;

  if (!primary) {
    primary = await Invite.create({
      tenantId,
      code: generateFieldQrToken(),
      label: 'Collection QR',
      passwordHash: UNUSED_QR_HASH,
      passwordPlain: unitCode,
      distributionId: distributionId || null,
      createdBy,
      isActive: true,
    });
    qrs.push(primary);
  }

  await Promise.all(qrs.map(async (row) => {
    const nextLabel = !row.label || /^Station /i.test(row.label) ? 'Collection QR' : row.label;
    if (row.passwordPlain === unitCode && row.label === nextLabel) return;
    row.passwordPlain = unitCode;
    row.label = nextLabel;
    await row.save();
  }));

  cacheDeletePrefix(`unit:${tenantId}`);
  cacheDeletePrefix(`fieldqr:`);
  return {
    qr: primary,
    unitCode,
    qrs: oldestFirst(qrs.filter((row) => String(row.distributionId || '') === String(distributionId || ''))),
  };
}

export async function rotateCollectionUnit(tenantId) {
  const qrs = fieldQrs(await loadActiveInvites(tenantId));
  const unitCode = generateUnitCode();
  await Promise.all(qrs.map(async (row) => {
    row.passwordPlain = unitCode;
    await row.save();
  }));
  cacheDeletePrefix(`unit:${tenantId}`);
  cacheDeletePrefix('fieldqr:');
  return { unitCode, updated: qrs.length };
}
