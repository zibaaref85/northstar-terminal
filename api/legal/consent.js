const crypto = require('node:crypto');
const { json, serviceRequest, hashToken, appOrigin } = require('../../lib/server-security');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const origin = appOrigin();
  if (!origin || String(req.headers.origin || '') !== origin) return json(res, 403, { error: 'same_origin_required' });
  if (process.env.NORTHSTAR_LEGAL_APPROVED !== 'true' || !process.env.NORTHSTAR_TERMS_VERSION || !process.env.NORTHSTAR_PRIVACY_VERSION) return json(res, 503, { error: 'signup_not_open' });
  const body = req.body || {};
  if (body.termsAccepted !== true || body.privacyAcknowledged !== true || body.financialInformationAcknowledged !== true) return json(res, 400, { error: 'all_acknowledgements_required' });
  try {
    const rows = await serviceRequest('/rest/v1/legal_policy_config?select=terms_version,privacy_version,approved&singleton=eq.true&limit=1');
    const policy = Array.isArray(rows) ? rows[0] : null;
    if (!policy || !policy.approved || policy.terms_version !== process.env.NORTHSTAR_TERMS_VERSION || policy.privacy_version !== process.env.NORTHSTAR_PRIVACY_VERSION) return json(res, 503, { error: 'policy_versions_not_synchronized' });
    const token = crypto.randomBytes(32).toString('base64url');
    const acceptedAt = new Date();
    const expiresAt = new Date(acceptedAt.getTime() + 10 * 60 * 1000);
    const expired = new URLSearchParams({ expires_at: `lt.${acceptedAt.toISOString()}` });
    await serviceRequest(`/rest/v1/signup_consent_tokens?${expired.toString()}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await serviceRequest('/rest/v1/signup_consent_tokens', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: [{ token_hash: hashToken(token), terms_version: policy.terms_version, privacy_version: policy.privacy_version, financial_information_acknowledged: true, accepted_at: acceptedAt.toISOString(), expires_at: expiresAt.toISOString() }],
    });
    return json(res, 201, { consentTokenHash: hashToken(token), expiresAt: expiresAt.toISOString() });
  } catch (_) { return json(res, 503, { error: 'consent_service_unavailable' }); }
};
