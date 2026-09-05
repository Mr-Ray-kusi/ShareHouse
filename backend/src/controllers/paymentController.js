import { Tenant } from '../models/index.js';
import { env } from '../config/env.js';
import { addYears } from '../utils/codes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { track } from '../services/telemetry.js';
import {
  initializePayment,
  verifyPayment,
  verifyWebhookSignature,
} from '../services/paystackService.js';

async function markPaid(tenant, extra = {}) {
  const alreadyPaid = Boolean(tenant.lastPaymentAt);
  const alreadyApproved = Boolean(tenant.isActive);
  tenant.expiryDate = addYears(new Date(), 1);
  tenant.lastPaymentAt = new Date();
  if (extra.customerCode) tenant.paystackCustomerCode = extra.customerCode;
  if (extra.reference) tenant.paystackReference = extra.reference;
  if (alreadyPaid || alreadyApproved) {
    tenant.isActive = true;
  }
  await tenant.save();
  return tenant;
}

export const startPayment = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ tenantId: req.tenantId });
  if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

  const callbackUrl = `${env.frontendUrl}/payment/callback?tenant=${tenant.tenantId}`;
  const payment = await initializePayment({
    email: tenant.adminEmail,
    tenantId: tenant.tenantId,
    planKey: tenant.subscriptionPlan,
    callbackUrl,
  });
  tenant.paystackReference = payment.reference;
  await tenant.save();
  track({ pillar: 'funnel', name: 'payment_start', tenantId: tenant.tenantId, value: tenant.subscriptionFee });
  return res.json({ payment, tenant });
});

export const verify = asyncHandler(async (req, res) => {
  const reference = req.query.reference || req.body?.reference;
  if (!reference) {
    return res.status(400).json({ message: 'Payment reference is required.' });
  }

  const data = await verifyPayment(reference);
  if (data.status !== 'success') {
    track({ pillar: 'health', name: 'paystack_fail', message: data.status || 'failed' });
    return res.status(400).json({ message: 'Payment was not successful.', data });
  }

  const tenantId = data.metadata?.tenantId;
  const tenant = tenantId
    ? await Tenant.findOne({ tenantId })
    : await Tenant.findOne({ paystackReference: reference });

  if (!tenant) {
    return res.status(404).json({ message: 'No hall matched this payment.' });
  }

  await markPaid(tenant, {
    customerCode: data.customer?.customer_code,
    reference: data.reference,
  });
  track({ pillar: 'funnel', name: 'payment_success', tenantId: tenant.tenantId, value: tenant.subscriptionFee });
  track({ pillar: 'health', name: 'paystack_success', tenantId: tenant.tenantId });

  return res.json({
    message: tenant.isActive
      ? 'Subscription renewed for one year.'
      : 'Payment received. A system admin must approve this hall before you can sign in.',
    tenant,
    pendingApproval: !tenant.isActive,
  });
});

export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const raw = req.rawBody;
  if (!verifyWebhookSignature(raw, signature)) {
    return res.status(401).json({ message: 'Invalid Paystack signature.' });
  }

  const event = req.body;
  if (event?.event === 'charge.success') {
    const data = event.data || {};
    const tenantId = data.metadata?.tenantId;
    const tenant = tenantId
      ? await Tenant.findOne({ tenantId })
      : await Tenant.findOne({ paystackReference: data.reference });

    if (tenant && data.status === 'success') {
      await markPaid(tenant, {
        customerCode: data.customer?.customer_code,
        reference: data.reference,
      });
      const io = req.app.get('io');
      io?.to(`tenant:${tenant.tenantId}`).emit('tenant:paid', {
        tenantId: tenant.tenantId,
        expiryDate: tenant.expiryDate,
        pendingApproval: !tenant.isActive,
      });
    }
  }

  return res.json({ received: true });
});

export const publicTenantStatus = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ tenantId: req.params.tenantId }).select(
    'tenantId name schoolName isActive expiryDate subscriptionPlan'
  );
  if (!tenant) return res.status(404).json({ message: 'Hall not found.' });
  return res.json({ tenant });
});
