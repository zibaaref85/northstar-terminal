const { json, authenticate, serviceRequest, appOrigin } = require('../../lib/server-security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const origin = appOrigin();
  if (process.env.BILLING_ENABLED !== 'true' || process.env.NORTHSTAR_LEGAL_APPROVED !== 'true' || process.env.MARKET_DATA_DISPLAY_RIGHTS_CONFIRMED !== 'true' || !process.env.MARKET_DATA_LICENSE_ID || !process.env.FINNHUB_API_KEY || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PLUS_PRICE_ID || !process.env.SUPABASE_SECRET_KEY || !origin) {
    return json(res, 503, { error: 'billing_not_ready' });
  }
  try {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'authentication_required' });
    const consentQuery = new URLSearchParams({ select: 'terms_version,privacy_version,financial_information_acknowledged', user_id: `eq.${user.id}`, order: 'accepted_at.desc', limit: '5' });
    const consents = await serviceRequest(`/rest/v1/user_consents?${consentQuery.toString()}`);
    const currentConsent = Array.isArray(consents) && consents.some(row => row.terms_version === process.env.NORTHSTAR_TERMS_VERSION && row.privacy_version === process.env.NORTHSTAR_PRIVACY_VERSION && row.financial_information_acknowledged === true);
    if (!currentConsent) return json(res, 403, { error: 'current_policy_consent_required' });
    const entitlementQuery = new URLSearchParams({ select: 'tier,status,stripe_customer_id', user_id: `eq.${user.id}`, limit: '1' });
    const entitlements = await serviceRequest(`/rest/v1/user_entitlements?${entitlementQuery.toString()}`);
    if (Array.isArray(entitlements) && entitlements.some(row => row.tier === 'plus' && ['active', 'trialing'].includes(row.status))) return json(res, 409, { error: 'subscription_already_active' });
    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': process.env.STRIPE_PLUS_PRICE_ID,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      'subscription_data[metadata][northstar_user_id]': user.id,
      'metadata[northstar_user_id]': user.id,
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
    });
    if (user.email) params.set('customer_email', user.email);
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params,
      signal: AbortSignal.timeout(9000),
    });
    const session = await response.json();
    if (!response.ok || !session.url) return json(res, 502, { error: 'checkout_unavailable' });
    return json(res, 200, { url: session.url });
  } catch (_) { return json(res, 503, { error: 'checkout_temporarily_unavailable' }); }
};
