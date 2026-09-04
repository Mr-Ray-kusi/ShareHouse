import crypto from 'crypto';
import { env, getPlan } from '../config/env.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

async function paystackFetch(path, { method = 'GET', body } = {}) {
  if (!env.paystackSecret) {
    const err = new Error('Paystack is not configured. Add PAYSTACK_SECRET_KEY.');
    err.status = 503;
    throw err;
  }

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
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

export async function initializePayment({ email, tenantId, planKey, callbackUrl }) {
  const plan = getPlan(planKey);
  const amountPesewas = plan.fee * 100;
  const payload = {
    email,
    amount: amountPesewas,
    currency: 'GHS',
    callback_url: callbackUrl,
    metadata: {
      tenantId,
      plan: planKey,
      custom_fields: [
        { display_name: 'Hall / SRC', variable_name: 'tenant_id', value: tenantId },
        { display_name: 'Plan', variable_name: 'plan', value: planKey },
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
