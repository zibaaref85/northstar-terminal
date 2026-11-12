const { json, cleanSymbol, provider, fail } = require('../finnhub');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const raw = String(req.query.symbols || 'NVDA,AAPL,MSFT,TSLA,AMZN,META');
  const symbols = [...new Set(raw.split(',').map(cleanSymbol).filter(Boolean))].slice(0, 10);
  if (!symbols.length) return json(res, 400, { error: 'invalid_symbols', message: 'Provide one or more valid ticker symbols.' });
  try {
    const settled = await Promise.allSettled(symbols.map(async symbol => {
      const q = await provider('quote', { symbol }, 15);
      if (!Number.isFinite(q.c) || q.c <= 0) return null;
      const timestamp = q.t ? new Date(q.t * 1000).toISOString() : null;
      const retrievedAt = new Date().toISOString();
      return { symbol, price: q.c, change: q.d, changePercent: q.dp, open: q.o, high: q.h, low: q.l, previousClose: q.pc, timestamp, retrievedAt, freshnessSeconds: timestamp ? Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000)) : null, source: 'Finnhub' };
    }));
    const quotes = settled.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
    if (!quotes.length && settled.some(result => result.status === 'rejected')) throw settled.find(result => result.status === 'rejected').reason;
    return json(res, 200, { mode: 'provider', source: 'Finnhub', asOf: new Date().toISOString(), quotes }, 10);
  } catch (error) { return fail(res, error); }
};
