import { Tenant } from '../models/Tenant.js';
import { foldSearch } from './search.js';

export function isSrcTenant(tenant) {
  return tenant?.subscriptionPlan === 'src';
}

export async function listHallsForSrc(srcTenant) {
  const school = foldSearch(srcTenant?.schoolName);
  const all = await Tenant.find().sort({ name: 1 });
  return all.filter((hall) => {
    if (!hall || hall.tenantId === srcTenant.tenantId) return false;
    if (hall.subscriptionPlan === 'src') return false;
    if (hall.srcTenantId) return hall.srcTenantId === srcTenant.tenantId;
    return Boolean(school && foldSearch(hall.schoolName) === school);
  });
}

export async function assertHallUnderSrc(srcTenant, hallTenantId) {
  const halls = await listHallsForSrc(srcTenant);
  const hall = halls.find((row) => row.tenantId === String(hallTenantId || '').trim());
  if (!hall) {
    const err = new Error('That hall is not under this SRC.');
    err.status = 404;
    throw err;
  }
  return hall;
}

export async function resolveSrcTenant(srcCode) {
  const key = String(srcCode || '').trim().toLowerCase();
  if (!key) return null;
  const src = await Tenant.findOne({ tenantId: key });
  if (!src || src.subscriptionPlan !== 'src') {
    const err = new Error('That SRC ID was not found. Ask the campus SRC for the ID on their Halls page.');
    err.status = 400;
    throw err;
  }
  return src;
}
