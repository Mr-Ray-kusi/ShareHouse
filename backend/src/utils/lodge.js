import { Tenant } from '../models/index.js';
import { generateInviteCode } from './codes.js';

export function normalizeRoomNumber(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function todayStamp(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

export function inferShift(date = new Date()) {
  return date.getUTCHours() < 14 ? 'morning' : 'evening';
}

export function asIdList(value) {
  return (Array.isArray(value) ? value : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
}

export async function resolvePorterShift(roster, porterId, date = new Date()) {
  const inferred = inferShift(date);
  if (!roster) return inferred;
  const id = String(porterId || '');
  const morning = asIdList(roster.morningPorterIds);
  const evening = asIdList(roster.eveningPorterIds);
  const onMorning = morning.includes(id);
  const onEvening = evening.includes(id);
  if (onMorning && !onEvening) return 'morning';
  if (onEvening && !onMorning) return 'evening';
  return inferred;
}

export async function ensureLodgeJoinCode(tenant) {
  if (tenant.lodgeJoinCode) return tenant.lodgeJoinCode;
  let code = generateInviteCode(tenant.name || tenant.tenantId);
  let tries = 0;
  while (
    tries < 12 &&
    ((await Tenant.exists({ lodgeJoinCode: code })) || (await Tenant.exists({ joinCode: code })))
  ) {
    code = generateInviteCode(tenant.name || tenant.tenantId);
    tries += 1;
  }
  tenant.lodgeJoinCode = code;
  await tenant.save();
  return code;
}

export function occupantSearchText({ studentIndex, fullName, phone, roomNumber, cohort }) {
  return [studentIndex, fullName, phone, roomNumber, cohort]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
