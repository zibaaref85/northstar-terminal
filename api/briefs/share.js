const crypto = require('node:crypto');
const { json, authenticate, serviceRequest, hashToken, appOrigin, sharingReady } = require('../../lib/server-security');

function sanitizeBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const symbol = String(input.symbol || '').toUpperCase();
  const capturedAt = new Date(input.capturedAt || '');
  const price = Number(input.price);
  const changePercent = Number(input.changePercent);
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) || !Number.isFinite(price) || price < 0 || price > 1e9 || !Number.isFinite(changePercent) || Math.abs(changePercent) > 1000 || Number.isNaN(capturedAt.getTime())) return null;
  const news = Array.isArray(input.news) ? input.news.slice(0, 5).map(item => {
    const url = String(item.url || '');
    let safeUrl = null;
    try { const parsed = new URL(url); if (parsed.protocol === 'https:') safeUrl = parsed.href; } catch (_) {}
    return {
      headline: String(item.headline || '').slice(0, 280),
      source: String(item.source || 'Source unavailable').slice(0, 80),
      timestamp: String(item.timestamp || '').slice(0, 40),
      url: safeUrl,
    };
  }) : [];
  return {
    symbol,
    company: String(input.company || symbol).slice(0, 100),
    price,
    changePercent,
    range: ['1D', '1W', '1M', '1Y', 'ALL'].includes(String(input.range)) ? String(input.range) : '1W',
    dataMode: input.dataMode === 'provider' ? 'provider' : 'sample',
    source: input.dataMode === 'provider' ? String(input.source || 'Market data provider').slice(0, 80) : 'Northstar illustrative sample',
    capturedAt: capturedAt.toISOString(),
    news,
  };
}

module.exports = async function handler(req, res) {
  try {
    if (!sharingReady()) return json(res, 503, { error: 'sharing_not_ready' });
    const origin = appOrigin();
    if (!origin) return json(res, 503, { error: 'sharing_not_configured' });
    if (req.method === 'GET') {
      const token = String(req.query.token || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(res, 404, { error: 'brief_not_found' });
      const hash = hashToken(token);
      const query = new URLSearchParams({ select: 'snapshot,expires_at', token_hash: `eq.${hash}`, expires_at: `gt.${new Date().toISOString()}`, revoked_at: 'is.null', limit: '1' });
      const rows = await serviceRequest(`/rest/v1/shared_briefs?${query.toString()}`);
      if (!Array.isArray(rows) || !rows.length) return json(res, 404, { error: 'brief_not_found' });
      return json(res, 200, { brief: rows[0].snapshot, expiresAt: rows[0].expires_at });
    }
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'authentication_required' });
    if (req.method === 'POST') {
      const brief = sanitizeBrief(req.body && req.body.brief);
      if (!brief) return json(res, 400, { error: 'invalid_brief' });
      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const created = await serviceRequest('/rest/v1/shared_briefs', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [{ owner_id: user.id, token_hash: hashToken(token), snapshot: brief, expires_at: expiresAt }],
      });
      const shareId = Array.isArray(created) ? created[0]?.id : null;
      if (!shareId) return json(res, 503, { error: 'sharing_temporarily_unavailable' });
      return json(res, 201, { shareId, url: `${origin}/brief.html?token=${encodeURIComponent(token)}`, expiresAt });
    }
    if (req.method === 'DELETE') {
      const shareId = String(req.body && req.body.shareId || '');
      if (!/^[0-9a-f-]{36}$/i.test(shareId)) return json(res, 400, { error: 'invalid_share_id' });
      const query = new URLSearchParams({ id: `eq.${shareId}`, owner_id: `eq.${user.id}` });
      await serviceRequest(`/rest/v1/shared_briefs?${query.toString()}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { revoked_at: new Date().toISOString() } });
      return json(res, 200, { revoked: true });
    }
    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE' });
  } catch (_) { return json(res, 503, { error: 'sharing_temporarily_unavailable' }); }
};
