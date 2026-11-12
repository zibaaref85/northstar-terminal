const crypto = require('node:crypto');

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function getBearer(req) {
  const value = String(req.headers.authorization || '');
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(value);
  return match ? match[1] : null;
}

function supabaseSettings() {
  return {
    url: String(process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    secretKey: process.env.SUPABASE_SECRET_KEY || '',
  };
}

function sharingReady() {
  const { url, publishableKey, secretKey } = supabaseSettings();
  const validSupabaseSettings = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && publishableKey.length > 20 && !!secretKey;
  return process.env.SHARING_ENABLED === 'true' &&
    validSupabaseSettings &&
    process.env.NORTHSTAR_LEGAL_APPROVED === 'true' &&
    !!process.env.NORTHSTAR_TERMS_VERSION &&
    !!process.env.NORTHSTAR_PRIVACY_VERSION &&
    process.env.MARKET_DATA_DISPLAY_RIGHTS_CONFIRMED === 'true' &&
    !!process.env.MARKET_DATA_LICENSE_ID &&
    !!process.env.FINNHUB_API_KEY &&
    process.env.SHARING_CONTENT_RIGHTS_CONFIRMED === 'true' &&
    !!process.env.SHARING_CONTENT_LICENSE_ID &&
    !!process.env.SUPABASE_SECRET_KEY;
}

async function authenticate(req) {
  const token = getBearer(req);
  const { url, publishableKey } = supabaseSettings();
  if (!token || !url || !publishableKey) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user && /^[0-9a-f-]{36}$/i.test(user.id || '') ? { id: user.id, email: user.email || null, token } : null;
}

async function serviceRequest(path, options = {}) {
  const { url, secretKey } = supabaseSettings();
  if (!url || !secretKey) throw new Error('server_service_unavailable');
  const requestBody = options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body;
  const response = await fetch(`${url}${path}`, {
    ...options,
    body: requestBody,
    headers: {
      apikey: secretKey,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(9000),
  });
  const text = await response.text();
  let responseBody = null;
  try { responseBody = text ? JSON.parse(text) : null; } catch (_) {}
  if (!response.ok) {
    const error = new Error('server_service_request_failed');
    error.status = response.status;
    throw error;
  }
  return responseBody;
}

function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function appOrigin() {
  const value = process.env.NORTHSTAR_APP_ORIGIN || 'https://northstar-market-intelligence-zeta.vercel.app';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch (_) { return null; }
}

module.exports = { json, authenticate, serviceRequest, hashToken, appOrigin, supabaseSettings, sharingReady };
