const { sharingReady } = require('../lib/server-security');

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ configured: false }));
  }

  const url = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
  const configured = validUrl && publishableKey.length > 20;
  const termsVersion = process.env.NORTHSTAR_TERMS_VERSION || '';
  const privacyVersion = process.env.NORTHSTAR_PRIVACY_VERSION || '';
  const legalApproved = process.env.NORTHSTAR_LEGAL_APPROVED === 'true' && !!termsVersion && !!privacyVersion;
  const signupEnabled = legalApproved && !!process.env.SUPABASE_SECRET_KEY;
  const marketDataAuthorized = process.env.MARKET_DATA_DISPLAY_RIGHTS_CONFIRMED === 'true' && !!process.env.MARKET_DATA_LICENSE_ID && !!process.env.FINNHUB_API_KEY;
  const sharingEnabled = sharingReady();
  const billingEnabled = legalApproved && marketDataAuthorized && process.env.BILLING_ENABLED === 'true' && !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PLUS_PRICE_ID && !!process.env.STRIPE_WEBHOOK_SECRET && !!process.env.SUPABASE_SECRET_KEY;
  const billingPortalEnabled = !!process.env.STRIPE_SECRET_KEY && !!process.env.SUPABASE_SECRET_KEY;
  res.statusCode = 200;
  return res.end(JSON.stringify(configured ? {
    configured: true,
    url,
    publishableKey,
    legal: {
      signup: { enabled: signupEnabled, termsVersion: signupEnabled ? termsVersion : null, privacyVersion: signupEnabled ? privacyVersion : null },
      accountDeletionEnabled: !!process.env.SUPABASE_SECRET_KEY,
      sharing: { enabled: sharingEnabled },
      billing: { enabled: billingEnabled, portalEnabled: billingPortalEnabled },
      googleOAuthEnabled: false,
    },
    marketData: { mode: marketDataAuthorized ? 'provider' : 'sample', source: marketDataAuthorized ? 'Finnhub' : null },
  } : { configured: false, legal: { signup: { enabled: false }, accountDeletionEnabled: false, sharing: { enabled: false }, billing: { enabled: false, portalEnabled: false }, googleOAuthEnabled: false }, marketData: { mode: 'sample' } }));
};
