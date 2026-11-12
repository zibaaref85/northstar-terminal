const { json } = require('../../lib/server-security');
const { recentFilings } = require('../sec-filings');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) return json(res, 400, { error: 'invalid_symbol' });
  try {
    const filings = await recentFilings(symbol);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end(JSON.stringify({ source: 'SEC EDGAR', symbol, retrievedAt: new Date().toISOString(), filings }));
  } catch (error) {
    const status = Number(error.statusCode) || 502;
    return json(res, status, { error: error.code || 'filings_unavailable', message: status === 503 ? error.message : 'SEC filing data is temporarily unavailable.' });
  }
};
