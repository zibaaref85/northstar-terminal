const crypto = require('node:crypto');
const { json, serviceRequest } = require('../../lib/server-security');

function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  if (req.body && typeof req.body === 'object') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) { reject(new Error('payload_too_large')); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, header, secret) {
  const fields = String(header || '').split(',').map(part => part.split('='));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !signatures.length) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest();
  return signatures.some(value => {
    if (!/^[a-f0-9]{64}$/i.test(value)) return false;
    const supplied = Buffer.from(value, 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
}

function periodEnd(subscription) {
  const itemEnd = subscription.items?.data?.[0]?.current_period_end;
  const value = Number(itemEnd || subscription.current_period_end || 0);
  return value ? new Date(value * 1000).toISOString() : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  if (process.env.BILLING_ENABLED !== 'true' || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.SUPABASE_SECRET_KEY) return json(res, 503, { error: 'billing_webhook_not_ready' });
  try {
    const rawBody = await readRawBody(req);
    if (!rawBody || !verifySignature(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return json(res, 400, { error: 'invalid_signature' });
    const event = JSON.parse(rawBody.toString('utf8'));
    if (!event.id || !event.type) return json(res, 400, { error: 'invalid_event' });
    const priorQuery = new URLSearchParams({ select: 'processing_status', event_id: `eq.${event.id}`, limit: '1' });
    const prior = await serviceRequest(`/rest/v1/stripe_webhook_events?${priorQuery.toString()}`);
    if (Array.isArray(prior) && prior[0]?.processing_status === 'processed') return json(res, 200, { received: true });
    await serviceRequest('/rest/v1/stripe_webhook_events?on_conflict=event_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ event_id: event.id, event_type: event.type, processing_status: 'pending', received_at: new Date().toISOString(), failure_code: null }],
    });

    if (event.type.startsWith('customer.subscription.')) {
      const subscription = event.data?.object;
      const customerId = typeof subscription?.customer === 'string' ? subscription.customer : subscription?.customer?.id;
      const metadataUser = subscription?.metadata?.northstar_user_id;
      let userId = /^[0-9a-f-]{36}$/i.test(metadataUser || '') ? metadataUser : null;
      if (!userId && customerId) {
        const customerQuery = new URLSearchParams({ select: 'user_id', stripe_customer_id: `eq.${customerId}`, limit: '1' });
        const mapped = await serviceRequest(`/rest/v1/user_entitlements?${customerQuery.toString()}`);
        userId = Array.isArray(mapped) ? mapped[0]?.user_id : null;
      }
      if (userId) {
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : String(subscription.status || 'inactive');
        const tier = ['active', 'trialing'].includes(status) ? 'plus' : 'free';
        await serviceRequest('/rest/v1/user_entitlements?on_conflict=user_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: [{ user_id: userId, tier, status: ['active', 'trialing', 'past_due', 'canceled'].includes(status) ? status : 'inactive', stripe_customer_id: customerId || null, stripe_subscription_id: subscription.id || null, current_period_end: periodEnd(subscription), updated_at: new Date().toISOString() }],
        });
      }
    }
    const eventQuery = new URLSearchParams({ event_id: `eq.${event.id}` });
    await serviceRequest(`/rest/v1/stripe_webhook_events?${eventQuery.toString()}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { processing_status: 'processed', processed_at: new Date().toISOString(), failure_code: null } });
    return json(res, 200, { received: true });
  } catch (_) { return json(res, 500, { error: 'webhook_processing_failed' }); }
};

module.exports.config = { api: { bodyParser: false } };
