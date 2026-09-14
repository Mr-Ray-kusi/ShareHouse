import bcrypt from 'bcryptjs';
import { Tenant, User, Invite, PorterInvite } from '../models/index.js';
import { env, getPlan } from '../config/env.js';
import { uniqueTenantId } from '../utils/slug.js';
import { generateInviteCode, addYears, isFieldQrCode } from '../utils/codes.js';
import {
  accessPayload,
  hashToken,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';
import { initializePayment } from '../services/paystackService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { track } from '../services/telemetry.js';
import { foldSearch, namesMatch } from '../utils/search.js';
import { findPresidentByCredentials } from '../utils/presidents.js';

function setRefreshCookie(res, token) {
  res.cookie('ws_refresh', token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie('ws_refresh', { ...refreshCookieOptions(), maxAge: 0 });
}

async function issueSession(res, user, extras = {}) {
  const payload = accessPayload(user, extras);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: String(user._id) });
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000);

  user.refreshTokens = (user.refreshTokens || [])
    .filter((t) => t.expiresAt > new Date())
    .slice(-8);
  user.refreshTokens.push({ tokenHash, expiresAt });
  user.lastLogin = new Date();
  await user.save();

  setRefreshCookie(res, refreshToken);
  return { accessToken, user: user.toSafeJSON(), auth: payload };
}

export const register = asyncHandler(async (req, res) => {
  const {
    name,
    schoolName,
    adminName,
    adminEmail,
    adminPhone,
    password,
    subscriptionPlan,
  } = req.body || {};

  if (!name || !schoolName || !adminName || !adminEmail || !adminPhone || !password || !subscriptionPlan) {
    return res.status(400).json({ message: 'All registration fields are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const existingUser = await User.findOne({ email: String(adminEmail).toLowerCase() });
  if (existingUser) {
    if (['hall_admin', 'tenant_admin'].includes(existingUser.role) && existingUser.tenantId && (await existingUser.comparePassword(password))) {
      const existingTenant = await Tenant.findOne({ tenantId: existingUser.tenantId });
      if (existingTenant && !existingTenant.lastPaymentAt) {
        const callbackUrl = `${env.frontendUrl}/payment/callback?tenant=${existingTenant.tenantId}`;
        const payment = await initializePayment({
          email: existingTenant.adminEmail,
          tenantId: existingTenant.tenantId,
          planKey: existingTenant.subscriptionPlan,
          callbackUrl,
        });
        existingTenant.paystackReference = payment.reference;
        await existingTenant.save();
        return res.status(200).json({
          message: 'Complete Paystack payment to finish registration.',
          tenant: existingTenant,
          payment,
        });
      }
    }
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const plan = getPlan(subscriptionPlan);
  const tenantId = await uniqueTenantId(Tenant, name, schoolName);
  let joinCode = generateInviteCode(name);
  while (await Tenant.exists({ joinCode })) {
    joinCode = generateInviteCode(name);
  }
  const tenant = await Tenant.create({
    tenantId,
    name: name.trim(),
    schoolName: schoolName.trim(),
    adminName: adminName.trim(),
    adminEmail: String(adminEmail).toLowerCase().trim(),
    adminPhone: String(adminPhone).trim(),
    subscriptionPlan: plan.key,
    subscriptionFee: plan.fee,
    isActive: false,
    expiryDate: addYears(new Date(), 1),
    joinCode,
  });

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    tenantId,
    name: adminName.trim(),
    email: tenant.adminEmail,
    phone: tenant.adminPhone,
    passwordHash,
    role: 'hall_admin',
    createdByRole: 'self',
    isActive: false,
  });

  const callbackUrl = `${env.frontendUrl}/payment/callback?tenant=${tenantId}`;
  let payment = null;
  try {
    payment = await initializePayment({
      email: tenant.adminEmail,
      tenantId,
      planKey: plan.key,
      callbackUrl,
    });
    tenant.paystackReference = payment.reference;
    await tenant.save();
  } catch (err) {
    await User.deleteMany({ _id: user.id });
    await Tenant.deleteMany({ tenantId });
    err.status = err.status || 503;
    err.message = err.message || 'Paystack payment could not be started. Account was not created.';
    throw err;
  }

  track({ pillar: 'funnel', name: 'register', tenantId, value: plan.fee });
  return res.status(201).json({
    message: 'Complete Paystack payment to finish registration. A system admin will then approve your login.',
    tenant,
    payment,
  });
});

function looksLikeEmail(value) {
  return /@/.test(String(value || ''));
}

async function findTenantByHallKey(hallKey) {
  const raw = String(hallKey || '').trim();
  if (!raw) return null;
  return (
    await Tenant.findOne({ tenantId: raw.toLowerCase() })
    || await Tenant.findOne({ tenantId: raw })
    || await Tenant.findOne({ joinCode: raw.toUpperCase() })
  );
}

function staffLoginBlock(user, tenant) {
  if (!tenant) {
    return { status: 404, body: { message: 'Hall not found for this account.' } };
  }
  if (!tenant.lastPaymentAt) {
    return {
      status: 402,
      body: {
        message: 'Complete Paystack payment before this hall can be reviewed.',
        code: 'PAYMENT_REQUIRED',
        tenantId: tenant.tenantId,
      },
    };
  }
  if (!tenant.isActive) {
    return {
      status: 403,
      body: {
        message: 'Payment received. A system admin must approve this hall before you can sign in.',
        code: 'PENDING_HALL_APPROVAL',
      },
    };
  }
  if (!tenant.hasAccess()) {
    return {
      status: 403,
      body: {
        message: 'This hall subscription has expired. Renew to continue.',
        code: 'SUBSCRIPTION_EXPIRED',
      },
    };
  }
  if (!user.isActive) {
    const pending = !user.approvedAt;
    return {
      status: 403,
      body: {
        message: pending
          ? 'A system admin must approve this account before you can sign in.'
          : 'This account has been deactivated.',
        code: pending ? 'PENDING_ACCOUNT_APPROVAL' : 'ACCOUNT_INACTIVE',
      },
    };
  }
  return null;
}

export const login = asyncHandler(async (req, res) => {
  const { desk, email, password, hall, name } = req.body || {};
  const deskRole = String(desk || '').trim();
  const isPresidentDesk = deskRole === 'tenant_admin' || deskRole === 'president' || deskRole === 'hall_president';
  const isAdminDesk = deskRole === 'hall_admin' || deskRole === 'admin';

  let user = null;

  if (isPresidentDesk) {
    const hallKey = String(hall || '').trim() || String(email || '').trim();
    const presidentName = String(name || '').trim();
    if (!password) {
      return res.status(400).json({ message: 'Hall ID, president name, and password are required.' });
    }
    if (looksLikeEmail(hallKey)) {
      user = await User.findOne({ email: hallKey.toLowerCase() });
      if (
        !user
        || user.role !== 'tenant_admin'
        || !(await user.comparePassword(password))
        || (presidentName && !namesMatch(presidentName, user.name) && foldSearch(presidentName) !== foldSearch(user.name))
      ) {
        track({ pillar: 'audience', name: 'login_fail' });
        return res.status(401).json({ message: 'Invalid hall president credentials.' });
      }
    } else {
      if (!hallKey || !presidentName) {
        return res.status(400).json({ message: 'Hall ID, president name, and password are required.' });
      }
      const tenantMatch = await findTenantByHallKey(hallKey);
      if (!tenantMatch) {
        track({ pillar: 'audience', name: 'login_fail' });
        return res.status(401).json({ message: 'Invalid hall president credentials.' });
      }
      user = await findPresidentByCredentials(tenantMatch, presidentName, password);
      if (!user) {
        track({ pillar: 'audience', name: 'login_fail' });
        return res.status(401).json({ message: 'Invalid hall president credentials.' });
      }
    }
  } else {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      track({ pillar: 'audience', name: 'login_fail' });
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (isAdminDesk && user.role === 'tenant_admin') {
      return res.status(403).json({
        message: 'Select Hall president, then sign in with the hall ID, name, and password from hall administration.',
      });
    }
    if (isAdminDesk && user.role !== 'hall_admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        message: user.role === 'assistant' || user.role === 'porter'
          ? 'Use the join link for this role, not the hall administrator form.'
          : 'This account is not a hall administrator.',
      });
    }
    if (!isAdminDesk && !deskRole && user.role === 'tenant_admin') {
      // Legacy email login for existing presidents.
    }
  }

  let tenant = null;
  if (user.tenantId) {
    tenant = await Tenant.findOne({ tenantId: user.tenantId });
  }

  if (user.role === 'tenant_admin' || user.role === 'hall_admin') {
    const blocked = staffLoginBlock(user, tenant);
    if (blocked) return res.status(blocked.status).json(blocked.body);
  }

  if (!user.isActive) {
    return res.status(403).json({ message: 'This account has been deactivated.' });
  }

  const session = await issueSession(res, user);
  track({ pillar: 'audience', name: 'login_success', tenantId: user.tenantId || '', role: user.role });
  return res.json({ message: 'Signed in.', ...session, tenant });
});

export const joinAssistant = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const { name, password } = req.body || {};
  if (!name || !password) {
    return res.status(400).json({ message: 'Name and invite password are required.' });
  }

  let tenant = await Tenant.findOne({ joinCode: code });
  if (!tenant) tenant = await Tenant.findOne({ tenantId: String(req.params.code || '').toLowerCase() });

  const invites = (tenant
    ? await Invite.find({ tenantId: tenant.tenantId, isActive: true })
    : await Invite.find({ code, isActive: true })
  ).filter((row) => !isFieldQrCode(row.code));

  if (!invites.length) {
    return res.status(404).json({ message: 'This invite link is invalid or has been revoked.' });
  }

  if (!tenant) {
    tenant = await Tenant.findOne({ tenantId: invites[0].tenantId });
  }
  if (!tenant?.hasAccess()) {
    return res.status(402).json({ message: 'This hall subscription is not active.' });
  }

  const enteredName = String(name).trim();
  const namedInvites = invites.filter((row) => {
    const bound = [row.assistantName, row.label].filter(Boolean);
    return bound.some((stored) => namesMatch(enteredName, stored));
  });

  let invite = null;
  const candidates = namedInvites.length
    ? namedInvites
    : invites.filter((row) => !row.assistantName && !row.label && !row.assistantId);

  for (const row of candidates) {
    if (await bcrypt.compare(password, row.passwordHash)) {
      invite = row;
      break;
    }
  }
  if (!invite) {
    return res.status(401).json({
      message: 'That password does not match this assistant name.',
    });
  }

  let user = invite.assistantId ? await User.findById(invite.assistantId) : null;
  if (user && !user.isActive) {
    return res.status(403).json({ message: 'This assistant access has been revoked.' });
  }

  if (user && !namesMatch(enteredName, user.name) && !namesMatch(enteredName, invite.assistantName) && !namesMatch(enteredName, invite.label)) {
    return res.status(401).json({
      message: 'That password does not match this assistant name.',
    });
  }

  if (!user) {
    const passwordHash = await User.hashPassword(password);
    user = await User.create({
      tenantId: invite.tenantId,
      name: enteredName,
      passwordHash,
      role: 'assistant',
      isActive: true,
      inviteId: invite._id,
    });
    invite.assistantId = user._id;
    invite.assistantName = enteredName;
  } else if (!invite.assistantName) {
    invite.assistantName = user.name;
  }

  invite.lastUsedAt = new Date();
  await invite.save();
  await user.save();

  const session = await issueSession(res, user);
  return res.json({
    message: 'Assistant signed in.',
    ...session,
    tenant: { tenantId: tenant.tenantId, name: tenant.name, schoolName: tenant.schoolName },
    invite: { code: invite.code, label: invite.label },
  });
});

export const joinPorter = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const { name, password } = req.body || {};
  if (!name || !password) {
    return res.status(400).json({ message: 'Name and lodge password are required.' });
  }

  let tenant = await Tenant.findOne({ lodgeJoinCode: code });
  if (!tenant) tenant = await Tenant.findOne({ tenantId: String(req.params.code || '').toLowerCase() });

  const invites = tenant
    ? await PorterInvite.find({ tenantId: tenant.tenantId, isActive: true })
    : await PorterInvite.find({ code, isActive: true });

  if (!invites.length) {
    return res.status(404).json({ message: 'This lodge join link is invalid or has been revoked.' });
  }
  if (!tenant) tenant = await Tenant.findOne({ tenantId: invites[0].tenantId });
  if (!tenant?.hasAccess()) {
    return res.status(402).json({ message: 'This hall subscription is not active.' });
  }

  const enteredName = String(name).trim();
  const namedInvites = invites.filter((row) => {
    const bound = [row.porterName, row.label].filter(Boolean);
    return bound.some((stored) => namesMatch(enteredName, stored));
  });

  let invite = null;
  const candidates = namedInvites.length
    ? namedInvites
    : invites.filter((row) => !row.porterName && !row.label && !row.porterId);

  for (const row of candidates) {
    if (await bcrypt.compare(password, row.passwordHash)) {
      invite = row;
      break;
    }
  }
  if (!invite) {
    return res.status(401).json({ message: 'That password does not match this porter name.' });
  }

  let user = invite.porterId ? await User.findById(invite.porterId) : null;
  if (user && !user.isActive) {
    return res.status(403).json({ message: 'This porter access has been revoked.' });
  }
  if (user && !namesMatch(enteredName, user.name) && !namesMatch(enteredName, invite.porterName) && !namesMatch(enteredName, invite.label)) {
    return res.status(401).json({ message: 'That password does not match this porter name.' });
  }

  if (!user) {
    user = await User.create({
      tenantId: invite.tenantId,
      name: enteredName,
      passwordHash: await User.hashPassword(password),
      role: 'porter',
      isActive: true,
      inviteId: invite._id,
    });
    invite.porterId = user._id;
    invite.porterName = enteredName;
  } else if (!invite.porterName) {
    invite.porterName = user.name;
  }

  invite.lastUsedAt = new Date();
  await invite.save();
  await user.save();

  const session = await issueSession(res, user);
  return res.json({
    message: 'Porter signed in.',
    ...session,
    tenant: { tenantId: tenant.tenantId, name: tenant.name, schoolName: tenant.schoolName },
    invite: { code: invite.code, label: invite.label },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.ws_refresh;
  if (!token) {
    return res.status(401).json({ message: 'Refresh token missing.' });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (_err) {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Refresh token invalid.' });
  }

  const user = await User.findById(payload.sub);
  const tokenHash = hashToken(token);
  if (!user || !user.isActive || !user.refreshTokens.some((t) => t.tokenHash === tokenHash)) {
    clearRefreshCookie(res);
    return res.status(401).json({ message: 'Refresh token invalid.' });
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  const tenant = user.tenantId ? await Tenant.findOne({ tenantId: user.tenantId }) : null;
  const session = await issueSession(res, user);
  return res.json({ ...session, tenant });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.ws_refresh;
  if (token && req.user?._id) {
    const user = await User.findById(req.user._id);
    if (user) {
      const tokenHash = hashToken(token);
      user.refreshTokens = (user.refreshTokens || []).filter((t) => t.tokenHash !== tokenHash);
      await user.save();
    }
  }
  clearRefreshCookie(res);
  return res.json({ message: 'Signed out.' });
});

export const me = asyncHandler(async (req, res) => {
  const tenant = req.tenantId ? await Tenant.findOne({ tenantId: req.tenantId }) : null;
  return res.json({
    user: req.user.toSafeJSON(),
    tenant,
    supportMode: req.supportMode,
    auth: req.auth,
  });
});
