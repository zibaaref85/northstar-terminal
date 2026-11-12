const BASE_URL = 'https://finnhub.io/api/v1';
const cache = new Map();

function json(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}` : 'no-store');
  res.end(JSON.stringify(body));
}

function cleanSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return /^(?:\^)?[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) ? symbol : null;
}

async function provider(path, params, ttlSeconds = 20) {
  if (process.env.MARKET_DATA_DISPLAY_RIGHTS_CONFIRMED !== 'true' || !process.env.MARKET_DATA_LICENSE_ID) {
    const error = new Error('Commercial display rights are not configured. Northstar is in sample-data mode.');
    error.statusCode = 503;
    error.code = 'display_rights_not_confirmed';
    throw error;
  }
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    const error = new Error('Market data is not configured yet.');
    error.statusCode = 503;
    error.code = 'provider_not_configured';
    throw error;
  }
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('token', apiKey);
  const cacheKey = url.pathname + '?' + [...url.searchParams.entries()].filter(([k]) => k !== 'token').sort().map(([k, v]) => `${k}=${v}`).join('&');
  const current = Date.now();
  const found = cache.get(cacheKey);
  if (found && found.expires > current) return found.data;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'Market data provider rate limit reached.' : 'Market data provider request failed.');
    error.statusCode = response.status === 429 ? 429 : 502;
    error.code = response.status === 429 ? 'provider_rate_limited' : 'provider_error';
    throw error;
  }
  const data = await response.json();
  if (data && data.error) {
    const error = new Error('Market data provider returned an error.');
    error.statusCode = 502;
    error.code = 'provider_error';
    throw error;
  }
  cache.set(cacheKey, { data, expires: current + ttlSeconds * 1000 });
  if (cache.size > 500) for (const [key, item] of cache) if (item.expires <= current) cache.delete(key);
  return data;
}

function fail(res, error) {
  const status = Number(error.statusCode) || 502;
  json(res, status, { error: error.code || 'market_data_unavailable', message: status === 503 ? error.message : 'Market data is temporarily unavailable.' });
}

module.exports = { json, cleanSymbol, provider, fail };
