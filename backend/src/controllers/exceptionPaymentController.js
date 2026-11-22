import { randomUUID } from 'crypto';
import { Distribution, ListException } from '../models/index.js';
import { env } from '../config/env.js';
import { getSb } from '../db/supabase.js';
import { dbError } from '../db/model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { campaignBillingQuote } from '../services/campaignBilling.js';
import {
  getActiveDistribution,
  rememberActiveDistribution,
} from '../services/activeDistribution.js';
import { findDuplicateIndex } from '../services/listService.js';
import { initializePayment } from '../services/paystackService.js';
import { track } from '../services/telemetry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAuthorizedSrc(req) {
  if (req.srcReview) {
    return Boolean(
      req.srcTenantId
      && String(req.user?.tenantId) === String(req.srcTenantId)
      && String(req.tenant?.srcTenantId) === String(req.srcTenantId)
    );
  }
  return Boolean(
    req.tenant?.subscriptionPlan === 'src'
    && String(req.user?.tenantId) === String(req.tenantId)
  );
}

function addonDbError(error) {
  if (['PGRST202', 'PGRST204', 'PGRST205', '42883', '42P01'].includes(error?.code)) {
    const err = new Error(
      'Walk-in add-on payments are not set up in Supabase yet. Run backend/supabase/walk-in-add-on-payments.sql, then retry.'
    );
    err.status = 503;
    return err;
  }
  const err = dbError(error);
  if (['23505', '23514'].includes(error?.code)) err.status = 409;
  if (error?.code === '22023') err.status = 400;
  return err;
}

function orderedIds(ids) {
  return [...ids].sort();
}

function sameIds(left, right) {
  return JSON.stringify(orderedIds(left || [])) === JSON.stringify(orderedIds(right || []));
}

function paymentPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentCount: row.studentCount,
    amountPesewas: row.amount,
    amountGhs: row.amount / 100,
    authorizationUrl: row.paymentUrl || '',
    reference: row.reference,
    status: row.status,
  };
}

async function releaseStaleReservation(row) {
  const age = Date.now() - new Date(row.createdAt || 0).getTime();
  if (row.paymentUrl || !String(row.reference || '').startsWith('init:') || age < 120_000) {
    return false;
  }
  const { error } = await getSb().rpc('cancel_campaign_addon_payment', {
    p_payment_id: row.id,
  });
  if (error) throw addonDbError(error);
  return true;
}

async function selectedDistribution(req) {
  const distributionId = req.body?.distributionId || req.query?.distributionId;
  if (distributionId) {
    return Distribution.findOne({ _id: distributionId, tenantId: req.tenantId });
  }
  return getActiveDistribution(req.tenantId);
}

export const getPendingExceptionPayment = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'tenant_admin' || !isAuthorizedSrc(req)) {
    return res.status(403).json({ message: 'Only this SRC administrator can view walk-in payments.' });
  }
  const dist = await selectedDistribution(req);
  if (!dist) return res.json({ payment: null });
  const { data, error } = await getSb()
    .from('campaign_addon_payments')
    .select('id,reference,status,exceptionIds,studentCount,amount,paymentUrl,createdAt')
    .eq('tenantId', req.tenantId)
    .eq('distributionId', dist._id)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw addonDbError(error);
  if (data && await releaseStaleReservation(data)) {
    return res.json({ payment: null, distribution: dist });
  }
  return res.json({ payment: paymentPayload(data), distribution: dist });
});

export const startExceptionPayment = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'tenant_admin' || !isAuthorizedSrc(req)) {
    return res.status(403).json({ message: 'Only the linked SRC administrator can pay for walk-in additions.' });
  }

  const ids = Array.isArray(req.body?.exceptionIds) ? req.body.exceptionIds : [];
  if (
    !ids.length
    || ids.length > 500
    || ids.some((id) => !UUID.test(String(id)))
    || new Set(ids.map(String)).size !== ids.length
  ) {
    return res.status(400).json({ message: 'Select between 1 and 500 distinct walk-in requests.' });
  }

  const dist = await selectedDistribution(req);
  if (!dist) return res.status(404).json({ message: 'No campaign was found for these requests.' });
  if (dist.status !== 'active' || dist.paymentStatus !== 'paid') {
    return res.status(409).json({ message: 'Walk-in additions require an active, already-paid campaign.' });
  }

  let { data: currentBatch, error: currentBatchError } = await getSb()
    .from('campaign_addon_payments')
    .select('id,reference,status,exceptionIds,studentCount,amount,paymentUrl,createdAt')
    .eq('tenantId', req.tenantId)
    .eq('distributionId', dist._id)
    .eq('status', 'pending')
    .maybeSingle();
  if (currentBatchError) throw addonDbError(currentBatchError);
  if (currentBatch && await releaseStaleReservation(currentBatch)) currentBatch = null;
  if (currentBatch) {
    if (sameIds(currentBatch.exceptionIds, ids) && currentBatch.paymentUrl) {
      return res.json({
        payment: {
          authorization_url: currentBatch.paymentUrl,
          reference: currentBatch.reference,
        },
        distribution: dist,
      });
    }
    return res.status(409).json({
      message: currentBatch.paymentUrl
        ? 'Another walk-in payment is already in progress for this campaign. Complete it before starting another.'
        : 'A walk-in payment is being prepared. Refresh this page in a moment.',
    });
  }

  const exceptions = await ListException.find({
    _id: { $in: ids },
    tenantId: req.tenantId,
    distributionId: dist._id,
    status: 'pending',
  });
  if (exceptions.length !== ids.length) {
    return res.status(409).json({ message: 'One or more selected requests are no longer waiting for payment.' });
  }
  for (const row of exceptions) {
    if (await findDuplicateIndex(req.tenantId, dist._id, row.studentIndex)) {
      return res.status(409).json({
        message: `${row.studentIndex} is already on the campaign list. Refresh the requests and try again.`,
      });
    }
  }

  const quote = campaignBillingQuote(exceptions.length);
  const reservationReference = `init:${randomUUID()}`;
  const { data: paymentId, error: reserveError } = await getSb().rpc('reserve_campaign_addon_payment', {
    p_tenant_id: req.tenantId,
    p_distribution_id: dist._id,
    p_exception_ids: ids,
    p_reference: reservationReference,
    p_reviewed_by: req.user._id,
    p_reviewed_by_name: req.user.name,
  });
  if (reserveError) {
    if (reserveError.code === '23505') {
      return res.status(409).json({
        message: 'Another walk-in payment started for this campaign. Refresh and try again.',
      });
    }
    throw addonDbError(reserveError);
  }

  let payment;
  try {
    payment = await initializePayment({
      email: req.user.email,
      tenantId: req.tenantId,
      distributionId: String(dist._id),
      studentCount: quote.studentCount,
      amountPesewas: quote.amountPesewas,
      callbackUrl: `${env.frontendUrl}/payment/callback?distribution=${encodeURIComponent(String(dist._id))}&type=student_additions`,
      paymentType: 'student_additions',
      addonPaymentId: paymentId,
    });
    const { data: saved, error: saveError } = await getSb()
      .from('campaign_addon_payments')
      .update({
        reference: payment.reference,
        paymentUrl: payment.authorization_url,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .eq('reference', reservationReference)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (saveError) throw addonDbError(saveError);
    if (!saved) {
      const err = new Error('The walk-in payment reservation changed before checkout could be saved. Please try again.');
      err.status = 409;
      throw err;
    }
  } catch (err) {
    const { error: cancelError } = await getSb().rpc('cancel_campaign_addon_payment', {
      p_payment_id: paymentId,
    });
    if (cancelError) console.error('Failed to release walk-in payment reservation', cancelError.message);
    throw err;
  }

  track({
    pillar: 'funnel',
    name: 'walk_in_payment_start',
    tenantId: req.tenantId,
    value: quote.amountPesewas / 100,
  });
  return res.json({
    payment,
    quote,
    distribution: dist,
  });
});

export async function applyExceptionPayment(data, reference, io) {
  const metadata = data.metadata || {};
  if (
    data.status !== 'success'
    || data.reference !== reference
    || data.currency !== 'GHS'
    || metadata.paymentType !== 'student_additions'
    || !UUID.test(String(metadata.addonPaymentId || ''))
  ) {
    return null;
  }

  const { data: batch, error: batchError } = await getSb()
    .from('campaign_addon_payments')
    .select('id,tenantId,distributionId,reference,status,studentCount,amount')
    .eq('id', metadata.addonPaymentId)
    .eq('reference', reference)
    .maybeSingle();
  if (batchError) throw addonDbError(batchError);
  if (!batch) return null;

  const correctPayment = (
    String(metadata.tenantId || '') === batch.tenantId
    && String(metadata.distributionId || '') === String(batch.distributionId)
    && Number(metadata.studentCount) === Number(batch.studentCount)
    && Number(metadata.amountPesewas) === Number(batch.amount)
    && Number(data.amount) === Number(batch.amount)
  );
  if (!correctPayment) return null;

  const { data: distributionId, error: completeError } = await getSb().rpc('complete_campaign_addon_payment', {
    p_reference: reference,
    p_tenant_id: batch.tenantId,
    p_distribution_id: batch.distributionId,
    p_student_count: batch.studentCount,
    p_amount: batch.amount,
    p_paid_at: new Date().toISOString(),
  });
  if (completeError) throw addonDbError(completeError);
  if (!distributionId) return null;

  const distribution = await Distribution.findOne({
    _id: distributionId,
    tenantId: batch.tenantId,
  });
  if (!distribution) return null;
  rememberActiveDistribution(batch.tenantId, distribution);
  const approved = await ListException.find({ addonPaymentId: batch.id });
  for (const row of approved) {
    io?.to(`tenant:${batch.tenantId}`).emit('exception:updated', {
      exception: {
        id: String(row._id),
        status: row.status,
        requestedBy: String(row.requestedBy),
        fullName: row.fullName,
        studentIndex: row.studentIndex,
        beneficiaryId: String(row.beneficiaryId || ''),
      },
    });
  }
  track({
    pillar: 'funnel',
    name: 'walk_in_payment_success',
    tenantId: batch.tenantId,
    value: batch.amount / 100,
  });
  return distribution;
}

export async function releaseFailedExceptionPayment(data, reference, io) {
  const metadata = data.metadata || {};
  if (
    !['failed', 'abandoned'].includes(data.status)
    || metadata.paymentType !== 'student_additions'
    || !UUID.test(String(metadata.addonPaymentId || ''))
  ) return false;

  const { data: batch, error: batchError } = await getSb()
    .from('campaign_addon_payments')
    .select('id,tenantId,distributionId,reference,status')
    .eq('id', metadata.addonPaymentId)
    .eq('reference', reference)
    .eq('status', 'pending')
    .maybeSingle();
  if (batchError) throw addonDbError(batchError);
  if (!batch) return false;

  const reserved = await ListException.find({ addonPaymentId: batch.id });
  const { error: cancelError } = await getSb().rpc('cancel_campaign_addon_payment', {
    p_payment_id: batch.id,
  });
  if (cancelError) throw addonDbError(cancelError);
  for (const row of reserved) {
    io?.to(`tenant:${batch.tenantId}`).emit('exception:updated', {
      exception: {
        id: String(row._id),
        status: 'pending',
        requestedBy: String(row.requestedBy),
        fullName: row.fullName,
        studentIndex: row.studentIndex,
      },
    });
  }
  return true;
}
