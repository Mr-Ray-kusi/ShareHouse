import { User } from '../models/index.js';
import { env } from '../config/env.js';

const DEMO_EMAILS = ['samuel.w@example.com', 'president@atlantic.hall'];

export async function ensureSuperAdmin() {
  const email = env.superAdminEmail;
  const password = env.superAdminPassword;
  if (!email || !password) {
    throw new Error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in the environment. Do not commit these values to git.');
  }
  if (String(password).length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters.');
  }

  const passwordHash = await User.hashPassword(password);
  let user = await User.findOne({ role: 'super_admin', email });

  if (user) {
    user.passwordHash = passwordHash;
    user.name = env.superAdminName;
    user.isActive = true;
    user.refreshTokens = [];
    await user.save();
  } else {
    user = await User.create({
      tenantId: null,
      name: env.superAdminName,
      email,
      passwordHash,
      role: 'super_admin',
      isActive: true,
    });
  }

  const staleAdmins = await User.find({
    role: 'super_admin',
    email: { $ne: email },
  });
  for (const other of staleAdmins) {
    other.isActive = false;
    other.refreshTokens = [];
    await other.save();
  }

  for (const demoEmail of DEMO_EMAILS) {
    if (demoEmail === email) continue;
    const demo = await User.findOne({ email: demoEmail });
    if (demo) {
      demo.isActive = false;
      demo.refreshTokens = [];
      await demo.save();
    }
  }

  console.log(`Super admin ready: ${email}`);
  return user;
}

if (process.argv[1] && process.argv[1].includes('seedSuperAdmin')) {
  const { connectDb } = await import('../config/db.js');
  await connectDb();
  await ensureSuperAdmin();
  process.exit(0);
}
