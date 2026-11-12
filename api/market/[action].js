const routes = {
  candles: require('../../lib/market-routes/candles'),
  filings: require('../../lib/market-routes/filings'),
  news: require('../../lib/market-routes/news'),
  quotes: require('../../lib/market-routes/quotes'),
  search: require('../../lib/market-routes/search'),
};

module.exports = function handler(req, res) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const route = routes[action];
  if (!route) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: 'route_not_found' }));
  }
  return route(req, res);
};
