const { json, cleanSymbol, provider, fail } = require('../finnhub');

function tone(headline) {
  const text = String(headline || '').toLowerCase();
  const positive = /beats|beat estimates|surge|surges|soars|record|upgrade|raises outlook|profit rises|growth accelerates|strong demand|rally|approval/.test(text);
  const negative = /misses|miss estimates|falls|slumps|plunge|downgrade|cuts outlook|loss widens|investigation|lawsuit|recall|weak demand|selloff/.test(text);
  return positive === negative ? 'Neutral' : positive ? 'Bullish' : 'Bearish';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const symbol = cleanSymbol(req.query.symbol);
  if (!symbol) return json(res, 400, { error: 'invalid_symbol', message: 'Provide a valid ticker symbol.' });
  const to = new Date(), from = new Date(Date.now() - 3 * 86400000);
  const retrievedAt = to.toISOString();
  const day = d => d.toISOString().slice(0, 10);
  try {
    const items = await provider('company-news', { symbol, from: day(from), to: day(to) }, 300);
    const news = (Array.isArray(items) ? items : []).slice(0, 20).map(item => ({
      headline: item.headline || '', summary: item.summary || '', source: item.source || 'News wire',
      url: /^https?:\/\//i.test(item.url || '') ? item.url : null,
      image: /^https?:\/\//i.test(item.image || '') ? item.image : null,
      timestamp: item.datetime ? new Date(item.datetime * 1000).toISOString() : null,
      sentiment: tone(item.headline), symbol, provider: 'Finnhub', retrievedAt,
    }));
    return json(res, 200, { mode: 'provider', symbol, source: 'Finnhub', retrievedAt, news }, 120);
  } catch (error) { return fail(res, error); }
};
