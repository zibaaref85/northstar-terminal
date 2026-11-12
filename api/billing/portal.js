const { json, authenticate, serviceRequest, appOrigin } = require('../../lib/server-security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const origin = appOrigin();
  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SECRET_KEY || !origin) return json(res, 503, { error: 'billing_not_ready' });
  try {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'authentication_required' });
    const query = new URLSearchParams({ select: 'stripe_customer_id', user_id: `eq.${user.id}`, limit: '1' });
    const rows = await serviceRequest(`/rest/v1/user_entitlements?${query.toString()}`);
    const customer = Array.isArray(rows) ? rows[0] && rows[0].stripe_customer_id : null;
    if (!customer) return json(res, 404, { error: 'billing_customer_not_found' });
    const params = new URLSearchParams({ customer, return_url: `${origin}/` });
    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params, signal: AbortSignal.timeout(9000),
    });
    const session = await response.json();
    if (!response.ok || !session.url) return json(res, 502, { error: 'billing_portal_unavailable' });
    return json(res, 200, { url: session.url });
  } catch (_) { return json(res, 503, { error: 'billing_portal_temporarily_unavailable' }); }
};
