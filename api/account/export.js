const { json, authenticate, supabaseSettings } = require('../../lib/server-security');

const TABLES = {
  profiles: ['id=eq.', '*'],
  watchlists: ['user_id=eq.', '*'],
  watchlist_items: ['user_id=eq.', '*'],
  portfolio_positions: ['user_id=eq.', '*'],
  price_alerts: ['user_id=eq.', '*'],
  user_consents: ['user_id=eq.', '*'],
  user_entitlements: ['user_id=eq.', '*'],
  shared_briefs: ['owner_id=eq.', 'id,snapshot,created_at,expires_at,revoked_at'],
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  try {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'authentication_required' });
    const { url, publishableKey } = supabaseSettings();
    const entries = await Promise.all(Object.entries(TABLES).map(async ([table, [filter, columns]]) => {
      const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(columns)}&${filter}${encodeURIComponent(user.id)}`;
      const response = await fetch(endpoint, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${user.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) {
        if (response.status === 404) return [table, []];
        throw new Error('export_unavailable');
      }
      return [table, await response.json()];
    }));
    return json(res, 200, { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email }, data: Object.fromEntries(entries) });
  } catch (_) { return json(res, 503, { error: 'export_temporarily_unavailable' }); }
};
