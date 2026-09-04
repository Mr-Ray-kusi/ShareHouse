export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function uniqueTenantId(Tenant, name, schoolName) {
  const base = slugify(`${name}-${schoolName}`) || `hall-${Date.now()}`;
  let candidate = base;
  let i = 2;
  while (await Tenant.exists({ tenantId: candidate })) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return candidate;
}
