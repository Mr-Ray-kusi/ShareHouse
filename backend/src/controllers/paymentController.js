import { randomUUID } from 'crypto';
import { Beneficiary, CampaignPayment, Distribution, Tenant } from '../models/index.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { track } from '../services/telemetry.js';
import {
  campaignBillingQuote,
  clearCampaignPayment,
  activatePaidCampaign,
} from '../services/campaignBilling.js';
import {
  initializePayment,
  verifyPayment,
  verifyWebhookSignature,
} from '../services/paystackService.js';
import { getSb } from '../db/supabase.js';
import { dbError } from '../db/model.js';

function campaignBillingDbError(error) {
  const missingBillingSchema = (
    ['PGRST204', 'PGRST205', '42703', '42P01'].includes(error?.code)
    && /paymentStatus|paymentAmount|paymentStudentCount|paymentReference|paymentUrl|paymentPaidAt|campaign_payments|schema cache/i
      .test(`${error?.message || ''} ${error?.details || ''}`)
  );
  if (!missingBillingSchema) return dbError(error);

  const err = new Error(
    'Campaign payment is not set up in Supabase yet. Run backend/supabase/campaign-billing.sql in the Supabase SQL Editor, then try again.'
  );
  err.status = 503;
  return err;
}

export const startPayment = asyncHandler(async (req, res) => {
  const dist = await Distribution.findOne({
    _id: req.params.distributionId,
    tenantId: req.tenantId,
  });
  if (!dist) return res.status(404).json({ message: 'Distribution not found.' });

  const studentCount = await Beneficiary.countDocuments({
    tenantId: req.tenantId,
    distributionId: dist._id,
  });
  if (!studentCount) {
    return res.status(400).json({ message: 'Upload a student list before paying to activate this campaign.' });
  }
  const billing = campaignBillingQuote(studentCount);
  const amountPesewas = billing.amountPesewas;
  if (dist.paymentStatus === 'paid' && dist.paymentStudentCount === studentCount && dist.paymentAmount === amountPesewas) {
    return res.json({ distribution: dist, alreadyPaid: true });
  }
  if (dist.status === 'active' && dist.paymentStudentCount !== studentCount) {
    return res.status(409).json({
      message: 'This campaign is already active. Complete it before changing its paid student count.',
    });
  }
  if (dist.paymentStatus === 'pending') {
    if (dist.paymentStudentCount !== studentCount || dist.paymentAmount !== amountPesewas) {
      return res.status(409).json({
        message: 'The pending payment no longer matches this list. Contact support before trying again.',
      });
    }
    if (dist.paymentUrl) {
      return res.json({
        payment: { authorization_url: dist.paymentUrl, reference: dist.paymentReference },
        distribution: dist,
      });
    }
    if (Date.now() - new Date(dist.updatedAt || 0).getTime() < 120_000) {
      return res.status(409).json({
        message: 'Campaign payment is being initialized. Wait a moment and try again.',
      });
    }
    clearCampaignPayment(dist);
    await dist.save();
  }
  if (dist.paymentStatus === 'paid') {
    clearCampaignPayment(dist);
    await dist.save();
  }

  const reservationReference = `init:${randomUUID()}`;
  const { data: reserved, error: reserveError } = await getSb()
    .from('distributions')
    .update({
      paymentStatus: 'pending',
      paymentAmount: amountPesewas,
      paymentStudentCount: studentCount,
      paymentReference: reservationReference,
      paymentUrl: '',
      paymentPaidAt: null,
      beneficiaryCount: studentCount,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', dist._id)
    .eq('tenantId', req.tenantId)
    .eq('paymentStatus', 'unpaid')
    .select()
    .maybeSingle();
  if (reserveError) throw campaignBillingDbError(reserveError);
  if (!reserved) {
    const latest = await Distribution.findOne({ _id: dist._id, tenantId: req.tenantId });
    if (
      latest?.paymentStatus === 'pending'
      && latest.paymentStudentCount === studentCount
      && latest.paymentAmount === amountPesewas
      && latest.paymentUrl
    ) {
      return res.json({
        payment: { authorization_url: latest.paymentUrl, reference: latest.paymentReference },
        distribution: latest,
      });
    }
    return res.status(409).json({
      message: 'Another campaign payment started at the same time. Refresh and try again.',
    });
  }

  const callbackUrl = `${env.frontendUrl}/payment/callback?distribution=${encodeURIComponent(String(dist._id))}`;
  let payment;
  try {
    payment = await initializePayment({
      email: req.user.email,
      tenantId: req.tenantId,
      distributionId: String(dist._id),
      studentCount,
      amountPesewas,
      callbackUrl,
    });
  } catch (err) {
    const { error } = await getSb()
      .from('distributions')
      .update({
        paymentStatus: 'unpaid',
        paymentAmount: 0,
        paymentStudentCount: 0,
        paymentReference: '',
        paymentUrl: '',
        paymentPaidAt: null,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', dist._id)
      .eq('paymentReference', reservationReference);
    if (error) console.error('Failed to release campaign payment reservation', error.message);
    throw err;
  }
  const { data: saved, error } = await getSb()
    .from('distributions')
    .update({
      paymentStatus: 'pending',
      paymentAmount: amountPesewas,
      paymentStudentCount: studentCount,
      paymentReference: payment.reference,
      paymentUrl: payment.authorization_url,
      paymentPaidAt: null,
      beneficiaryCount: studentCount,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', dist._id)
    .eq('tenantId', req.tenantId)
    .eq('paymentStatus', 'pending')
    .eq('paymentReference', reservationReference)
    .select()
    .maybeSingle();
  if (error) throw campaignBillingDbError(error);
  if (!saved) {
    const latest = await Distribution.findOne({ _id: dist._id, tenantId: req.tenantId });
    if (
      latest?.paymentStatus === 'pending'
      && latest.paymentStudentCount === studentCount
      && latest.paymentAmount === amountPesewas
      && latest.paymentUrl
    ) {
      return res.json({
        payment: { authorization_url: latest.paymentUrl, reference: latest.paymentReference },
        distribution: latest,
      });
    }
    return res.status(409).json({
      message: 'Another campaign payment started at the same time. Refresh and try again.',
    });
  }
  track({
    pillar: 'funnel',
    name: 'payment_start',
    tenantId: req.tenantId,
    value: amountPesewas / 100,
  });
  const updated = await Distribution.findOne({ _id: dist._id, tenantId: req.tenantId });
  return res.json({ payment, distribution: updated });
});

async function applyCampaignPayment(data, reference) {
  const dist = await Distribution.findOne({ paymentReference: reference });
  if (!dist) return null;
  if (dist.paymentStatus === 'paid') return dist;
  if (dist.paymentStatus !== 'pending') return null;

  const metadata = data.metadata || {};
  const correctPayment = (
    data.status === 'success'
    && data.reference === reference
    && data.currency === 'GHS'
    && Number(data.amount) === Number(dist.paymentAmount)
    && String(metadata.tenantId || '') === dist.tenantId
    && String(metadata.distributionId || '') === String(dist._id)
    && Number(metadata.studentCount) === Number(dist.paymentStudentCount)
    && Number(metadata.amountPesewas) === Number(dist.paymentAmount)
  );
  if (!correctPayment) return null;

  const currentCount = await Beneficiary.countDocuments({
    tenantId: dist.tenantId,
    distributionId: dist._id,
  });
  if (currentCount !== dist.paymentStudentCount) return null;

  const paidAt = new Date();
  try {
    await CampaignPayment.create({
      tenantId: dist.tenantId,
      distributionId: dist._id,
      reference,
      studentCount: dist.paymentStudentCount,
      amount: dist.paymentAmount,
      currency: 'GHS',
      paidAt,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const recorded = await CampaignPayment.findOne({ reference });
    if (
      !recorded
      || recorded.tenantId !== dist.tenantId
      || String(recorded.distributionId) !== String(dist._id)
      || recorded.amount !== dist.paymentAmount
    ) {
      throw err;
    }
  }

  dist.paymentStatus = 'paid';
  dist.paymentPaidAt = paidAt;
  dist.paymentUrl = '';
  await dist.save();
  const activated = await activatePaidCampaign(dist);
  track({
    pillar: 'funnel',
    name: 'payment_success',
    tenantId: dist.tenantId,
    value: dist.paymentAmount / 100,
  });
  track({ pillar: 'health', name: 'paystack_success', tenantId: dist.tenantId });
  return activated;
}

export const verify = asyncHandler(async (req, res) => {
  const reference = String(req.query.reference || req.body?.reference || '').trim();
  if (!reference) {
    return res.status(400).json({ message: 'Payment reference is required.' });
  }

  const data = await verifyPayment(reference);
  if (data.status !== 'success') {
    track({ pillar: 'health', name: 'paystack_fail', message: data.status || 'failed' });
    return res.status(400).json({ message: 'Payment was not successful.' });
  }

  const distribution = await applyCampaignPayment(data, reference);
  if (!distribution) {
    return res.status(400).json({
      message: 'This payment does not match a pending campaign and its current student list.',
    });
  }
  return res.json({
    message: distribution.status === 'active'
      ? 'Payment confirmed. The campaign is now active.'
      : 'Payment confirmed. This campaign has since been replaced by another campaign.',
    distribution,
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
    const distribution = await applyCampaignPayment(data, String(data.reference || ''));
    if (distribution) {
      const io = req.app.get('io');
      io?.to(`tenant:${distribution.tenantId}`).emit('campaign:paid', {
        tenantId: distribution.tenantId,
        distributionId: String(distribution._id),
        status: distribution.status,
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
