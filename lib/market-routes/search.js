const { json, provider, fail } = require('../finnhub');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const query = String(req.query.q || '').trim().slice(0, 40);
  if (query.length < 1) return json(res, 200, { results: [] }, 30);
  try {
    const data = await provider('search', { q: query }, 60);
    const seen = new Set();
    const results = (data.result || []).filter(item => {
      const symbol = String(item.displaySymbol || item.symbol || '').toUpperCase();
      if (item.type !== 'Common Stock' || !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) || seen.has(symbol)) return false;
      seen.add(symbol); return true;
    }).slice(0, 7).map(item => ({ symbol: String(item.displaySymbol || item.symbol).toUpperCase(), name: item.description || item.symbol }));
    return json(res, 200, { source: 'Finnhub', retrievedAt: new Date().toISOString(), results }, 30);
  } catch (error) { return fail(res, error); }
};
