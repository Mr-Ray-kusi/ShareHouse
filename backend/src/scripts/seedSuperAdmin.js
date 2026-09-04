import { Tenant, User } from '../models/index.js';
import { env } from '../config/env.js';
import { addYears } from '../utils/codes.js';

export async function ensureSuperAdmin() {
  const email = env.superAdminEmail.toLowerCase();
  const existing = await User.findOne({ role: 'super_admin', email });
  if (existing) return existing;

  const passwordHash = await User.hashPassword(env.superAdminPassword);
  const user = await User.create({
    tenantId: null,
    name: env.superAdminName,
    email,
    passwordHash,
    role: 'super_admin',
    isActive: true,
  });
  console.log(`Super admin ready: ${email}`);
  return user;
}

export async function ensureDemoHall() {
  const tenantId = 'atlantic-hall-knust';
  const email = 'president@atlantic.hall';
  let tenant = await Tenant.findOne({ tenantId });
  if (!tenant) {
    tenant = await Tenant.create({
      tenantId,
      name: 'Atlantic Hall',
      schoolName: 'KNUST',
      adminName: 'Hall President',
      adminEmail: email,
      adminPhone: '0240000000',
      subscriptionPlan: 'hall',
      subscriptionFee: 500,
      isActive: true,
      expiryDate: addYears(new Date(), 1),
      joinCode: 'ATL-HALL',
    });
  } else if (!tenant.joinCode) {
    tenant.joinCode = 'ATL-HALL';
    await tenant.save();
  }

  const existing = await User.findOne({ email });
  if (!existing) {
    const passwordHash = await User.hashPassword(env.superAdminPassword);
    await User.create({
      tenantId,
      name: 'Hall President',
      email,
      phone: tenant.adminPhone,
      passwordHash,
      role: 'tenant_admin',
      isActive: true,
    });
    console.log(`Demo hall admin ready: ${email}`);
  }
  return tenant;
}

if (process.argv[1] && process.argv[1].includes('seedSuperAdmin')) {
  const { connectDb } = await import('../config/db.js');
  await connectDb();
  await ensureSuperAdmin();
  await ensureDemoHall();
  process.exit(0);
}
