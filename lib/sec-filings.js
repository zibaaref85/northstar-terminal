const cache = new Map();
const SEC_BASE = 'https://www.sec.gov';
const DATA_BASE = 'https://data.sec.gov';

function secHeaders() {
  const userAgent = String(process.env.SEC_USER_AGENT || '').trim();
  if (userAgent.length < 12 || !/\S+@\S+\.\S+/.test(userAgent)) return null;
  return { 'User-Agent': userAgent, Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' };
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('sec_unavailable');
  return response.json();
}

async function recentFilings(symbol) {
  const headers = secHeaders();
  if (!headers) {
    const error = new Error('SEC contact User-Agent is not configured.');
    error.statusCode = 503;
    error.code = 'sec_user_agent_not_configured';
    throw error;
  }
  const now = Date.now(), cached = cache.get(symbol);
  if (cached && cached.expiresAt > now) return cached.data;
  let tickerMap = cache.get('__ticker_map__');
  if (!tickerMap || tickerMap.expiresAt <= now) {
    const rows = await getJson(`${SEC_BASE}/files/company_tickers.json`, headers);
    const map = new Map();
    for (const row of Object.values(rows || {})) {
      const ticker = String(row.ticker || '').toUpperCase();
      const cik = String(row.cik_str || '').padStart(10, '0');
      if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker) && /^\d{10}$/.test(cik)) map.set(ticker, cik);
    }
    tickerMap = { data: map, expiresAt: now + 86400000 };
    cache.set('__ticker_map__', tickerMap);
  }
  const cik = tickerMap.data.get(symbol);
  if (!cik) return [];
  const submissions = await getJson(`${DATA_BASE}/submissions/CIK${cik}.json`, headers);
  const recent = submissions?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) return [];
  const allowed = new Set(['10-K', '10-Q', '8-K', '20-F', '6-K', 'DEF 14A']);
  const filings = [];
  for (let i = 0; i < recent.form.length && filings.length < 12; i++) {
    const form = String(recent.form[i] || '');
    const accession = String(recent.accessionNumber?.[i] || '');
    const document = String(recent.primaryDocument?.[i] || '');
    const filedDate = String(recent.filingDate?.[i] || '');
    if (!allowed.has(form) || !/^\d{4}-\d{2}-\d{2}$/.test(filedDate) || !/^\d{10}-\d{2}-\d{6}$/.test(accession) || !/^[A-Za-z0-9_.-]+$/.test(document)) continue;
    filings.push({
      symbol,
      form,
      filedDate,
      accessionNumber: accession,
      title: `${form} filing`,
      url: `${SEC_BASE}/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/${document}`,
      source: 'SEC EDGAR',
      retrievedAt: new Date().toISOString(),
    });
  }
  cache.set(symbol, { data: filings, expiresAt: now + 600000 });
  return filings;
}

module.exports = { recentFilings };
