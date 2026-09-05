import path from 'path';
import { Collection, Distribution, Tenant, User, Beneficiary, SheetUpload, SystemEvent } from '../models/index.js';
import { addYears } from '../utils/codes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { storedUploadPath, storedFileExists, workbookFromBeneficiaries } from '../utils/uploads.js';

function sendExcel(res, buffer, filename) {
  const safe = String(filename || 'list.xlsx').replace(/[^\w.\- ()]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  return res.send(buffer);
}

export const overview = asyncHandler(async (req, res) => {
  const tenants = await Tenant.find().sort({ createdAt: -1 });
  const now = new Date();
  const active = tenants.filter((t) => t.isActive && t.expiryDate > now);
  const inactive = tenants.filter((t) => !t.isActive);
  const expired = tenants.filter((t) => t.isActive && t.expiryDate <= now);
  const revenue = tenants
    .filter((t) => t.isActive || t.lastPaymentAt)
    .reduce((sum, t) => sum + (t.subscriptionFee || 0), 0);
  const uploadCount = await SheetUpload.countDocuments();

  res.json({
    kpis: {
      totalTenants: tenants.length,
      active: active.length,
      inactive: inactive.length,
      expired: expired.length,
      revenue,
      uploads: uploadCount,
    },
    tenants,
  });
});

export const listUploads = asyncHandler(async (req, res) => {
  const [files, distributions, tenants] = await Promise.all([
    SheetUpload.find().sort({ createdAt: -1 }).lean(),
    Distribution.find({ beneficiaryCount: { $gt: 0 } })
      .select('tenantId title originalFileName storedFileName beneficiaryCount createdAt updatedAt')
      .lean(),
    Tenant.find().select('tenantId name schoolName').lean(),
  ]);
  const halls = new Map(tenants.map((t) => [t.tenantId, t]));
  const covered = new Set(files.map((f) => String(f.distributionId)));

  const uploads = files.map((f) => {
    const hall = halls.get(f.tenantId);
    return {
      id: String(f._id),
      kind: 'file',
      tenantId: f.tenantId,
      hallName: f.tenantName || hall?.name || f.tenantId,
      schoolName: f.schoolName || hall?.schoolName || '',
      distributionId: f.distributionId,
      distributionTitle: f.distributionTitle,
      originalFileName: f.originalFileName,
      createdAt: f.createdAt,
    };
  });

  distributions.forEach((d) => {
    if (covered.has(String(d._id))) return;
    const hall = halls.get(d.tenantId);
    uploads.push({
      id: String(d._id),
      kind: 'distribution',
      tenantId: d.tenantId,
      hallName: hall?.name || d.tenantId,
      schoolName: hall?.schoolName || '',
      distributionId: d._id,
      distributionTitle: d.title,
      originalFileName: d.originalFileName || `${d.title}.xlsx`,
      createdAt: d.updatedAt || d.createdAt,
    });
  });

  uploads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ uploads });
});

export const downloadUpload = asyncHandler(async (req, res) => {
  const file = await SheetUpload.findById(req.params.id);
  if (!file) return res.status(404).json({ message: 'Upload not found.' });
  if (!(await storedFileExists(file.storedFileName))) {
    return downloadDistributionExcelById(file.distributionId, res, file.originalFileName);
  }
  return res.download(storedUploadPath(file.storedFileName), file.originalFileName);
});

async function downloadDistributionExcelById(distributionId, res, fallbackName) {
  const dist = await Distribution.findById(distributionId);
  if (!dist) return res.status(404).json({ message: 'Distribution not found.' });

  if (dist.storedFileName && (await storedFileExists(dist.storedFileName))) {
    return res.download(
      storedUploadPath(dist.storedFileName),
      dist.originalFileName || fallbackName || `${dist.title}.xlsx`
    );
  }

  const latest = await SheetUpload.findOne({ distributionId: dist._id }).sort({ createdAt: -1 });
  if (latest && (await storedFileExists(latest.storedFileName))) {
    return res.download(
      storedUploadPath(latest.storedFileName),
      latest.originalFileName || dist.originalFileName || `${dist.title}.xlsx`
    );
  }

  const beneficiaries = await Beneficiary.find({ distributionId: dist._id }).sort({ fullName: 1 });
  const buffer = workbookFromBeneficiaries(dist.sheetHeaders, beneficiaries);
  const filename = dist.originalFileName || fallbackName || `${dist.title}.xlsx`;
  const asXlsx = path.extname(filename).toLowerCase() === '.xlsx' ? filename : `${dist.title}.xlsx`;
  return sendExcel(res, buffer, asXlsx);
}

export const downloadDistributionExcel = asyncHandler(async (req, res) => {
  return downloadDistributionExcelById(req.params.id, res);
});

export const getTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ tenantId: req.params.tenantId });
  if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

  const [admins, assistants, distributions, collections, uploads] = await Promise.all([
    User.find({ tenantId: tenant.tenantId, role: 'tenant_admin' }).select('-passwordHash -refreshTokens'),
    User.find({ tenantId: tenant.tenantId, role: 'assistant' }).select('-passwordHash -refreshTokens'),
    Distribution.find({ tenantId: tenant.tenantId }).sort({ createdAt: -1 }),
    Collection.countDocuments({ tenantId: tenant.tenantId }),
    SheetUpload.find({ tenantId: tenant.tenantId }).sort({ createdAt: -1 }),
  ]);

  res.json({ tenant, admins, assistants, distributions, collectionCount: collections, uploads });
});

export const setTenantActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body || {};
  const tenant = await Tenant.findOne({ tenantId: req.params.tenantId });
  if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

  const wantActive = Boolean(isActive);
  if (wantActive && !tenant.lastPaymentAt) {
    return res.status(400).json({
      message: 'This hall has not completed Paystack payment yet. Approval is only available after payment.',
    });
  }

  tenant.isActive = wantActive;
  if (tenant.isActive && (!tenant.expiryDate || tenant.expiryDate < new Date())) {
    tenant.expiryDate = addYears(new Date(), 1);
  }
  await tenant.save();

  const admins = await User.find({ tenantId: tenant.tenantId, role: 'tenant_admin' });
  for (const admin of admins) {
    admin.isActive = wantActive;
    if (!wantActive) admin.refreshTokens = [];
    await admin.save();
  }

  res.json({
    tenant,
    message: tenant.isActive
      ? 'Hall approved. The hall admin can now sign in.'
      : 'Hall deactivated. Hall admin logins are blocked.',
  });
});

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBack(n) {
  const today = startOfDay(new Date());
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d);
  }
  return out;
}

function dayKey(date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function dayLabel(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short' });
}

function deltaPct(curr, prev) {
  if (!prev) return curr ? 100 : 0;
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
}

function seriesFrom(days, pick) {
  return days.map((d) => {
    const row = pick(d);
    return {
      key: dayKey(d),
      label: dayLabel(d),
      date: d.toISOString(),
      ...row,
    };
  });
}

export const systemAnalysis = asyncHandler(async (req, res) => {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const days14 = daysBack(14);
  const days7 = daysBack(7);

  const [
    tenants,
    users,
    collections,
    distributions,
    uploads,
    events14d,
  ] = await Promise.all([
    Tenant.find().lean(),
    User.find().select('role tenantId createdAt lastLogin isActive').lean(),
    Collection.find().select('tenantId collectedAt').lean(),
    Distribution.find().select('tenantId beneficiaryCount receivedCount status createdAt').lean(),
    SheetUpload.countDocuments(),
    SystemEvent.find({ createdAt: { $gte: prevWeekAgo } }).lean(),
  ]);

  const events24h = events14d.filter((e) => new Date(e.createdAt) >= dayAgo);
  const events7d = events14d.filter((e) => new Date(e.createdAt) >= weekAgo);
  const eventsPrev7 = events14d.filter((e) => {
    const t = new Date(e.createdAt);
    return t < weekAgo && t >= prevWeekAgo;
  });

  const apiCalls = events24h.filter((e) => e.name === 'api_call');
  const okCalls = apiCalls.filter((e) => e.status >= 200 && e.status < 400);
  const clientErr = apiCalls.filter((e) => e.status >= 400 && e.status < 500).length;
  const serverErr = apiCalls.filter((e) => e.status >= 500).length;
  const http404 = events24h.filter((e) => e.name === 'http_404' || e.status === 404).length;
  const http500 = events24h.filter((e) => e.name === 'http_500' || e.status >= 500).length;
  const jsErrors = events24h.filter((e) => e.name === 'js_error');
  const payOk = events24h.filter((e) => e.name === 'paystack_success').length;
  const payFail = events24h.filter((e) => e.name === 'paystack_fail').length;
  const lcp = events7d.filter((e) => e.name === 'web_vital' && e.metric === 'lcp').map((e) => e.value);
  const fid = events7d.filter((e) => e.name === 'web_vital' && e.metric === 'fid').map((e) => e.value);

  const pageViews = events7d.filter((e) => e.name === 'page_view');
  const viewsByPath = {};
  pageViews.forEach((e) => {
    const p = e.path || '/';
    viewsByPath[p] = (viewsByPath[p] || 0) + 1;
  });
  const topPaths = Object.entries(viewsByPath)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, count]) => ({ path, count }));

  const searches = events7d.filter((e) => e.name === 'site_search' && e.term);
  const terms = {};
  searches.forEach((e) => {
    const t = e.term.toLowerCase();
    terms[t] = (terms[t] || 0) + 1;
  });
  const topSearches = Object.entries(terms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term, count]) => ({ term, count }));

  const engaged = pageViews.filter((e) => e.value >= 10 || e.metric === 'engaged').length;
  const engagementRate = pct(engaged || Math.max(0, pageViews.length - 1), pageViews.length || 1);

  const registered = tenants.length;
  const paid = tenants.filter((t) => t.isActive || t.lastPaymentAt).length;
  const withList = distributions.filter((d) => d.beneficiaryCount > 0).length;
  const hallsWithList = new Set(distributions.filter((d) => d.beneficiaryCount > 0).map((d) => d.tenantId)).size;
  const hallsWithCollection = new Set(collections.map((c) => c.tenantId)).size;
  const revenue = tenants
    .filter((t) => t.isActive || t.lastPaymentAt)
    .reduce((s, t) => s + (t.subscriptionFee || 0), 0);
  const collectionsToday = collections.filter((c) => c.collectedAt && new Date(c.collectedAt) >= dayAgo).length;
  const pendingNow = distributions.reduce((s, d) => s + Math.max(0, (d.beneficiaryCount || 0) - (d.receivedCount || 0)), 0);
  const receivedNow = distributions.reduce((s, d) => s + (d.receivedCount || 0), 0);

  const newHalls = tenants.filter((t) => t.createdAt && new Date(t.createdAt) >= weekAgo).length;
  const returningLogins = events7d.filter((e) => e.name === 'login_success').length;
  const loginFails = events7d.filter((e) => e.name === 'login_fail').length;

  const bySchool = {};
  tenants.forEach((t) => {
    const s = t.schoolName || 'Unknown';
    bySchool[s] = (bySchool[s] || 0) + 1;
  });
  const schools = Object.entries(bySchool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const byPlan = {
    hall: tenants.filter((t) => t.subscriptionPlan === 'hall').length,
    src: tenants.filter((t) => t.subscriptionPlan === 'src').length,
  };

  const devices = { desktop: 0, mobile: 0 };
  const browsers = { chrome: 0, safari: 0, firefox: 0, edge: 0, other: 0 };
  events7d.forEach((e) => {
    if (e.device === 'mobile') devices.mobile += 1;
    else if (e.device === 'desktop') devices.desktop += 1;
    if (e.browser && browsers[e.browser] != null) browsers[e.browser] += 1;
    else if (e.browser) browsers.other += 1;
  });

  const active = tenants.filter((t) => t.isActive && t.expiryDate && new Date(t.expiryDate) > now);
  const expired = tenants.filter((t) => t.isActive && t.expiryDate && new Date(t.expiryDate) <= now);
  const inactive = tenants.filter((t) => !t.isActive);

  const prevApi = eventsPrev7.filter((e) => e.name === 'api_call');
  const prevOk = prevApi.filter((e) => e.status >= 200 && e.status < 400).length;
  const prevViews = eventsPrev7.filter((e) => e.name === 'page_view').length;
  const prevLogins = eventsPrev7.filter((e) => e.name === 'login_success').length;
  const prevCollect = collections.filter((c) => {
    const t = new Date(c.collectedAt);
    return t < weekAgo && t >= prevWeekAgo;
  }).length;
  const currCollect = collections.filter((c) => c.collectedAt && new Date(c.collectedAt) >= weekAgo).length;

  const healthSeries = seriesFrom(days14, (d) => {
    const start = d.getTime();
    const end = start + 86400000;
    const calls = events14d.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return e.name === 'api_call' && t >= start && t < end;
    });
    const ok = calls.filter((e) => e.status >= 200 && e.status < 400).length;
    const errors = calls.filter((e) => e.status >= 400).length;
    return {
      calls: calls.length,
      errors,
      avgMs: avg(calls.map((e) => e.durationMs).filter(Boolean)),
      successRate: pct(ok, calls.length),
    };
  });

  const viewSeries = seriesFrom(days14, (d) => {
    const start = d.getTime();
    const end = start + 86400000;
    const views = events14d.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return e.name === 'page_view' && t >= start && t < end;
    }).length;
    const searchHits = events14d.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return e.name === 'site_search' && t >= start && t < end;
    }).length;
    return { views, searches: searchHits };
  });

  const collectSeries = seriesFrom(days14, (d) => {
    const start = d.getTime();
    const end = start + 86400000;
    const count = collections.filter((c) => {
      const t = new Date(c.collectedAt).getTime();
      return t >= start && t < end;
    }).length;
    const halls = tenants.filter((hall) => {
      const t = new Date(hall.createdAt).getTime();
      return t >= start && t < end;
    }).length;
    const logins = events14d.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return e.name === 'login_success' && t >= start && t < end;
    }).length;
    return { collections: count, halls, logins };
  });

  const weekStrip = seriesFrom(days7, (d) => {
    const start = d.getTime();
    const end = start + 86400000;
    const isToday = dayKey(d) === dayKey(now);
    return {
      isToday,
      weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayNumber: d.getDate(),
      collections: collections.filter((c) => {
        const t = new Date(c.collectedAt).getTime();
        return t >= start && t < end;
      }).length,
      errors: events14d.filter((e) => {
        const t = new Date(e.createdAt).getTime();
        return e.status >= 500 && t >= start && t < end;
      }).length,
      views: events14d.filter((e) => {
        const t = new Date(e.createdAt).getTime();
        return e.name === 'page_view' && t >= start && t < end;
      }).length,
    };
  });

  const slowPaths = {};
  apiCalls.forEach((e) => {
    if (!e.path) return;
    if (!slowPaths[e.path]) slowPaths[e.path] = { path: e.path, total: 0, n: 0, errors: 0 };
    slowPaths[e.path].total += e.durationMs || 0;
    slowPaths[e.path].n += 1;
    if (e.status >= 400) slowPaths[e.path].errors += 1;
  });
  const endpoints = Object.values(slowPaths)
    .map((row) => ({ path: row.path, avgMs: Math.round(row.total / Math.max(1, row.n)), errors: row.errors, calls: row.n }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 6);

  res.json({
    generatedAt: now,
    window: { hours24: true, days7: true, days14: true },
    kpis: {
      totalTenants: tenants.length,
      active: active.length,
      inactive: inactive.length,
      expired: expired.length,
      revenue,
      uploads,
    },
    health: {
      apiCalls: apiCalls.length,
      successRate: pct(okCalls.length, apiCalls.length),
      successDelta: deltaPct(pct(okCalls.length, apiCalls.length), pct(prevOk, prevApi.length)),
      avgResponseMs: avg(apiCalls.map((e) => e.durationMs).filter(Boolean)),
      http404,
      http500,
      jsErrors: jsErrors.length,
      jsErrorSamples: jsErrors.slice(0, 6).map((e) => ({ message: e.message, path: e.path, at: e.createdAt })),
      paystackSuccess: payOk,
      paystackFail: payFail,
      paystackSuccessRate: pct(payOk, payOk + payFail),
      lcpMs: avg(lcp),
      fidMs: avg(fid),
      statusMix: {
        success: okCalls.length,
        client: clientErr,
        server: serverErr,
      },
      series: healthSeries,
      weekStrip,
      endpoints,
    },
    behavior: {
      pageViews: pageViews.length,
      pageViewDelta: deltaPct(pageViews.length, prevViews),
      engagementRate,
      topPaths,
      topSearches,
      searchCount: searches.length,
      series: viewSeries,
      weekStrip,
    },
    funnel: {
      registered,
      paid,
      hallsWithList,
      hallsWithCollection,
      registerToPay: pct(paid, registered),
      payToList: pct(hallsWithList, paid || registered),
      listToCollect: pct(hallsWithCollection, hallsWithList || paid || registered),
      overallConversion: pct(hallsWithCollection, registered),
      conversionDelta: deltaPct(currCollect, prevCollect),
      revenue,
      aov: paid ? Math.round(revenue / paid) : 0,
      collectionsToday,
      receivedNow,
      pendingNow,
      withList,
      stages: [
        { name: 'Register', value: registered },
        { name: 'Pay', value: paid },
        { name: 'Upload list', value: hallsWithList },
        { name: 'Collect', value: hallsWithCollection },
      ],
      series: collectSeries,
      weekStrip,
    },
    audience: {
      newHalls7d: newHalls,
      returningHalls: Math.max(0, tenants.length - newHalls),
      logins7d: returningLogins,
      loginDelta: deltaPct(returningLogins, prevLogins),
      loginFails7d: loginFails,
      assistants: users.filter((u) => u.role === 'assistant' && u.isActive).length,
      presidents: users.filter((u) => u.role === 'tenant_admin' && u.isActive).length,
      byPlan,
      schools,
      devices,
      browsers,
      series: collectSeries,
      weekStrip,
    },
    tenants,
  });
});
