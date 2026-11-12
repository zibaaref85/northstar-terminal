const { json, authenticate, serviceRequest, appOrigin } = require('../../lib/server-security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const origin = appOrigin();
  if (!origin || String(req.headers.origin || '') !== origin) return json(res, 403, { error: 'same_origin_required' });
  if (process.env.NORTHSTAR_LEGAL_APPROVED !== 'true' || !process.env.NORTHSTAR_TERMS_VERSION || !process.env.NORTHSTAR_PRIVACY_VERSION || !process.env.SUPABASE_SECRET_KEY) {
    return json(res, 503, { error: 'policy_renewal_not_ready' });
  }
  if (req.body?.termsAccepted !== true || req.body?.privacyAcknowledged !== true || req.body?.financialInformationAcknowledged !== true) {
    return json(res, 400, { error: 'all_acknowledgements_required' });
  }
  try {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'authentication_required' });
    const policies = await serviceRequest('/rest/v1/legal_policy_config?select=terms_version,privacy_version,approved&singleton=eq.true&limit=1');
    const policy = Array.isArray(policies) ? policies[0] : null;
    if (!policy?.approved || policy.terms_version !== process.env.NORTHSTAR_TERMS_VERSION || policy.privacy_version !== process.env.NORTHSTAR_PRIVACY_VERSION) {
      return json(res, 503, { error: 'policy_versions_not_synchronized' });
    }
    await serviceRequest('/rest/v1/user_consents', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: [{ user_id: user.id, terms_version: policy.terms_version, privacy_version: policy.privacy_version, financial_information_acknowledged: true, capture_method: 'policy_renewal', accepted_at: new Date().toISOString() }],
    });
    return json(res, 201, { accepted: true, termsVersion: policy.terms_version, privacyVersion: policy.privacy_version });
  } catch (_) { return json(res, 503, { error: 'policy_renewal_temporarily_unavailable' }); }
};
