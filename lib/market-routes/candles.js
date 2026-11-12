const { json, cleanSymbol, provider, fail } = require('../finnhub');

const ranges = {
  '1D': { resolution: '5', span: 1, unit: 'day' },
  '1W': { resolution: '30', span: 7, unit: 'day' },
  '1M': { resolution: 'D', span: 32, unit: 'day' },
  '1Y': { resolution: 'W', span: 370, unit: 'day' },
  'ALL': { resolution: 'M', span: 8, unit: 'year' },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const symbol = cleanSymbol(req.query.symbol);
  const range = ranges[String(req.query.range || '1W').toUpperCase()];
  if (!symbol || !range) return json(res, 400, { error: 'invalid_request', message: 'Provide a valid symbol and range.' });
  const to = Math.floor(Date.now() / 1000);
  const from = to - range.span * (range.unit === 'year' ? 365 : 86400);
  try {
    const c = await provider('stock/candle', { symbol, resolution: range.resolution, from: String(from), to: String(to) }, 60);
    if (c.s !== 'ok' || !Array.isArray(c.t)) return json(res, 404, { error: 'history_unavailable', message: 'Historical candles are not available for this symbol and range.' });
    const candles = c.t.map((time, i) => ({ time, open: c.o[i], high: c.h[i], low: c.l[i], close: c.c[i], volume: c.v[i] || 0 })).filter(candle => [candlesafe(candle.open), candlesafe(candle.high), candlesafe(candle.low), candlesafe(candle.close)].every(Boolean));
    return json(res, 200, { mode: 'provider', symbol, range: String(req.query.range || '1W').toUpperCase(), source: 'Finnhub', retrievedAt: new Date().toISOString(), candles }, 30);
  } catch (error) { return fail(res, error); }
};

function candlesafe(value) { return Number.isFinite(value); }
