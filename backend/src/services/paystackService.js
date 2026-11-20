import crypto from 'crypto';
import { env } from '../config/env.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

async function paystackFetch(path, { method = 'GET', body } = {}) {
  if (!env.paystackSecret) {
    const err = new Error('Paystack is not configured. Add PAYSTACK_SECRET_KEY.');
    err.status = 503;
    throw err;
  }

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${env.paystackSecret}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    const err = new Error(data.message || 'Paystack request failed.');
    err.status = res.status >= 400 ? res.status : 502;
    throw err;
  }
  return data;
}

export async function initializePayment({
  email,
  tenantId,
  distributionId,
  studentCount,
  amountPesewas,
  callbackUrl,
}) {
  if (!Number.isSafeInteger(amountPesewas) || amountPesewas <= 0) {
    const err = new Error('Payment amount must be a positive whole number of pesewas.');
    err.status = 400;
    throw err;
  }
  const payload = {
    email,
    amount: amountPesewas,
    currency: 'GHS',
    callback_url: callbackUrl,
    metadata: {
      tenantId,
      distributionId,
      studentCount,
      amountPesewas,
      custom_fields: [
        { display_name: 'SRC', variable_name: 'tenant_id', value: tenantId },
        { display_name: 'Campaign', variable_name: 'distribution_id', value: distributionId },
        { display_name: 'Students', variable_name: 'student_count', value: studentCount },
      ],
    },
  };
  const data = await paystackFetch('/transaction/initialize', { method: 'POST', body: payload });
  return data.data;
}

export async function verifyPayment(reference) {
  const data = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data.data;
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!env.paystackSecret || !signature || !rawBody) return false;
  const hash = crypto
    .createHmac('sha512', env.paystackSecret)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}
