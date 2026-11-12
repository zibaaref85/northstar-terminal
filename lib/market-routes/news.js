const { json, cleanSymbol, provider, fail } = require('../finnhub');

function tone(headline) {
  const text = String(headline || '').toLowerCase();
  const positive = /beats|beat estimates|surge|surges|soars|record|upgrade|raises outlook|profit rises|growth accelerates|strong demand|rally|approval/.test(text);
  const negative = /misses|miss estimates|falls|slumps|plunge|downgrade|cuts outlook|loss widens|investigation|lawsuit|recall|weak demand|selloff/.test(text);
  return positive === negative ? 'Neutral' : positive ? 'Bullish' : 'Bearish';
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password && url.href.length <= 2048 ? url.href : null;
  } catch (_) {
    return null;
  }
}

function publishedAt(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 253402300799) return null;
  try { return new Date(seconds * 1000).toISOString(); } catch (_) { return null; }
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
    const news = (Array.isArray(items) ? items : []).slice(0, 20).filter(item => item && typeof item === 'object').map(item => {
      const headline = String(item.headline || '').slice(0, 280);
      return {
        headline, summary: String(item.summary || '').slice(0, 1200), source: String(item.source || 'News wire').slice(0, 80),
        url: safeHttpsUrl(item.url),
        image: safeHttpsUrl(item.image),
        timestamp: publishedAt(item.datetime),
        sentiment: tone(headline), symbol, provider: 'Finnhub', retrievedAt,
      };
    });
    return json(res, 200, { mode: 'provider', symbol, source: 'Finnhub', retrievedAt, news }, 120);
  } catch (error) { return fail(res, error); }
};
