import { Distribution } from '../models/index.js';
import { cacheDelete, cacheGet, cacheSet } from '../utils/cache.js';
import { dbError } from '../db/model.js';
import { getSb } from '../db/supabase.js';

const TTL_MS = 60_000;

function cacheKey(tenantId) {
  return `dist:active:${tenantId}`;
}

export async function getActiveDistribution(tenantId) {
  if (!tenantId) return null;
  const hit = cacheGet(cacheKey(tenantId));
  if (hit !== undefined) return hit;
  const dist = await Distribution.findOne({ tenantId, status: 'active' });
  cacheSet(cacheKey(tenantId), dist, TTL_MS);
  return dist;
}

export function rememberActiveDistribution(tenantId, dist) {
  if (!tenantId) return;
  cacheSet(cacheKey(tenantId), dist || null, TTL_MS);
}

export function forgetActiveDistribution(tenantId) {
  if (!tenantId) return;
  cacheDelete(cacheKey(tenantId));
}

export async function bumpReceivedCount(dist) {
  const id = dist?._id || dist?.id;
  if (!id) return dist;
  const next = (Number(dist.receivedCount) || 0) + 1;
  const { data, error } = await getSb()
    .from('distributions')
    .update({
      receivedCount: next,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id)
    .select('beneficiaryCount, receivedCount')
    .single();
  if (error) throw dbError(error);
  const updated = {
    ...dist,
    beneficiaryCount: data.beneficiaryCount,
    receivedCount: data.receivedCount,
  };
  if (dist.tenantId) rememberActiveDistribution(dist.tenantId, updated);
  return updated;
}
